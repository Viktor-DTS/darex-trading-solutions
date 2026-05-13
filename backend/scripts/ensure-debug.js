/**
 * Render occasionally ends up with broken npm installs where critical files
 * are missing from node_modules (cached/partial installs):
 *   - debug/src/debug.js
 *   - express/lib/router
 *   - path-to-regexp/index.js (hoisted dep of express)
 *
 * We reinstall broken packages or restore from vendor/ when npm reports
 * "up to date" but files are absent.
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

function restorePathToRegexpFromVendor(projectRoot) {
  const targetDir = path.join(projectRoot, 'node_modules', 'path-to-regexp');
  const src = path.join(projectRoot, 'vendor', 'path-to-regexp-0.1.12');
  for (const f of ['index.js', 'package.json', 'LICENSE']) {
    const content = safeRead(path.join(src, f));
    if (content) {
      safeWrite(path.join(targetDir, f), content);
    } else {
      console.warn('[postinstall] Missing vendored path-to-regexp file:', f);
    }
  }
}

function ensurePathToRegexp(projectRoot) {
  const ptrEntry = path.join(projectRoot, 'node_modules', 'path-to-regexp', 'index.js');
  if (fs.existsSync(ptrEntry)) {
    return true;
  }

  const ptrDir = path.join(projectRoot, 'node_modules', 'path-to-regexp');
  try {
    fs.rmSync(ptrDir, { recursive: true, force: true });
  } catch (e) {
    /* ignore */
  }

  try {
    execSync(
      'npm install path-to-regexp@0.1.12 --no-save --force --prefer-online',
      { cwd: projectRoot, stdio: 'inherit' },
    );
  } catch (err) {
    console.warn('[postinstall] path-to-regexp npm install:', err.message);
  }

  if (fs.existsSync(ptrEntry)) {
    return true;
  }

  console.warn('[postinstall] Restoring path-to-regexp from vendor (npm/cache left empty dir).');
  restorePathToRegexpFromVendor(projectRoot);
  return fs.existsSync(ptrEntry);
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

  // 2. Express + path-to-regexp (often broken together when cache is partial)
  const expressRouter = path.join(
    projectRoot,
    'node_modules',
    'express',
    'lib',
    'router',
    'index.js',
  );
  const expressApp = path.join(projectRoot, 'node_modules', 'express', 'lib', 'application.js');
  const expressBroken =
    !fs.existsSync(expressRouter) || !fs.existsSync(expressApp);
  const ptrBroken = !fs.existsSync(
    path.join(projectRoot, 'node_modules', 'path-to-regexp', 'index.js'),
  );

  if (expressBroken || ptrBroken) {
    if (expressBroken) {
      console.warn('[postinstall] Express incomplete — reinstalling with path-to-regexp.');
    } else {
      console.warn('[postinstall] path-to-regexp incomplete — forcing reinstall.');
    }
    try {
      fs.rmSync(path.join(projectRoot, 'node_modules', 'express'), {
        recursive: true,
        force: true,
      });
    } catch (e) {
      /* ignore */
    }
    try {
      fs.rmSync(path.join(projectRoot, 'node_modules', 'path-to-regexp'), {
        recursive: true,
        force: true,
      });
    } catch (e) {
      /* ignore */
    }
    try {
      execSync(
        'npm install express@4.22.1 path-to-regexp@0.1.12 --no-save --force --prefer-online',
        { cwd: projectRoot, stdio: 'inherit' },
      );
      console.log('[postinstall] express + path-to-regexp install finished.');
    } catch (err) {
      console.error('[postinstall] express/path-to-regexp install failed:', err.message);
    }

    if (!checkFile(expressRouter, 'express/lib/router/index.js') ||
        !checkFile(expressApp, 'express/lib/application.js')) {
      console.error('[postinstall] Express still incomplete. Clear Render build cache & redeploy.');
      process.exit(1);
    }
  }

  if (!ensurePathToRegexp(projectRoot)) {
    console.error('[postinstall] path-to-regexp still missing after npm + vendor.');
    process.exit(1);
  }

  console.log('[postinstall] Dependency check complete.');
} catch (err) {
  console.warn('[postinstall] Unexpected error:', err && err.message ? err.message : err);
  process.exit(0);
}
