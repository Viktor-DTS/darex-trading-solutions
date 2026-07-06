/**
 * Запуск циклу як Test-Once.bat: той самий node app\src\index.js --once (без pause).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAgentRoot } = require('./paths');

/** Той самий рядок, що в Test-Once.bat / Run-Once.bat */
function resolveOnceCommand() {
  const root = getAgentRoot();
  const scriptInApp = path.join(root, 'app', 'src', 'index.js');
  const nodePortable = path.join(root, 'node', 'node.exe');
  const scriptDev = path.join(__dirname, 'index.js');
  const runOnceBat = path.join(root, 'Run-Once.bat');

  if (fs.existsSync(runOnceBat)) {
    return { mode: 'bat', command: 'cmd.exe', args: ['/c', runOnceBat], cwd: root };
  }
  if (fs.existsSync(nodePortable) && fs.existsSync(scriptInApp)) {
    return {
      mode: 'node',
      command: nodePortable,
      args: [scriptInApp, '--once'],
      cwd: root,
    };
  }
  if (fs.existsSync(scriptDev)) {
    return { mode: 'node', command: process.execPath, args: [scriptDev, '--once'], cwd: root };
  }
  return { mode: 'node', command: process.execPath, args: ['--once'], cwd: root };
}

/**
 * @param {string} trigger — лише для логів батьківського процесу (дочірній = як Test-Once)
 * @param {{ onLine?: (line:string)=>void, onExit?: (code:number|null)=>void }} hooks
 * @returns {import('child_process').ChildProcess}
 */
function spawnOnceRun(trigger, hooks = {}) {
  const spec = resolveOnceCommand();
  // Не передаємо --trigger=schedule: дочірній процес = звичайний Test-Once (--once).
  const spawnOpts = {
    cwd: spec.cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  };

  const child = spawn(spec.command, spec.args, spawnOpts);

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
