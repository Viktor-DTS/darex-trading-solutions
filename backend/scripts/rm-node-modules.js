/**
 * Render кладе в кеш node_modules. Повне видалення перед кожним деплоєм
 * змушує npm знову розпаковувати сотні мегабайт (хвилини замість секунд).
 *
 * Тираємо лише якщо кеш битий — тоді спрацює повний install + postinstall.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');

const CRITICAL = [
  'express/lib/application.js',
  'express/lib/router/index.js',
  'debug/src/debug.js',
  'path-to-regexp/index.js',
  'mongoose/lib/index.js',
];

function missingCritical() {
  if (!fs.existsSync(nm)) return true;
  return CRITICAL.some((rel) => !fs.existsSync(path.join(nm, rel)));
}

if (!missingCritical()) {
  console.log('[render-build] node_modules cache OK — skip wipe');
  process.exit(0);
}

try {
  fs.rmSync(nm, { recursive: true, force: true });
  console.log('[render-build] node_modules missing or broken — removed for a clean install');
} catch (e) {
  console.warn('[render-build] node_modules rm skipped:', e.message);
}
