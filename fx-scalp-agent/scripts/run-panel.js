#!/usr/bin/env node
/** Start panel and open browser (Windows-friendly). */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const port = Number(process.env.FX_API_PORT) || 8787;
const url = `http://127.0.0.1:${port}`;

function openBrowser(target) {
  if (process.env.FX_OPEN_BROWSER === '0') return;
  const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['', target] : [target];
  spawn(cmd, args, { shell: true, stdio: 'ignore', detached: true }).unref();
}

function waitForPanel(maxMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${url}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - start > maxMs) reject(new Error('timeout'));
        else setTimeout(tick, 300);
      });
      req.on('error', () => {
        if (Date.now() - start > maxMs) reject(new Error('timeout'));
        else setTimeout(tick, 300);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

const child = spawn(process.execPath, [path.join(__dirname, '../api/server.js')], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('exit', (code) => process.exit(code ?? 0));

waitForPanel()
  .then(() => {
    console.log(`[fx-panel] opening browser ${url}`);
    openBrowser(url);
  })
  .catch(() => {
    console.log(`[fx-panel] open manually: ${url}`);
  });

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
