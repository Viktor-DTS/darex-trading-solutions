/**
 * Повний цикл агента: GUI-емуляція у 1С → збереження файлу → завантаження в DTS → імпорт.
 */
const fs = require('fs');
const path = require('path');
const automation = require('./automation');
const { uploadVedomost } = require('./dtsClient');
const { getLogsDir } = require('./paths');

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function newestReportInDir(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(xls|xlsx)$/i.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(dir, files[0].f) : null;
}

/**
 * @param {object} config
 * @param {(msg:string)=>void} log
 */
async function runPipeline(config, log, trigger = 'schedule') {
  const ts = timestamp();
  const dir = config.save.dir;
  const fileName = (config.save.fileNamePattern || 'Залишки_{{ts}}.xlsx').replace(/\{\{ts\}\}/g, ts);
  const filePath = path.join(dir, fileName);
  const logsDir = getLogsDir();
  ensureDir(dir);
  ensureDir(logsDir);

  let finalPath = filePath;

  if (config.automation && config.automation.enabled) {
    log(`Старт емуляції 1С. Файл буде збережено: ${filePath}`);
    await automation.runSteps(
      config.automation,
      { filePath, fileName, dir, ts, logsDir, save: config.save },
      log
    );
    // дати 1С час дописати файл
    await new Promise((r) => setTimeout(r, 4000));
    if (!fs.existsSync(filePath)) {
      // деякі версії 1С додають розширення самі — пробуємо знайти найновіший
      const newest = newestReportInDir(dir);
      if (!newest) {
        throw new Error(`Файл не знайдено після збереження: ${filePath}. Перевірте кроки автоматизації/діалог збереження.`);
      }
      const ageMs = Date.now() - fs.statSync(newest).mtimeMs;
      if (ageMs > 3 * 60 * 1000) {
        throw new Error(
          `Очікуваний файл «${fileName}» не створено. Найновіший у папці «${path.basename(newest)}» старіший за 3 хв — ` +
            'збереження в 1С, ймовірно, не відбулось (перевірте фокус діалогу «Сохранение»).'
        );
      }
      log(`! Очікуваний файл відсутній, беремо найновіший (свіжий): ${newest}`);
      finalPath = newest;
    }
  } else {
    log('Автоматизація вимкнена — беремо найновіший звіт із папки збереження.');
    const newest = newestReportInDir(dir);
    if (!newest) throw new Error(`У папці немає .xls/.xlsx файлів: ${dir}`);
    finalPath = newest;
  }

  log(`Завантаження у DTS: ${path.basename(finalPath)}${config.dts.dryRun ? ' (dryRun)' : ''}`);
  const summary = await uploadVedomost(config.dts, finalPath, trigger);
  log(
    `Готово. Залишки: +${summary.stock?.created ?? 0}/~${summary.stock?.updated ?? 0}, ` +
      `рух: +${summary.movements?.inserted ?? 0} (дублі ${summary.movements?.duplicates ?? 0}). ` +
      `Не прив'язані склади: ${summary.unmappedWarehouses?.length ?? 0}.`
  );
  return { fileName: path.basename(finalPath), filePath: finalPath, summary };
}

module.exports = { runPipeline, timestamp };
