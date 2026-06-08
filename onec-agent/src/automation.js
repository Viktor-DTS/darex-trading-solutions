/**
 * Рушій GUI-емуляції для товстого клієнта 1С.
 *
 * Працює за списком кроків з config.automation.steps (config-driven), щоб калібрувати
 * послідовність кліків/клавіш на сервері без зміни коду. Використовує nut.js
 * (@nut-tree-fork/nut-js). Якщо пакет не встановлено — повертає зрозумілу помилку.
 *
 * Підтримувані дії (action):
 *   - focusWindow { titleContains }   — сфокусувати вікно 1С за частиною заголовка
 *   - key { keys: ["LeftControl","Enter"] } — натиснути комбінацію
 *   - type { text }                   — ввести текст (кирилиця → буфер + Ctrl+V)
 *   - paste { text }                  — завжди вставка через буфер + Ctrl+V
 *   - click { x, y, button? }         — клік по координатах
 *   - move { x, y }                   — перемістити курсор
 *   - wait { ms }                     — пауза
 *   - screenshot { name }             — зберегти скриншот (для діагностики)
 *   - comment { text }                — нічого не робить, лише для читабельності конфігу
 *   - openSaveAs                      — відкрити діалог «Сохранение» (кілька спроб)
 *   - retryOpenSave                   — чекати формування звіту, повторювати Ctrl+S
 *   - selectFileType                  — Tab → список типу → Excel2007 / Down×N → Enter → зберегти
 *   - keySeq { keys }                 — клавіші по одній (меню Alt, F, S…)
 *
 * Плейсхолдери у text: {{filePath}}, {{fileName}}, {{dir}}, {{ts}}
 */

const { focusWindow, findSaveDialog } = require('./focusWindow');
const { setClipboardText, needsClipboard } = require('./clipboard');

let nut = null;
let nutError = null;
try {
  // eslint-disable-next-line global-require
  nut = require('@nut-tree-fork/nut-js');
} catch (e) {
  nutError = e.message;
}

function buildKeyMap(Key) {
  const map = {};
  // прямі назви з enum nut.js
  for (const name of Object.keys(Key)) {
    map[name.toLowerCase()] = Key[name];
  }
  // зручні аліаси
  const alias = {
    ctrl: Key.LeftControl,
    control: Key.LeftControl,
    leftcontrol: Key.LeftControl,
    alt: Key.LeftAlt,
    shift: Key.LeftShift,
    win: Key.LeftSuper,
    enter: Key.Enter,
    return: Key.Return || Key.Enter,
    esc: Key.Escape,
    escape: Key.Escape,
    tab: Key.Tab,
    space: Key.Space,
    del: Key.Delete,
    delete: Key.Delete,
    backspace: Key.Backspace,
  };
  return { ...map, ...alias };
}

function resolvePlaceholders(text, ctx) {
  return String(text || '')
    .replace(/\{\{filePath\}\}/g, ctx.filePath || '')
    .replace(/\{\{fileName\}\}/g, ctx.fileName || '')
    .replace(/\{\{dir\}\}/g, ctx.dir || '')
    .replace(/\{\{ts\}\}/g, ctx.ts || '');
}

function isAvailable() {
  return !!nut;
}

/**
 * Виконати послідовність кроків.
 * @param {object} automation config.automation
 * @param {object} ctx { filePath, fileName, dir, ts, logsDir }
 * @param {(msg:string)=>void} log
 */
async function runSteps(automation, ctx, log) {
  if (!nut) {
    throw new Error(
      `Автоматизація недоступна: пакет @nut-tree-fork/nut-js не встановлено (${nutError}). ` +
        `Виконайте 'npm install' на сервері 1С.`
    );
  }
  const { keyboard, mouse, screen, Point, Button, Key, getWindows } = nut;
  const keyMap = buildKeyMap(Key);
  const perStepDelay = automation.perStepDelayMs ?? 500;

  // повільніше = надійніше для 1С
  keyboard.config.autoDelayMs = 40;
  mouse.config.autoDelayMs = 40;

  const mapKeys = (keys) =>
    (keys || []).map((k) => {
      const key = keyMap[String(k).toLowerCase()];
      if (key === undefined) throw new Error(`Невідома клавіша: ${k}`);
      return key;
    });

  const pressChord = async (keys) => {
    const mapped = mapKeys(keys);
    for (const k of mapped) await keyboard.pressKey(k);
    for (const k of [...mapped].reverse()) await keyboard.releaseKey(k);
  };

  const pressSequence = async (keys, gapMs = 120) => {
    for (const name of keys || []) {
      const k = keyMap[String(name).toLowerCase()];
      if (k === undefined) throw new Error(`Невідома клавіша: ${name}`);
      await keyboard.pressKey(k);
      await keyboard.releaseKey(k);
      await new Promise((r) => setTimeout(r, gapMs));
    }
  };

  const clickReport = async () => {
    const rc = automation.reportClick;
    if (!rc || rc.x == null || rc.y == null) return;
    await mouse.setPosition(new Point(rc.x, rc.y));
    await mouse.click(Button.LEFT);
    log(`✓ Клік у звіт (${rc.x},${rc.y})`);
    await new Promise((r) => setTimeout(r, 400));
  };

  for (let i = 0; i < (automation.steps || []).length; i++) {
    const step = automation.steps[i];
    const tag = `крок ${i + 1}/${automation.steps.length} (${step.action})`;
    try {
      switch (step.action) {
        case 'comment':
          log(`• ${step.text || ''}`);
          break;
        case 'wait':
          await new Promise((r) => setTimeout(r, step.ms || 500));
          break;
        case 'focusWindow':
          await focusWindow(step, automation, getWindows, log);
          break;
        case 'key': {
          await pressChord(step.keys);
          log(`✓ Клавіші: ${(step.keys || []).join('+')}`);
          break;
        }
        case 'keySeq': {
          await pressSequence(step.keys, step.gapMs || 150);
          log(`✓ Послідовність: ${(step.keys || []).join(' ')}`);
          break;
        }
        case 'openSaveAs': {
          const attempts = step.attempts || automation.saveOpenAttempts || [
            { label: 'Ctrl+S', keys: ['LeftControl', 'S'], waitMs: 3000 },
            { label: 'Ctrl+Shift+S', keys: ['LeftControl', 'LeftShift', 'S'], waitMs: 3000 },
            { label: 'Alt, F, S (меню)', keys: ['LeftAlt', 'F', 'S'], sequence: true, waitMs: 3500 },
          ];
          let opened = false;
          for (const att of attempts) {
            await focusWindow(
              { dialog: 'main', titleContains: ['Ведомость', 'Предприятие'] },
              automation,
              getWindows,
              log
            );
            if (att.clickReport !== false) await clickReport();
            if (att.toolbar && automation.toolbarSaveClick) {
              const t = automation.toolbarSaveClick;
              await mouse.setPosition(new Point(t.x, t.y));
              await mouse.click(Button.LEFT);
              log(`✓ Клік «Зберегти» на панелі (${t.x},${t.y})`);
            } else if (att.sequence) {
              await pressSequence(att.keys, att.gapMs || 200);
            } else {
              await pressChord(att.keys);
            }
            await new Promise((r) => setTimeout(r, att.waitMs || 2500));
            if (findSaveDialog(log).ok) {
              log(`✓ Діалог збереження відкрито (${att.label})`);
              opened = true;
              break;
            }
            log(`! Діалог не відкрився після ${att.label}`);
          }
          if (!opened) {
            throw new Error(
              'Діалог «Сохранение» не відкрився. Вручну: після Сформировать натисніть кнопку збереження на панелі 1С ' +
                'і задайте координати toolbarSaveClick у config.json (або напишіть, яка клавіша/меню працює).'
            );
          }
          break;
        }
        case 'retryOpenSave': {
          const minWaitMs = step.minWaitMs ?? automation.formWaitMs ?? 30000;
          const maxAttempts = step.maxAttempts ?? automation.saveRetry?.maxAttempts ?? 15;
          const intervalMs = step.intervalMs ?? automation.saveRetry?.intervalMs ?? 5000;
          const dialogWaitMs = step.dialogWaitMs ?? 2500;

          log(`Очікування формування звіту: ${Math.round(minWaitMs / 1000)} с перед першою спробою збереження…`);
          await new Promise((r) => setTimeout(r, minWaitMs));

          let opened = false;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            log(`Спроба відкрити «Сохранение» ${attempt}/${maxAttempts}`);
            await focusWindow(
              { dialog: 'main', titleContains: ['Ведомость', 'Предприятие'] },
              automation,
              getWindows,
              log
            );
            await clickReport();
            await pressChord(['LeftControl', 'S']);
            await new Promise((r) => setTimeout(r, dialogWaitMs));
            if (findSaveDialog(log).ok) {
              log(`✓ Діалог збереження відкрито (спроба ${attempt})`);
              opened = true;
              break;
            }
            if (attempt < maxAttempts) {
              log(`! Звіт ще формується — чекаємо ще ${Math.round(intervalMs / 1000)} с…`);
              await new Promise((r) => setTimeout(r, intervalMs));
            }
          }
          if (!opened) {
            throw new Error(
              `Діалог «Сохранение» не відкрився після ${maxAttempts} спроб. ` +
                `Збільште formWaitMs / saveRetry у config.json (зараз min=${minWaitMs}ms, interval=${intervalMs}ms).`
            );
          }
          break;
        }
        case 'selectFileType': {
          const saveFocus = {
            dialog: 'save',
            preferShort: true,
            titleContains: ['Сохранение', 'Сохранить'],
          };
          await focusWindow(saveFocus, automation, getWindows, log);
          await new Promise((r) => setTimeout(r, 400));

          const downCount =
            step.downCount ??
            automation.fileTypeDownCount ??
            ctx.save?.fileTypeDownCount ??
            8;
          const filterText =
            step.filterText ||
            automation.fileTypeFilterText ||
            ctx.save?.fileTypeFilterText ||
            '';
          const typeClick = step.click || automation.fileTypeClick;

          if (typeClick?.x != null && typeClick?.y != null) {
            await mouse.setPosition(new Point(typeClick.x, typeClick.y));
            await mouse.click(Button.LEFT);
            log(`✓ Клік по полю «Тип файла» (${typeClick.x},${typeClick.y})`);
            await new Promise((r) => setTimeout(r, 500));
          } else {
            const tabs = step.tabs ?? 1;
            for (let t = 0; t < tabs; t++) {
              await pressChord(['Tab']);
              await new Promise((r) => setTimeout(r, 320));
            }
            log(`✓ Tab × ${tabs} → поле типу файлу`);
          }

          const openWith = step.openWith ?? 'none';
          if (openWith === 'f4' || openWith === 'both') {
            await pressChord(['F4']);
            await new Promise((r) => setTimeout(r, 700));
            log('✓ F4 — розкрито список типів');
          }
          if (openWith === 'altDown' || openWith === 'both') {
            await pressChord(['LeftAlt', 'Down']);
            await new Promise((r) => setTimeout(r, 700));
            log('✓ Alt+Down — розкрито список типів');
          }

          if (downCount > 0) {
            if (step.homeBeforeDown === true) {
              await pressChord(['Home']);
              await new Promise((r) => setTimeout(r, 250));
            }
            for (let d = 0; d < downCount; d++) {
              await pressChord(['Down']);
              await new Promise((r) => setTimeout(r, 90));
            }
            log(`✓ Тип файлу: Down × ${downCount} (після Tab)`);
          } else if (filterText) {
            await keyboard.type(String(filterText));
            await new Promise((r) => setTimeout(r, 450));
            log(`✓ Тип файлу: набрано «${filterText}»`);
          }

          await pressChord(['Enter']);
          await new Promise((r) => setTimeout(r, 500));

          const tabsToSave = step.tabsToSave ?? 0;
          for (let t = 0; t < tabsToSave; t++) {
            await pressChord(['Tab']);
            await new Promise((r) => setTimeout(r, 250));
          }
          if (step.confirmSave !== false) {
            await pressChord(['Enter']);
            log('✓ Натиснуто «Сохранить» (Enter)');
          }
          break;
        }
        case 'type':
        case 'paste': {
          const text = resolvePlaceholders(step.text, ctx);
          const useClip =
            step.action === 'paste' ||
            step.paste === true ||
            step.method === 'paste' ||
            (process.platform === 'win32' && needsClipboard(text));
          if (step.focusBefore) {
            await focusWindow(step.focusBefore, automation, getWindows, log);
            await new Promise((r) => setTimeout(r, 300));
          }
          if (useClip) {
            setClipboardText(text);
            if (step.focusAfterClipboard) {
              await focusWindow(step.focusAfterClipboard, automation, getWindows, log);
              await new Promise((r) => setTimeout(r, 300));
            }
            const pasteKeys = mapKeys(['LeftControl', 'V']);
            for (const k of pasteKeys) await keyboard.pressKey(k);
            for (const k of [...pasteKeys].reverse()) await keyboard.releaseKey(k);
            log(`✓ Вставлено з буфера (${text.length} символів)`);
          } else {
            await keyboard.type(text);
            log(`✓ Введено текст (${text.length} символів)`);
          }
          break;
        }
        case 'click': {
          await mouse.setPosition(new Point(step.x, step.y));
          const btn = step.button === 'right' ? Button.RIGHT : Button.LEFT;
          await mouse.click(btn);
          log(`✓ Клік (${step.x},${step.y})`);
          break;
        }
        case 'move':
          await mouse.setPosition(new Point(step.x, step.y));
          break;
        case 'screenshot': {
          try {
            const name = step.name || `step-${i + 1}`;
            await screen.capture(name, undefined, ctx.logsDir);
            log(`✓ Скриншот: ${name}`);
          } catch (e) {
            log(`! Скриншот не вдався: ${e.message}`);
          }
          break;
        }
        default:
          log(`! Невідома дія: ${step.action}`);
      }
      if (step.action !== 'wait' && perStepDelay) {
        await new Promise((r) => setTimeout(r, perStepDelay));
      }
    } catch (err) {
      if (automation.screenshotOnError && screen) {
        try {
          await screen.capture(`error-step-${i + 1}`, undefined, ctx.logsDir);
        } catch (_) {
          /* ignore */
        }
      }
      throw new Error(`Помилка на ${tag}: ${err.message}`);
    }
  }
}

module.exports = { runSteps, isAvailable, nutError: () => nutError };
