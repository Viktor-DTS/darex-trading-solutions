/**
 * Запуск циклу як Test-Once.bat: окремий процес node … --once (той самий код, що й тест).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAgentRoot } = require('./paths');

function resolveOnceCommand() {
  const root = getAgentRoot();
  const scriptInApp = path.join(root, 'app', 'src', 'index.js');
  const nodePortable = path.join(root, 'node', 'node.exe');
  const scriptDev = path.join(__dirname, 'index.js');

  if (fs.existsSync(nodePortable) && fs.existsSync(scriptInApp)) {
    return { command: nodePortable, args: [scriptInApp, '--once'], cwd: root };
  }
  if (fs.existsSync(scriptDev)) {
    return { command: process.execPath, args: [scriptDev, '--once'], cwd: root };
  }
  return { command: process.execPath, args: ['--once'], cwd: root };
}

/**
 * @param {string} trigger manual | schedule
 * @param {{ onLine?: (line:string)=>void, onExit?: (code:number|null)=>void }} hooks
 * @returns {import('child_process').ChildProcess}
 */
function spawnOnceRun(trigger, hooks = {}) {
  const { command, args, cwd } = resolveOnceCommand();
  const fullArgs = [...args, `--trigger=${trigger}`];

  const child = spawn(command, fullArgs, {
    cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const handleChunk = (chunk) => {
    const text = String(chunk || '');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (t) hooks.onLine?.(t);
    }
  };

  child.stdout?.on('data', handleChunk);
  child.stderr?.on('data', handleChunk);
  child.on('close', (code) => hooks.onExit?.(code));
  child.on('error', (err) => hooks.onExit?.(null, err));

  return child;
}

module.exports = { spawnOnceRun, resolveOnceCommand };
