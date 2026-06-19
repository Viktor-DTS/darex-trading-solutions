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

const DEFAULT_NEEDLES = ['предприятие', 'ведомость', 'утп', '1cv8'];
const SAVE_DIALOG_NEEDLES = [
  'сохранение',
  'сохранить',
  'сохранение как',
  'сохранить как',
  'збереження',
  'зберегти',
  'save as',
  'save',
];

/** Діалог «Выбор поля» — відкривається при промаху кліком по «…» групування. */
const FIELD_PICKER_NEEDLES = [
  'выбор поля',
  'вибір поля',
  'field selection',
  'выбор группировки',
];

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/1с/g, '1c')
    .replace(/ё/g, 'е');
}

function needlesFromStep(step, automation) {
  const raw = step.titleContains ?? automation.windowTitleContains;
  if (step.dialog === 'save') {
    const list = Array.isArray(raw) ? raw : raw ? [raw] : SAVE_DIALOG_NEEDLES;
    return [...new Set(list.map(normalizeForMatch))];
  }
  const list = Array.isArray(raw) ? raw : raw ? [raw] : DEFAULT_NEEDLES;
  return [...new Set([...list, ...DEFAULT_NEEDLES].map(normalizeForMatch))];
}

function isExcludedWindow(title) {
  const t = normalizeForMatch(title);
  return (
    (t.includes('dts') && t.includes('agent')) ||
    t.includes('dts 1c agent') ||
    t.includes('cursor') ||
    t.includes('powershell')
  );
}

function titleMatches(title, needles) {
  const t = normalizeForMatch(title);
  if (!t.trim() || isExcludedWindow(title)) return false;
  return needles.some((n) => t.includes(n));
}

function isSaveDialogTitle(title) {
  const t = normalizeForMatch(title);
  if (!t.trim() || isExcludedWindow(title)) return false;
  if (
    t.includes('сохран') ||
    t.includes('зберег') ||
    t.includes('save as') ||
    (t.includes('save') && !t.includes('autosave'))
  ) {
    return true;
  }
  return titleMatches(title, SAVE_DIALOG_NEEDLES.map(normalizeForMatch));
}

function isFieldPickerTitle(title) {
  const t = normalizeForMatch(title);
  if (!t.trim() || isExcludedWindow(title)) return false;
  return titleMatches(t, FIELD_PICKER_NEEDLES.map(normalizeForMatch));
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
    if (isExcludedWindow(title)) continue;
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

  // Діалог «Сохранение»: лише PowerShell, заголовок має містити «Сохранение»/«Сохранить»
  if (step.dialog === 'save') {
    const psSave = focusViaPowerShell(needles, log, psOpts);
    if (psSave.ok && isSaveDialogTitle(psSave.title)) return;
    throw new Error(
      'Не знайдено діалог «Сохранение». Переконайтесь, що після Ctrl+S відкрилось вікно збереження файлу.'
    );
  }

  // Головне вікно 1С: спочатку PowerShell (nut.js ловить «DTS 1C Agent»)
  if (psOpts.mainOnly) {
    const psMain = focusViaPowerShell(needles, log, { ...psOpts, mainOnly: true });
    if (psMain.ok) return;
  }

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

function findSaveDialog(log) {
  const needles = SAVE_DIALOG_NEEDLES.map(normalizeForMatch);
  const r = focusViaPowerShell(needles, log || (() => {}), { preferShort: true, findOnly: true });
  if (!r.ok || !r.title || !isSaveDialogTitle(r.title)) {
    return { ok: false, titles: r.titles || [] };
  }
  return r;
}

function findFieldPickerDialog(log, extraNeedles = []) {
  const needles = [...FIELD_PICKER_NEEDLES, ...(extraNeedles || [])].map(normalizeForMatch);
  const r = focusViaPowerShell(needles, log || (() => {}), { preferShort: true, findOnly: true });
  if (!r.ok || !r.title || !isFieldPickerTitle(r.title)) {
    return { ok: false, titles: r.titles || [] };
  }
  return r;
}

/** Сфокусувати модальне «Выбор поля» (не findOnly). */
function focusFieldPickerDialog(log, extraNeedles = []) {
  const needles = [...FIELD_PICKER_NEEDLES, ...(extraNeedles || [])].map(normalizeForMatch);
  const r = focusViaPowerShell(needles, log || (() => {}), { preferShort: true, findOnly: false });
  if (!r.ok || !r.title || !isFieldPickerTitle(r.title)) {
    return { ok: false, titles: r.titles || [] };
  }
  return r;
}

function listVisibleWindows(log) {
  if (os.platform() !== 'win32') return [];

  const script = resolveFocusScript();
  if (!script) return [];

  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ListAll'],
      { encoding: 'utf8', timeout: 15000, windowsHide: true }
    ).trim();
    const line = out.split(/\r?\n/).filter(Boolean).pop() || '';
    if (!line.startsWith('LIST|')) return [];
    const titles = line
      .slice(5)
      .split(';;')
      .filter(Boolean)
      .slice(0, 40);
    if (log && titles.length) {
      log(`• Видимі вікна: ${titles.map((t) => `«${t}»`).join(', ')}`);
    }
    return titles;
  } catch (_) {
    return [];
  }
}

module.exports = {
  focusWindow,
  findSaveDialog,
  findFieldPickerDialog,
  focusFieldPickerDialog,
  listVisibleWindows,
  normalizeForMatch,
  needlesFromStep,
  isSaveDialogTitle,
  isFieldPickerTitle,
  isExcludedWindow,
  SAVE_DIALOG_NEEDLES,
  FIELD_PICKER_NEEDLES,
};
