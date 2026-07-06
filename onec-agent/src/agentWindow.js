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
  const parseLines = (out) => (out || '').trim().split(/\r?\n/).filter(Boolean);
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
      { encoding: 'utf8',
        timeout: 15000,
        windowsHide: true }
    ).trim();
    return parseLines(out);
  } catch (e) {
    const combined = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trim();
    const lines = parseLines(e.stdout || combined);
    if (lines.some((l) => l.startsWith('FOCUS|') || l.startsWith('MIN|'))) {
      return lines;
    }
    log?.(`! ${scriptName}: ${combined.slice(0, 300) || 'failed'}`);
    return lines.length ? lines : null;
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

/** Перед cron-spawn: згорнути консоль агента і віддати фокус 1С (як перед ручним Test-Once). */
async function minimizeAgentBeforeSpawn(log, automation) {
  if (os.platform() !== 'win32') return false;
  log?.('Підготовка робочого столу перед spawn (згорнути агента, фокус 1С)…');
  const lines = runPsScript('prepare-desktop.ps1', log, []) || [];
  for (const line of lines) {
    if (line.startsWith('MIN|')) log?.(`✓ Згорнуто: ${line.slice(4)}`);
    if (line.startsWith('FOCUS|')) log?.(`✓ Фокус 1С: ${line.slice(6)}`);
  }
  await new Promise((r) => setTimeout(r, automation?.preSpawnSettleMs ?? 800));
  return true;
}

module.exports = { prepareDesktopForAutomation, refocus1cMain, minimizeAgentBeforeSpawn };
