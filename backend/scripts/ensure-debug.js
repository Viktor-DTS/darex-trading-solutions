/**
 * Render occasionally ends up with a broken `debug` install where
 * `node_modules/debug/src/debug.js` is missing, causing Express to crash with:
 *   Error: Cannot find module './debug'
 *   Require stack: ... node_modules/debug/src/node.js
 *
 * This script patches that specific case during `postinstall`.
 */
const fs = require('fs');
const path = require('path');

function safeMkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function safeWrite(file, content) {
  safeMkdirp(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

try {
  const projectRoot = path.resolve(__dirname, '..');
  const target = path.join(projectRoot, 'node_modules', 'debug', 'src', 'debug.js');

  // Already present → nothing to do.
  if (fs.existsSync(target)) {
    process.exit(0);
  }

  const vendored = path.join(projectRoot, 'vendor', 'debug-2.6.9', 'src', 'debug.js');
  const content = safeRead(vendored);

  if (!content) {
    // Don’t fail install if vendor file is missing for some reason.
    // Backend will still fail to start, but deploy logs will show why.
    console.warn('[ensure-debug] Vendored debug.js not found:', vendored);
    process.exit(0);
  }

  safeWrite(target, content);
  console.log('[ensure-debug] Restored missing debug/src/debug.js from vendor.');
} catch (err) {
  // Never fail install on this helper; log for diagnosis.
  console.warn('[ensure-debug] Unexpected error:', err && err.message ? err.message : err);
  process.exit(0);
}

