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
 *   - type { text }                   — ввести текст (підтримує плейсхолдери)
 *   - click { x, y, button? }         — клік по координатах
 *   - move { x, y }                   — перемістити курсор
 *   - wait { ms }                     — пауза
 *   - screenshot { name }             — зберегти скриншот (для діагностики)
 *   - comment { text }                — нічого не робить, лише для читабельності конфігу
 *
 * Плейсхолдери у text: {{filePath}}, {{fileName}}, {{dir}}, {{ts}}
 */

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
        case 'focusWindow': {
          const want = (step.titleContains || automation.windowTitleContains || '1С').toLowerCase();
          const wins = await getWindows();
          let focused = false;
          for (const w of wins) {
            let title = '';
            try {
              title = String(await w.getTitle());
            } catch (_) {
              /* ignore */
            }
            if (title.toLowerCase().includes(want)) {
              await w.focus();
              focused = true;
              log(`✓ Сфокусовано вікно: ${title}`);
              break;
            }
          }
          if (!focused) throw new Error(`Не знайдено вікно з заголовком, що містить «${step.titleContains || want}». Переконайтесь, що 1С відкрита і звіт активний.`);
          break;
        }
        case 'key': {
          const keys = mapKeys(step.keys);
          for (const k of keys) await keyboard.pressKey(k);
          for (const k of [...keys].reverse()) await keyboard.releaseKey(k);
          log(`✓ Клавіші: ${(step.keys || []).join('+')}`);
          break;
        }
        case 'type': {
          const text = resolvePlaceholders(step.text, ctx);
          await keyboard.type(text);
          log(`✓ Введено текст (${text.length} символів)`);
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
