/**
 * Вставка Unicode-тексту в Windows через буфер обміну (nut.js keyboard.type ламає кирилицю).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveClipboardScript() {
  const candidates = [
    path.join(__dirname, '..', 'scripts', 'set-clipboard.ps1'),
    path.join(__dirname, '..', '..', 'scripts', 'set-clipboard.ps1'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function setClipboardText(text) {
  const script = resolveClipboardScript();
  if (!script) throw new Error('set-clipboard.ps1 not found');
  const tmp = path.join(os.tmpdir(), `dts-clip-${Date.now()}.txt`);
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-TextFile', tmp], {
      timeout: 10000,
      windowsHide: true,
    });
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
  }
}

function needsClipboard(text) {
  return /[^\u0000-\u007f]/.test(text);
}

module.exports = { setClipboardText, needsClipboard };
