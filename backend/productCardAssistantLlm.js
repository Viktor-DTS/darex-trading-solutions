/**
 * Опційний шар LLM для асистента карточки продукту (OpenAI-сумісний Chat Completions API).
 *
 * Змінні оточення:
 *   PRODUCT_ASSISTANT_LLM_API_KEY — пріоритетний ключ
 *   OPENAI_API_KEY — запасний (зручно для Render, якщо вже є ключ для інших функцій)
 *   PRODUCT_ASSISTANT_LLM_BASE_URL — за замовчуванням https://api.openai.com/v1
 *   PRODUCT_ASSISTANT_LLM_MODEL — за замовчуванням gpt-4o-mini
 *   PRODUCT_ASSISTANT_LLM_TIMEOUT_MS — таймаут запиту (мс), за замовчуванням 25000
 *
 * Опційно (див. productCardAssistant.js): другий аргумент { serpWebContext } — уривки organic Google (SerpApi)
 * для обґрунтування specs; дисклеймер доповнюється автоматично.
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
- imageSearchQueries: від 0 до 6 рядків. Використовуються для **пошуку зображень у Wikimedia Commons** (сервер додає ще технічні варіанти; опційно SerpApi для прев’ю). Пиши **2–4 англомовні** короткі рядки: тип продукту + **код моделі з назви** (DE-44BDS, NB1-63) + бренд/параметри (напр. "Darex diesel generator DE-44BDS 44kW 380V", "modular MCB 1P C16 6kA", "SAE 10W40 motor oil CASTLE"). Додай **1–2 українською**, якщо вхідна назва українською — для Commons (назви файлів часто змішані; напр. "дизель генератор DE-44BDS 44 кВт", "модульний автомат 1P C16"). Для дизель-генератора додай generator або genset або industrial enclosure, не лише diesel. Для **охолоджувальної рідини / антифризу / G11–G13**: "G12 engine coolant antifreeze", "automotive coolant bottle G12". Різноманітність важливіша за дублікати. Не внось «без АВР», «без НДС», «опт» у фото-запити. Якщо невпевнений — [].
- Якщо з назви випливають лише розміри / потужність / напруга — додай їх у specs з зрозумілими назвами полів.
- Для модульних автоматів / MCB: 1P/2P/3P/4P — кількість полюсів; C16/B6 тощо — крива та номінальний струм (А); 6kA/10kA — короткочасний струм відключення (кА), якщо є в назві.
- Якщо невпевнений — менше полів, порожній manufacturerHint.
- Не більше ${MAX_SPECS} елементів у specs.`;

const SERP_CONTEXT_RULES = `

Додатково, якщо в повідомленні користувача є блок «Уривки з веб-пошуку»:
- Це короткі сніпети з видачі Google, не повний каталог.
- У **specs** додавай **конкретні числа та одиниці** лише якщо вони **явно** є в уривках або в оригінальній назві товару.
- При суперечності між уривками не об’єднуй у одне поле; краще менше полів.
- Якщо з уривків однозначно випливає виробник — можна коротко в manufacturerHint.
- Не вставляй у value посилання чи маркери [1], [2]; формулюй для людини на складі.`;

function buildSystemPrompt(withSerpSnippets) {
  return withSerpSnippets ? SYSTEM + SERP_CONTEXT_RULES : SYSTEM;
}

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

const MAX_SERP_CONTEXT_IN_LLM = 8500;

/**
 * @param {string} query
 * @param {{ serpWebContext?: string }} [options]
 * @returns {Promise<null | object>}
 */
async function llmSuggest(query, options = {}) {
  const apiKey = resolveLlmApiKey();
  if (!apiKey) return null;

  const serpWebContext = String(options.serpWebContext || '').trim();
  const hasSerp = serpWebContext.length >= 20;

  const base = String(process.env.PRODUCT_ASSISTANT_LLM_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const model = String(process.env.PRODUCT_ASSISTANT_LLM_MODEL || DEFAULT_MODEL).trim();
  const timeoutMs = Math.min(
    120000,
    Math.max(3000, parseInt(String(process.env.PRODUCT_ASSISTANT_LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS),
  );

  let userContent = `Назва / тип товару для картки:\n${String(query).trim().slice(0, 2000)}`;
  if (hasSerp) {
    userContent += `\n\n--- Уривки з веб-пошуку (SerpApi / Google). Використовуй як джерело підказок; якщо даних немає в уривках — не вигадуй. ---\n${serpWebContext.slice(0, MAX_SERP_CONTEXT_IN_LLM)}`;
  }

  const url = `${base}/chat/completions`;
  const body = {
    model,
    temperature: 0.25,
    max_tokens: hasSerp ? 1600 : 1200,
    messages: [
      { role: 'system', content: buildSystemPrompt(hasSerp) },
      {
        role: 'user',
        content: userContent,
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

  const payload = normalizePayload(parsed, model);
  if (!payload) return null;
  if (hasSerp) {
    const extra =
      '\n\nЧастина полів може ґрунтуватися на уривках веб-пошуку (SerpApi); перевірте цифри та найменування за офіційним каталогом або паспортом.';
    if (!String(payload.disclaimer || '').includes('SerpApi')) {
      return { ...payload, disclaimer: String(payload.disclaimer || '').trim() + extra };
    }
  }
  return payload;
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
