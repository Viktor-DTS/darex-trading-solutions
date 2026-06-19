/**
 * Шляхи агента: у звичайному Node — папка проєкту; у .exe (pkg) — папка з dts-onec-agent.exe.
 */
const fs = require('fs');
const path = require('path');

function getAgentRoot() {
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  // portable: dist-portable/app/src → config.json у dist-portable/
  const portableRoot = path.join(__dirname, '..', '..');
  if (fs.existsSync(path.join(portableRoot, 'config.json'))) {
    return portableRoot;
  }
  return path.join(__dirname, '..');
}

function getConfigPath() {
  return path.join(getAgentRoot(), 'config.json');
}

function getLogsDir() {
  const dir = path.join(getAgentRoot(), 'logs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Локальна temp (не RDP Temp\242 — там часто немає папки для state-файлів). */
function getAgentTempDir() {
  const dir = path.join(getAgentRoot(), 'temp');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getWindowNeedlesPath() {
  const root = getAgentRoot();
  const candidates = [
    path.join(root, 'scripts', 'window-needles.json'),
    path.join(__dirname, '..', 'scripts', 'window-needles.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadConfig() {
  const p = getConfigPath();
  if (!fs.existsSync(p)) {
    const example = path.join(getAgentRoot(), 'config.example.json');
    console.error('Немає config.json поруч із агентом.');
    console.error(`Папка агента: ${getAgentRoot()}`);
    if (fs.existsSync(example)) {
      console.error('Скопіюйте config.example.json → config.json і заповніть.');
    }
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

module.exports = { getAgentRoot, getConfigPath, getLogsDir, getAgentTempDir, getWindowNeedlesPath, loadConfig };
