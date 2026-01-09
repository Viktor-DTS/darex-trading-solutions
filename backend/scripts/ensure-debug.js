/**
 * Render occasionally ends up with broken npm installs where critical files
 * are missing from node_modules, causing crashes:
 *   - Error: Cannot find module './debug' (from debug/src/node.js)
 *   - Error: Cannot find module './router' (from express/lib/application.js)
 *
 * This script patches missing files during `postinstall` and forces a clean
 * reinstall if Express is broken (since it's critical).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function checkFile(file, name) {
  if (!fs.existsSync(file)) {
    console.warn(`[postinstall] Missing critical file: ${name} (${file})`);
    return false;
  }
  return true;
}

try {
  const projectRoot = path.resolve(__dirname, '..');
  
  // 1. Fix debug if missing
  const debugTarget = path.join(projectRoot, 'node_modules', 'debug', 'src', 'debug.js');
  if (!fs.existsSync(debugTarget)) {
    const vendored = path.join(projectRoot, 'vendor', 'debug-2.6.9', 'src', 'debug.js');
    const content = safeRead(vendored);
    if (content) {
      safeWrite(debugTarget, content);
      console.log('[postinstall] Restored missing debug/src/debug.js from vendor.');
    } else {
      console.warn('[postinstall] Vendored debug.js not found:', vendored);
    }
  }

  // 2. Check Express critical files
  const expressRouter = path.join(projectRoot, 'node_modules', 'express', 'lib', 'router', 'index.js');
  const expressApp = path.join(projectRoot, 'node_modules', 'express', 'lib', 'application.js');
  
  if (!checkFile(expressRouter, 'express/lib/router/index.js') || 
      !checkFile(expressApp, 'express/lib/application.js')) {
    console.warn('[postinstall] Express appears broken. Forcing clean reinstall from package-lock.json...');
    try {
      // Reinstall express using exact version from package-lock.json (4.22.1)
      // This ensures we use the exact same version that was working before
      execSync('npm install express@4.22.1 --no-save', { cwd: projectRoot, stdio: 'inherit' });
      console.log('[postinstall] Express reinstalled successfully (version 4.22.1 from package-lock.json).');
    } catch (err) {
      console.error('[postinstall] Failed to reinstall Express:', err.message);
      // Don't fail - let the app try to start and show the real error
    }
  }
  
  console.log('[postinstall] Dependency check complete.');
} catch (err) {
  // Never fail install on this helper; log for diagnosis.
  console.warn('[postinstall] Unexpected error:', err && err.message ? err.message : err);
  process.exit(0);
}

