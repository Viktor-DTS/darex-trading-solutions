const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function statePath() {
  return path.join(DATA_DIR, 'worker-state.json');
}

function sleepMs(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) { /* wait for file lock */ }
}

function readState() {
  ensureDataDir();
  for (let i = 0; i < 3; i += 1) {
    try {
      const raw = fs.readFileSync(statePath(), 'utf8');
      if (!raw.trim()) return null;
      return JSON.parse(raw);
    } catch (_) {
      if (i < 2) sleepMs(25);
    }
  }
  return null;
}

/** Atomic write with Windows-friendly fallback. Returns false instead of throwing. */
function writeState(state) {
  ensureDataDir();
  const target = statePath();
  const tmp = `${target}.${process.pid}.tmp`;
  const doc = JSON.stringify(
    { ...state, updatedAt: new Date().toISOString() },
    process.env.FX_STATE_PRETTY === '1' ? null : undefined,
    process.env.FX_STATE_PRETTY === '1' ? 2 : undefined,
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.writeFileSync(tmp, doc);
      try {
        fs.renameSync(tmp, target);
        return true;
      } catch (err) {
        if (process.platform === 'win32' && (err.code === 'EPERM' || err.code === 'EACCES')) {
          fs.copyFileSync(tmp, target);
          try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
          return true;
        }
        throw err;
      }
    } catch (err) {
      if (attempt < 4) {
        sleepMs(20 * (attempt + 1));
        continue;
      }
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
      console.warn('[fx-state] write failed:', err.code || err.message);
      return false;
    }
  }
  return false;
}

module.exports = {
  readState,
  writeState,
  DATA_DIR,
};
