const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readState, DATA_DIR } = require('./state');
const { isProcessAlive, releaseWorkerLock } = require('./stateCache');

const ROOT = path.join(__dirname, '..');
const LOG_PATH = path.join(DATA_DIR, 'worker.log');
const LOCK_PATH = path.join(DATA_DIR, 'worker.lock');
const MAX_LOG_LINES = 2000;

let child = null;
let startedAt = null;
const logLines = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function appendLog(chunk) {
  ensureDataDir();
  rotateLogIfNeeded();
  const text = String(chunk).replace(/\r\n/g, '\n');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const entry = { ts: new Date().toISOString(), line };
    logLines.push(entry);
    if (logLines.length > MAX_LOG_LINES) logLines.shift();
    fs.appendFileSync(LOG_PATH, `[${entry.ts}] ${line}\n`);
  }
}

function rotateLogIfNeeded() {
  const maxBytes = Number(process.env.FX_LOG_MAX_BYTES) || 512 * 1024;
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const size = fs.statSync(LOG_PATH).size;
    if (size < maxBytes) return;
    const rotated = `${LOG_PATH}.1`;
    if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
    fs.renameSync(LOG_PATH, rotated);
  } catch (_) { /* ignore rotation errors */ }
}

function isManagedRunning() {
  return child != null && child.exitCode == null && !child.killed;
}

function stopOrphanWorkers() {
  const candidates = new Set();
  try {
    const owner = Number(fs.readFileSync(LOCK_PATH, 'utf8').trim());
    if (owner) candidates.add(owner);
  } catch (_) { /* no lock */ }

  const state = readState();
  if (state?.pid) candidates.add(Number(state.pid));

  let stopped = 0;
  for (const pid of candidates) {
    if (!pid || !isProcessAlive(pid)) continue;
    if (child?.pid === pid) continue;
    appendLog(`[supervisor] stopping orphan worker PID ${pid}`);
    try {
      if (process.platform === 'win32') {
        require('child_process').execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
      stopped += 1;
    } catch (_) { /* ignore */ }
  }

  try {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  } catch (_) { /* ignore */ }
  releaseWorkerLock();

  return stopped;
}

function startWorker(options = {}) {
  if (isManagedRunning()) {
    return { ok: false, error: 'Worker вже запущений', pid: child.pid };
  }

  const killed = options.force ? stopOrphanWorkers() : 0;
  if (!options.force) {
    try {
      const owner = Number(fs.readFileSync(LOCK_PATH, 'utf8').trim());
      if (isProcessAlive(owner)) {
        return {
          ok: false,
          error: `Worker вже працює (PID ${owner}). Натисни Start ще раз з force або npm run panel:stop`,
          externalPid: owner,
        };
      }
    } catch (_) { /* stale lock */ }
  } else if (killed > 0) {
    appendLog(`[supervisor] cleared ${killed} orphan worker(s)`);
  }

  ensureDataDir();
  appendLog('[supervisor] starting worker…');

  child = spawn(process.execPath, ['worker/index.js'], {
    cwd: ROOT,
    env: { ...process.env, FX_WORKER_INSTANCE: 'panel' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  startedAt = new Date().toISOString();

  child.stdout.on('data', (d) => appendLog(d));
  child.stderr.on('data', (d) => appendLog(d));

  child.on('exit', (code, signal) => {
    appendLog(`[supervisor] worker stopped (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    child = null;
    startedAt = null;
  });

  child.on('error', (e) => {
    appendLog(`[supervisor] spawn error: ${e.message}`);
    child = null;
    startedAt = null;
  });

  return { ok: true, pid: child.pid, startedAt };
}

function stopWorker() {
  if (!isManagedRunning()) {
    return { ok: false, error: 'Worker не керується панеллю (запустіть через Start або зупиніть вручну)' };
  }

  appendLog('[supervisor] stopping worker…');
  child.kill('SIGINT');

  const pid = child.pid;
  setTimeout(() => {
    if (isManagedRunning()) {
      appendLog('[supervisor] SIGINT timeout — force kill');
      child.kill('SIGKILL');
    }
  }, 5000);

  return { ok: true, pid };
}

function getLogs(limit = 150) {
  const n = Math.min(Math.max(Number(limit) || 150, 1), MAX_LOG_LINES);
  return logLines.slice(-n);
}

function isStateFresh(maxAgeMs = 15000) {
  const state = readState();
  if (!state?.updatedAt) return false;
  return Date.now() - new Date(state.updatedAt).getTime() < maxAgeMs;
}

function getControlStatus() {
  const state = readState();
  const managed = isManagedRunning();
  const fresh = isStateFresh();

  let mode = 'stopped';
  if (managed) mode = 'managed';
  else if (fresh) mode = 'external';

  return {
    mode,
    managed,
    externalWorkerLikely: !managed && fresh,
    stateInstance: state?.instance ?? null,
    statePid: state?.pid ?? null,
    pid: managed ? child.pid : null,
    startedAt: managed ? startedAt : null,
    stateFresh: fresh,
    lastStateUpdate: state?.updatedAt ?? null,
    tickCount: state?.tickCount ?? 0,
    logPath: LOG_PATH,
  };
}

module.exports = {
  startWorker,
  stopWorker,
  getLogs,
  getControlStatus,
  isManagedRunning,
  LOG_PATH,
};
