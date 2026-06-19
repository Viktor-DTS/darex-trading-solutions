/**
 * Підготовка робочого столу: згорнути консоль агента, примусово активувати 1С.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getAgentRoot, getWindowNeedlesPath } = require('./paths');

function resolveScript(name) {
  const root = getAgentRoot();
  const candidates = [
    path.join(__dirname, '..', 'scripts', name),
    path.join(root, 'scripts', name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function psExtraArgs(scriptName) {
  if (scriptName !== 'prepare-desktop.ps1' && scriptName !== 'set-keyboard-layout.ps1') return [];
  const needles = getWindowNeedlesPath();
  return needles ? ['-NeedlesFile', needles] : [];
}

function runPsScript(scriptName, log, extraArgs = []) {
  const script = resolveScript(scriptName);
  if (!script) {
    log?.(`! ${scriptName} не знайдено`);
    return null;
  }
  const args = [...psExtraArgs(scriptName), ...extraArgs];
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
      { encoding: 'utf8',
        timeout: 15000,
        windowsHide: true }
    ).trim();
    const lines = out.split(/\r?\n/).filter(Boolean);
    return lines;
  } catch (e) {
    const combined = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trim();
    log?.(`! ${scriptName}: ${combined.slice(0, 300) || 'failed'}`);
    return null;
  }
}

async function prepareDesktopForAutomation(automation, log) {
  if (os.platform() !== 'win32') return false;
  const lines = runPsScript('prepare-desktop.ps1', log, []) || [];
  for (const line of lines) {
    if (line.startsWith('MIN|')) log?.(`✓ Згорнуто: ${line.slice(4)}`);
  }
  const focusLine = lines.filter((l) => l.startsWith('FOCUS|')).pop();
  if (focusLine) {
    log?.(`✓ Фокус 1С: ${focusLine.slice(6)}`);
    await new Promise((r) => setTimeout(r, automation?.desktopPrepareSettleMs ?? 350));
    return true;
  }
  const failLine = lines.filter((l) => l.startsWith('FAIL|')).pop();
  if (failLine) log?.(`! prepare-desktop: ${failLine.slice(5)}`);
  return false;
}

/** Завжди згортає консоль агента і повертає фокус у 1С (навіть якщо ви дивитесь на агента). */
async function refocus1cMain(log, automation) {
  if (os.platform() !== 'win32') return false;
  const lines = runPsScript('prepare-desktop.ps1', log, []) || [];
  const focusLine = lines.filter((l) => l.startsWith('FOCUS|')).pop();
  if (focusLine) {
    await new Promise((r) => setTimeout(r, automation?.refocusSettleMs ?? 280));
    return true;
  }
  const failLine = lines.filter((l) => l.startsWith('FAIL|')).pop();
  if (failLine) log?.(`! refocus: ${failLine.slice(5)}`);
  return false;
}

module.exports = { prepareDesktopForAutomation, refocus1cMain };
