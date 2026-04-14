/**
 * Опційний шар LLM для асистента карточки продукту (OpenAI-сумісний Chat Completions API).
 *
 * Змінні оточення:
 *   PRODUCT_ASSISTANT_LLM_API_KEY — пріоритетний ключ
 *   OPENAI_API_KEY — запасний (зручно для Render, якщо вже є ключ для інших функцій)
 *   PRODUCT_ASSISTANT_LLM_BASE_URL — за замовчуванням https://api.openai.com/v1
 *   PRODUCT_ASSISTANT_LLM_MODEL — за замовчуванням gpt-4o-mini
 *   PRODUCT_ASSISTANT_LLM_TIMEOUT_MS — таймаут запиту (мс), за замовчуванням 25000
 */

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 25000;
const MAX_SPECS = 24;
const MAX_STR = 500;

const SYSTEM = `Ти допомагаєш завскладу розібрати назву товару для картки номенклатури.
Поверни ЛИШЕ один JSON-об'єкт без markdown і без тексту поза JSON.
Схема:
{
  "suggestedName": "коротка канонічна назва українською або як у джерелі, якщо це бренд",
  "manufacturerHint": "виробник або порожній рядок, якщо невідомо",
  "specs": [ { "name": "назва характеристики українською", "value": "значення" } ],
  "imageSearchQueries": [ "короткий рядок для пошуку фото (без URL)", "..." ]
}
Правила:
- Не вигадуй артикули, штрихкоди, URL зображень.
- imageSearchQueries: від 0 до 6 рядків. Використовуються для **Wikimedia Commons і Google Custom Search** (прев’ю). Пиши переважно **англійською**: тип продукту + **код моделі з назви** (напр. DE-44BDS, NB1-63) + бренд + ключові параметри (напр. "Darex diesel generator DE-44BDS 44kW 380V", "modular MCB 1P C16 6kA", "SAE 10W40 motor oil CASTLE"). Додай **1–2 короткі запити українською**, якщо назва користувача українською — для локальних каталогів і порталів (напр. "дизель генератор DE-44BDS 44 кВт", "модульний автомат 1P C16"). Для дизель-генератора не обмежуйся словом "diesel" — додай generator або genset або industrial enclosure. Для **охолоджувальної рідини / антифризу / G11–G13** (напр. VAMP G-12): "G12 engine coolant antifreeze blue", "automotive coolant bottle G12", "ethylene glycol coolant concentrate". Не дублюй у фото-запитах фрази на кшталт «без АВР», «без НДС», «опт» — вони не допомагають знайти картинку. Якщо невпевнений — [].
- Якщо з назви випливають лише розміри / потужність / напруга — додай їх у specs з зрозумілими назвами полів.
- Для модульних автоматів / MCB: 1P/2P/3P/4P — кількість полюсів; C16/B6 тощо — крива та номінальний струм (А); 6kA/10kA — короткочасний струм відключення (кА), якщо є в назві.
- Якщо невпевнений — менше полів, порожній manufacturerHint.
- Не більше ${MAX_SPECS} елементів у specs.`;

function resolveLlmApiKey() {
  const primary = String(process.env.PRODUCT_ASSISTANT_LLM_API_KEY || '').trim();
  if (primary) return primary;
  return String(process.env.OPENAI_API_KEY || '').trim();
}

function stripJsonFence(text) {
  const s = String(text || '').trim();
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : s;
}

function normalizePayload(parsed, model) {
  const suggestedName = parsed.suggestedName != null ? String(parsed.suggestedName).trim().slice(0, MAX_STR) : '';
  const manufacturerHint =
    parsed.manufacturerHint != null ? String(parsed.manufacturerHint).trim().slice(0, MAX_STR) : '';
  const rawSpecs = Array.isArray(parsed.specs) ? parsed.specs : [];
  const specs = [];
  let n = 0;
  for (const row of rawSpecs) {
    if (!row || typeof row !== 'object') continue;
    const name = row.name != null ? String(row.name).trim().slice(0, 200) : '';
    const value = row.value != null ? String(row.value).trim().slice(0, MAX_STR) : '';
    if (!name && !value) continue;
    specs.push({
      id: `llm-${++n}`,
      name: name || 'Характеристика',
      value: value || '—',
    });
    if (specs.length >= MAX_SPECS) break;
  }
  const rawImgQ = Array.isArray(parsed.imageSearchQueries) ? parsed.imageSearchQueries : [];
  const imageSearchQueries = [];
  for (const x of rawImgQ) {
    const t = String(x || '').trim().slice(0, 160);
    if (t.length >= 2) imageSearchQueries.push(t);
    if (imageSearchQueries.length >= 6) break;
  }
  const hasContent =
    specs.length > 0 ||
    suggestedName.length > 0 ||
    manufacturerHint.length > 0 ||
    imageSearchQueries.length > 0;
  if (!hasContent) return null;
  return {
    source: 'llm',
    llmModel: model,
    suggestedName,
    manufacturerHint,
    specs,
    images: [],
    imageSearchQueries,
    disclaimer:
      'Дані згенеровані мовною моделлю; можливі помилки та домисли. Обов’язково перевірте цифри та найменування перед збереженням карточки.',
  };
}

/**
 * @param {string} query
 * @returns {Promise<null | object>}
 */
async function llmSuggest(query) {
  const apiKey = resolveLlmApiKey();
  if (!apiKey) return null;

  const base = String(process.env.PRODUCT_ASSISTANT_LLM_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const model = String(process.env.PRODUCT_ASSISTANT_LLM_MODEL || DEFAULT_MODEL).trim();
  const timeoutMs = Math.min(
    120000,
    Math.max(3000, parseInt(String(process.env.PRODUCT_ASSISTANT_LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS),
  );

  const url = `${base}/chat/completions`;
  const body = {
    model,
    temperature: 0.25,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Назва / тип товару для картки:\n${String(query).trim().slice(0, 2000)}`,
      },
    ],
  };
  if (process.env.PRODUCT_ASSISTANT_LLM_JSON_MODE !== '0') {
    body.response_format = { type: 'json_object' };
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    console.warn('[product-card-assistant] LLM fetch:', e.message);
    return null;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[product-card-assistant] LLM HTTP', res.status, errText.slice(0, 300));
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    console.warn('[product-card-assistant] LLM JSON parse:', e.message);
    return null;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    console.warn('[product-card-assistant] LLM empty content');
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch (e) {
    console.warn('[product-card-assistant] LLM output not JSON:', e.message);
    return null;
  }

  return normalizePayload(parsed, model);
}

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  if (resolveLlmApiKey()) {
    console.log(
      '[product-card-assistant] LLM увімкнено (PRODUCT_ASSISTANT_LLM_API_KEY або OPENAI_API_KEY). Модель:',
      String(process.env.PRODUCT_ASSISTANT_LLM_MODEL || DEFAULT_MODEL).trim(),
    );
  }
}

module.exports = { llmSuggest, resolveLlmApiKey };
