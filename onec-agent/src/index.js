/**
 * Локальний агент DTS на сервері 1С.
 * - localhost HTTP: /health, /status, POST /run
 * - node-cron 08:00 / 12:00 / 16:00 → окремий процес --once (як Test-Once.bat)
 * - node src/index.js --once  — разовий цикл без HTTP-сервера
 */
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const automation = require('./automation');
const { runPipeline } = require('./pipeline');
const { getAgentRoot, loadConfig, getAgentTempDir } = require('./paths');
const { spawnOnceRun } = require('./spawnOnce');

const AGENT_BUILD = '2026-06-19-ps1-encoding-fix';

const config = loadConfig();
const onceMode = process.argv.includes('--once');

function parseTriggerArg() {
  const arg = process.argv.find((a) => a.startsWith('--trigger='));
  if (arg) return arg.slice('--trigger='.length).trim() || 'manual';
  return onceMode ? 'manual' : null;
}

const status = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  fileName: null,
  trigger: null,
  importSummary: null,
  error: null,
  automationAvailable: automation.isAvailable(),
  packaged: !!process.pkg,
  agentRoot: getAgentRoot(),
  log: [],
  childPid: null,
};

let activeChild = null;

function pushLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  status.log.push(line);
  if (status.log.length > 200) status.log.shift();
  console.log(line);
}

function formatServerTime(tz) {
  try {
    return new Date().toLocaleString('uk-UA', { timeZone: tz || undefined });
  } catch (_) {
    return new Date().toLocaleString('uk-UA');
  }
}

async function triggerRun(trigger) {
  if (status.state === 'running') {
    return { started: false, reason: 'Уже виконується' };
  }
  status.state = 'running';
  status.trigger = trigger;
  status.startedAt = new Date().toISOString();
  status.finishedAt = null;
  status.fileName = null;
  status.importSummary = null;
  status.error = null;
  status.childPid = null;
  status.log = [];
  pushLog(`Запуск циклу (${trigger}).`);

  return runPipeline(config, pushLog, trigger)
    .then((res) => {
      status.fileName = res.fileName;
      status.importSummary = res.summary;
      status.state = 'done';
      status.finishedAt = new Date().toISOString();
      pushLog('Цикл завершено успішно.');
      return res;
    })
    .catch((err) => {
      status.state = 'error';
      status.error = err.message;
      status.finishedAt = new Date().toISOString();
      pushLog(`ПОМИЛКА: ${err.message}`);
      throw err;
    });
}

function triggerRunViaSpawn(trigger) {
  if (status.state === 'running' || activeChild) {
    console.log(`[cron] Пропуск — цикл уже виконується (${trigger}).`);
    return { started: false, reason: 'Уже виконується' };
  }

  status.state = 'running';
  status.trigger = trigger;
  status.startedAt = new Date().toISOString();
  status.finishedAt = null;
  status.fileName = null;
  status.importSummary = null;
  status.error = null;
  status.log = [];
  pushLog(`Запуск циклу (${trigger}) — окремий процес як Test-Once.`);

  activeChild = spawnOnceRun(trigger, {
    onLine: (line) => {
      if (/^\[\d{4}-/.test(line)) {
        status.log.push(line);
        if (status.log.length > 200) status.log.shift();
        console.log(line);
      } else {
        pushLog(line);
      }
      const m = line.match(/OK:\s*(.+)$/);
      if (m) status.fileName = m[1].trim();
      if (line.includes('FAIL:')) status.error = line.replace(/^.*FAIL:\s*/, '').trim();
    },
    onExit: (code, spawnErr) => {
      activeChild = null;
      status.childPid = null;
      status.finishedAt = new Date().toISOString();
      if (spawnErr) {
        status.state = 'error';
        status.error = spawnErr.message;
        pushLog(`ПОМИЛКА spawn: ${spawnErr.message}`);
        return;
      }
      if (code === 0) {
        status.state = 'done';
        pushLog('Цикл завершено успішно (spawn).');
      } else {
        status.state = 'error';
        if (!status.error) status.error = `Процес завершився з кодом ${code}`;
        pushLog(`ПОМИЛКА: ${status.error}`);
      }
    },
  });

  status.childPid = activeChild.pid || null;
  return { started: true };
}

async function runOnceCli() {
  const trigger = parseTriggerArg() || 'manual';
  const label = trigger === 'schedule' ? 'розклад' : 'разовий запуск';
  console.log(`DTS 1С-агент (${label}). Папка: ${getAgentRoot()}`);
  try {
    const res = await triggerRun(trigger);
    console.log('OK:', res.fileName);
    process.exit(0);
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exit(1);
  }
}

function startHttpServer() {
  const app = express();
  app.use(express.json());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const allowed = config.allowedOrigins || [];
        if (allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
    })
  );

  function checkAgentToken(req, res, next) {
    if (!config.agentToken) return next();
    const tok = req.get('x-agent-token') || req.query.token;
    if (tok !== config.agentToken) {
      return res.status(401).json({ error: 'Невірний agent token' });
    }
    next();
  }

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      automationAvailable: automation.isAvailable(),
      nutError: automation.nutError(),
      scheduleEnabled: !!config.schedule?.enabled,
      state: status.state,
      packaged: status.packaged,
      agentRoot: status.agentRoot,
      serverTime: formatServerTime(config.schedule?.timezone),
      agentBuild: AGENT_BUILD,
      tempDir: getAgentTempDir(),
    });
  });

  app.get('/status', checkAgentToken, (req, res) => {
    res.json({
      ...status,
      serverTime: formatServerTime(config.schedule?.timezone),
    });
  });

  app.post('/run', checkAgentToken, async (req, res) => {
    if (status.state === 'running') {
      return res.json({ started: false, reason: 'Уже виконується', state: status.state });
    }
    const useSpawn = config.schedule?.spawnLikeTest !== false;
    if (useSpawn) {
      triggerRunViaSpawn('manual');
    } else {
      triggerRun('manual').catch(() => {});
    }
    res.json({ started: true, state: status.state });
  });

  const port = config.port || 8765;
  const host = config.host || '127.0.0.1';
  const tz = config.schedule?.timezone;

  app.listen(port, host, () => {
    console.log(`DTS 1С-агент слухає http://${host}:${port}`);
    console.log(`Збірка: ${AGENT_BUILD}`);
    console.log(`Temp: ${getAgentTempDir()}`);
    console.log(`Папка: ${getAgentRoot()}${process.pkg ? ' (exe)' : ''}`);
    console.log(`Час сервера (${tz || 'локальний'}): ${formatServerTime(tz)}`);
    console.log(`Автоматизація: ${automation.isAvailable() ? 'так' : 'НІ (' + automation.nutError() + ')'}`);

    if (config.schedule?.enabled) {
      const raw = config.schedule.crons ?? config.schedule.cron;
      const expressions = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
      const valid = [];
      for (const expr of expressions) {
        if (cron.validate(expr)) valid.push(expr);
        else console.error(`Невалідний cron: ${expr}`);
      }
      for (const expr of valid) {
        cron.schedule(
          expr,
          () => {
            const now = formatServerTime(tz);
            console.log(`[cron] Спрацював розклад (${expr}). Час сервера: ${now}`);
            triggerRunViaSpawn('schedule');
          },
          { timezone: tz || undefined }
        );
      }
      if (valid.length) {
        console.log(
          `Розклад: ${valid.join(' | ')} (${tz || 'локальний час'}) — запуск як Test-Once (--once)`
        );
      }
    }
  });
}

if (onceMode) {
  runOnceCli();
} else {
  startHttpServer();
}
