const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../state');

function flagPath() {
  return path.join(DATA_DIR, 'testbot-clear.flag');
}

function requestTestbotClear(extra = {}) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(flagPath(), JSON.stringify({
    requestedAt: Date.now(),
    ...extra,
  }));
}

function consumeTestbotClearRequest() {
  const p = flagPath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    fs.unlinkSync(p);
    return raw.trim() ? JSON.parse(raw) : { requestedAt: Date.now() };
  } catch (_) {
    try { fs.unlinkSync(p); } catch (_) { /* ignore */ }
    return { requestedAt: Date.now() };
  }
}

module.exports = {
  requestTestbotClear,
  consumeTestbotClearRequest,
};
