/**
 * Windows: перемикання розкладки на English перед літерними хоткеями (Ctrl+S, Alt+F,S…).
 * На кириличній розкладці 1С не отримує латинські скорочення.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getAgentRoot } = require('./paths');

const DEFAULT_KLID = '00000409'; // English (United States)

function resolveLayoutScript() {
  const root = getAgentRoot();
  const candidates = [
    path.join(__dirname, '..', 'scripts', 'set-keyboard-layout.ps1'),
    path.join(root, 'scripts', 'set-keyboard-layout.ps1'),
    path.join(root, 'app', '..', 'scripts', 'set-keyboard-layout.ps1'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function keysNeedEnglishLayout(keys) {
  return (keys || []).some((k) => {
    const n = String(k).toLowerCase();
    return n.length === 1 && n >= 'a' && n <= 'z';
  });
}

function isLayoutSwitchEnabled(automation) {
  if (process.platform !== 'win32') return false;
  return automation?.forceEnglishLayout !== false;
}

function runLayoutPs(action, log, opts = {}) {
  const script = resolveLayoutScript();
  if (!script) {
    log?.('! set-keyboard-layout.ps1 не знайдено — пропуск перемикання розкладки');
    return null;
  }

  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-Action',
    action,
    '-Klid',
    opts.klid || DEFAULT_KLID,
  ];
  if (opts.stateFile) args.push('-StateFile', opts.stateFile);

  try {
    const out = execFileSync('powershell', args, {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    }).trim();
    const line = out.split(/\r?\n/).filter(Boolean).pop() || '';
    return line;
  } catch (e) {
    const combined = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n');
    const line = combined.split(/\r?\n/).filter(Boolean).pop() || '';
    log?.(`! Розкладка (${action}): ${line || combined.slice(0, 200)}`);
    return null;
  }
}

function switchToEnglish(log, automation) {
  const stateFile = path.join(
    os.tmpdir(),
    `dts-kbd-${crypto.randomBytes(4).toString('hex')}.json`
  );
  const klid = automation?.keyboardLayoutKlid || DEFAULT_KLID;
  const line = runLayoutPs('SaveEnglish', log, { stateFile, klid });
  if (line?.startsWith('OK|')) {
    log?.(`✓ Розкладка: English (${klid})`);
    return stateFile;
  }
  try {
    fs.unlinkSync(stateFile);
  } catch (_) {
    /* ignore */
  }
  return null;
}

function restoreLayout(log, stateFile) {
  if (!stateFile) return;
  const line = runLayoutPs('Restore', log, { stateFile });
  if (line?.startsWith('OK|restored')) {
    log?.('✓ Розкладку відновлено');
  }
}

async function withEnglishLayout(log, automation, keys, fn) {
  if (!isLayoutSwitchEnabled(automation) || !keysNeedEnglishLayout(keys)) {
    return fn();
  }

  const stateFile = switchToEnglish(log, automation);
  await new Promise((r) => setTimeout(r, automation?.keyboardLayoutSettleMs ?? 180));
  try {
    return await fn();
  } finally {
    restoreLayout(log, stateFile);
    if (stateFile) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }
}

module.exports = {
  withEnglishLayout,
  keysNeedEnglishLayout,
  isLayoutSwitchEnabled,
  DEFAULT_KLID,
};
