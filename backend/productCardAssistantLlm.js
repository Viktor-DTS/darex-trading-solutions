/**
 * Опційний шар LLM для асистента карточки продукту (OpenAI-сумісний Chat Completions API).
 *
 * Змінні оточення:
 *   PRODUCT_ASSISTANT_LLM_API_KEY — якщо порожньо, LLM не викликається
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
  "specs": [ { "name": "назва характеристики українською", "value": "значення" } ]
}
Правила:
- Не вигадуй артикули, штрихкоди, URL зображень.
- Якщо з назви випливають лише розміри / потужність / напруга — додай їх у specs з зрозумілими назвами полів.
- Якщо невпевнений — менше полів, порожній manufacturerHint.
- Не більше ${MAX_SPECS} елементів у specs.`;

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
  const hasContent =
    specs.length > 0 || suggestedName.length > 0 || manufacturerHint.length > 0;
  if (!hasContent) return null;
  return {
    source: 'llm',
    llmModel: model,
    suggestedName,
    manufacturerHint,
    specs,
    images: [],
    disclaimer:
      'Дані згенеровані мовною моделлю; можливі помилки та домисли. Обов’язково перевірте цифри та найменування перед збереженням карточки.',
  };
}

/**
 * @param {string} query
 * @returns {Promise<null | object>}
 */
async function llmSuggest(query) {
  const apiKey = String(process.env.PRODUCT_ASSISTANT_LLM_API_KEY || '').trim();
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
    temperature: 0.2,
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

module.exports = { llmSuggest };
