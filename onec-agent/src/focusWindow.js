/**
 * Пошук і фокус вікна 1С на Windows.
 * nut.js інколи повертає порожні заголовки — резерв: scripts/focus-1c.ps1
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { getAgentRoot } = require('./paths');

const DEFAULT_NEEDLES = ['предприятие', 'ведомость', '1с', '1c', 'утп', '1cv8'];

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/1с/g, '1c')
    .replace(/ё/g, 'е');
}

function needlesFromStep(step, automation) {
  const raw = step.titleContains ?? automation.windowTitleContains ?? DEFAULT_NEEDLES;
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set([...list, ...DEFAULT_NEEDLES].map(normalizeForMatch))];
}

function titleMatches(title, needles) {
  const t = normalizeForMatch(title);
  if (!t.trim()) return false;
  return needles.some((n) => t.includes(n));
}

function resolveFocusScript() {
  const root = getAgentRoot();
  const candidates = [
    path.join(__dirname, '..', 'scripts', 'focus-1c.ps1'),
    path.join(root, 'scripts', 'focus-1c.ps1'),
    path.join(root, 'app', 'scripts', 'focus-1c.ps1'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function focusViaNut(getWindows, needles, log) {
  const wins = await getWindows();
  const found = [];
  for (const w of wins) {
    let title = '';
    try {
      title = String(await w.getTitle());
    } catch (_) {
      /* ignore */
    }
    if (title.trim()) found.push(title);
    if (titleMatches(title, needles)) {
      await w.focus();
      log(`✓ Сфокусовано (nut.js): ${title}`);
      return true;
    }
  }
  return { ok: false, titles: found };
}

function focusViaPowerShell(needles, log, opts = {}) {
  if (os.platform() !== 'win32') return { ok: false, titles: [] };

  const script = resolveFocusScript();
  if (!script) {
    return { ok: false, titles: [], err: 'focus-1c.ps1 not found' };
  }

  const needlesFile = path.join(os.tmpdir(), `dts-needles-${crypto.randomBytes(4).toString('hex')}.json`);
  fs.writeFileSync(needlesFile, JSON.stringify(needles), 'utf8');

  const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-NeedlesFile', needlesFile];
  if (opts.preferShort) psArgs.push('-PreferShort');
  if (opts.mainOnly) psArgs.push('-MainOnly');
  if (opts.findOnly) psArgs.push('-FindOnly');

  try {
    const out = execFileSync('powershell', psArgs, {
      encoding: 'utf8',
      timeout: 20000,
      windowsHide: true,
    }).trim();
    const line = out.split(/\r?\n/).filter(Boolean).pop() || '';
    if (line.startsWith('OK|')) {
      const title = line.slice(3);
      if (opts.findOnly) {
        log(`✓ Знайдено вікно: ${title}`);
      } else {
        log(`✓ Сфокусовано (PowerShell): ${title}`);
      }
      return { ok: true, titles: [], title };
    }
    const preview = line.startsWith('FAIL|') ? line.slice(5).split(';;').filter(Boolean) : [];
    return { ok: false, titles: preview };
  } catch (e) {
    const combined = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n');
    const line = combined.split(/\r?\n/).filter(Boolean).pop() || '';
    const preview = line.startsWith('FAIL|') ? line.slice(5).split(';;').filter(Boolean) : [];
    return { ok: false, titles: preview, err: combined.slice(0, 500) };
  } finally {
    try {
      fs.unlinkSync(needlesFile);
    } catch (_) {
      /* ignore */
    }
  }
}

async function focusWindow(step, automation, getWindows, log) {
  const needles = needlesFromStep(step, automation);
  const psOpts = {
    preferShort: !!(step.preferShort || step.dialog === 'save'),
    mainOnly: !!(step.mainOnly || step.dialog === 'main'),
  };

  const nutResult = await focusViaNut(getWindows, needles, log);
  if (nutResult === true) return;

  const nutTitles = nutResult.titles || [];
  const psResult = focusViaPowerShell(needles, log, psOpts);
  if (psResult.ok) return;

  const allTitles = [...new Set([...nutTitles, ...(psResult.titles || [])])].slice(0, 20);
  const psErr = psResult.err ? ` PowerShell: ${psResult.err}` : '';
  const hint = allTitles.length
    ? ` Видимі вікна: ${allTitles.map((t) => `«${t}»`).join(', ')}`
    : ' Жодного заголовка вікна не отримано (перевірте, що 1С не згорнута).';

  throw new Error(
    `Не знайдено вікно 1С (шукали: ${needles.join(', ')}).${hint}${psErr} ` +
      'Переконайтесь, що звіт «Ведомость» відкритий і вікно не згорнуте.'
  );
}

const SAVE_DIALOG_NEEDLES = ['сохранение', 'сохранить', 'save'];

function findSaveDialog(log) {
  const needles = SAVE_DIALOG_NEEDLES;
  const r = focusViaPowerShell(needles, log || (() => {}), { preferShort: true, findOnly: true });
  return r.ok ? r : { ok: false };
}

module.exports = { focusWindow, findSaveDialog, normalizeForMatch, needlesFromStep, SAVE_DIALOG_NEEDLES };
