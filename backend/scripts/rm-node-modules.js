/**
 * Cross-platform remover for Render/build: merges with broken cached node_modules
 * cause intermittent missing inner files (express, iconv-lite, path-to-regexp, …).
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules');
try {
  fs.rmSync(target, { recursive: true, force: true });
  console.log('[render-build] node_modules removed');
} catch (e) {
  console.warn('[render-build] node_modules rm skipped:', e.message);
}
