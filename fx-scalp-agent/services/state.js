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

function readState() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeState(state) {
  ensureDataDir();
  fs.writeFileSync(statePath(), JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}

module.exports = {
  readState,
  writeState,
  DATA_DIR,
};
