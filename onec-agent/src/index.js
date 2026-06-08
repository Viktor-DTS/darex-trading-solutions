/**
 * Локальний агент DTS на сервері 1С.
 * - localhost HTTP: /health, /status, POST /run
 * - node-cron 08:00 / 12:00 / 16:00
 * - dts-onec-agent.exe --once  — разовий цикл без HTTP-сервера
 */
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const automation = require('./automation');
const { runPipeline } = require('./pipeline');
const { getAgentRoot, loadConfig } = require('./paths');

const config = loadConfig();
const onceMode = process.argv.includes('--once');

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
};

function pushLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  status.log.push(line);
  if (status.log.length > 200) status.log.shift();
  console.log(line);
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
  status.log = [];
  pushLog(`Запуск циклу (${trigger}).`);

  return runPipeline(config, pushLog)
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

async function runOnceCli() {
  console.log(`DTS 1С-агент (разовий запуск). Папка: ${getAgentRoot()}`);
  try {
    const res = await triggerRun('manual');
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
    });
  });

  app.get('/status', checkAgentToken, (req, res) => {
    res.json(status);
  });

  app.post('/run', checkAgentToken, async (req, res) => {
    if (status.state === 'running') {
      return res.json({ started: false, reason: 'Уже виконується', state: status.state });
    }
    triggerRun('manual').catch(() => {});
    res.json({ started: true, state: status.state });
  });

  const port = config.port || 8765;
  const host = config.host || '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`DTS 1С-агент слухає http://${host}:${port}`);
    console.log(`Папка: ${getAgentRoot()}${process.pkg ? ' (exe)' : ''}`);
    console.log(`Автоматизація: ${automation.isAvailable() ? 'так' : 'НІ (' + automation.nutError() + ')'}`);
    if (config.schedule?.enabled && config.schedule.cron) {
      if (cron.validate(config.schedule.cron)) {
        cron.schedule(
          config.schedule.cron,
          () => {
            console.log('[cron] Спрацював розклад.');
            if (status.state !== 'running') triggerRun('schedule').catch(() => {});
          },
          { timezone: config.schedule.timezone || undefined }
        );
        console.log(`Розклад: ${config.schedule.cron} (${config.schedule.timezone || 'локальний час'})`);
      } else {
        console.error(`Невалідний cron: ${config.schedule.cron}`);
      }
    }
  });
}

if (onceMode) {
  runOnceCli();
} else {
  startHttpServer();
}
