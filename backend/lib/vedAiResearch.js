/**
 * ШІ-дослідження постачальників для панелі ВЕД.
 * Веб-контекст: SerpApi (SERPAPI_API_KEY). LLM: OPENAI_API_KEY / PRODUCT_ASSISTANT_LLM_API_KEY.
 *
 * VED_AI_ENABLED=0 — вимкнути модуль
 * VED_AI_DAILY_LIMIT — ліміт сесій на користувача на добу (типово 8)
 * VED_AI_MAX_CANDIDATES — скільки кандидатів просити у LLM (типово 5)
 */
const { resolveLlmApiKey } = require('../productCardAssistantLlm');
const { resolveSerpApiKey } = require('../productCardAssistantSerpApiImages');

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_WEB_CONTEXT = 9000;
const MAX_USER_PROMPT = 6000;

const EQUIPMENT_SEARCH_HINTS = {
  generator_diesel: 'diesel generator genset industrial silent canopy export manufacturer supplier',
  generator_benzin_gas: 'gasoline portable generator LP gas dual fuel export supplier OEM',
  inverter_lifepo4: 'hybrid inverter LiFePO4 battery energy storage ESS supplier OEM export',
  batteries_lifepo4: 'LiFePO4 lithium battery rack BMS supplier OEM export manufacturer',
  other: 'power equipment industrial supplier export manufacturer',
};

const EQUIPMENT_LABELS_UK = {
  generator_diesel: 'Дизель-генератор',
  generator_benzin_gas: 'Бензин/газовий генератор',
  inverter_lifepo4: 'Інвертор + LiFePO4',
  batteries_lifepo4: 'Батареї LiFePO4',
  other: 'Інше обладнання',
};

const SYSTEM_PROMPT = `Ти аналітик відділу зовнішньоекономічної діяльності (ВЕД) компанії з України.
Завдання: за описом заявки на імпорт обладнання підібрати 3–5 зарубіжних постачальників-кандидатів для подальшої перевірки людиною.

Поверни ЛИШЕ один JSON-об'єкт без markdown:
{
  "summary": "короткий висновок українською (2–4 речення)",
  "recommendations": ["рекомендація 1", "..."],
  "candidates": [
    {
      "supplierName": "назва компанії",
      "country": "країна",
      "website": "https://... або порожній рядок",
      "contact": "email або телефон або порожній",
      "productModel": "модель / лінійка продукції",
      "productSummary": "коротко що пропонують",
      "priceEstimate": null або число,
      "priceStatus": "unverified | estimated | quoted",
      "currency": "USD|EUR|CNY|... або порожній",
      "incotermsHint": "FOB/CIF/EXW або порожній — лише якщо знайдено в джерелах",
      "moqHint": "MOQ текстом або порожній",
      "leadTimeHint": "термін поставки текстом або порожній",
      "prepaymentPercentHint": null або число 0–100,
      "riskNotes": ["ризик 1", "..."],
      "strengths": ["перевага 1", "..."],
      "sourceUrls": ["https://...", "..."]
    }
  ]
}

Правила:
- Не вигадуй контакти, ціни та умови — якщо немає в уривках веб-пошуку, лишай порожнім/null і priceStatus=unverified.
- sourceUrls — лише URL, що згадані в контексті пошуку або логічно випливають з відомих сайтів компаній; не більше 5 на кандидата.
- riskNotes — гіпотези (санкції, prepayment 100%, новий домен, відсутність сертифікатів) — не категоричні висновки.
- candidates: від 3 до MAX_CANDIDATES, різні країни/профілі де можливо.
- Це чернетка для ВЕД-фахівця, не договірна пропозиція.`;

function stripJsonFence(text) {
  const s = String(text || '').trim();
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : s;
}

function vedAiEnabled() {
  const v = String(process.env.VED_AI_ENABLED || '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return Boolean(resolveLlmApiKey());
}

function vedAiDailyLimit() {
  const n = parseInt(String(process.env.VED_AI_DAILY_LIMIT || '8'), 10);
  return Math.min(50, Math.max(1, n || 8));
}

function vedAiMaxCandidates() {
  const n = parseInt(String(process.env.VED_AI_MAX_CANDIDATES || '5'), 10);
  return Math.min(8, Math.max(3, n || 5));
}

function buildSearchQueries(requestDoc, extraHint = '') {
  const hint = EQUIPMENT_SEARCH_HINTS[requestDoc.equipmentType] || EQUIPMENT_SEARCH_HINTS.other;
  const name = String(requestDoc.equipmentName || '').trim().slice(0, 120);
  const tech = String(requestDoc.technicalRequirements || '').trim().slice(0, 200);
  const extra = String(extraHint || '').trim().slice(0, 120);
  const parts = [name, tech, extra].filter(Boolean).join(' ').slice(0, 220);

  const seen = new Set();
  const out = [];
  const push = (q) => {
    const t = String(q || '').trim().slice(0, 200);
    if (t.length < 8) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  push(`${parts} ${hint} manufacturer export contact`);
  push(`${parts} supplier FOB CIF price MOQ`);
  if (requestDoc.equipmentType === 'inverter_lifepo4' || requestDoc.equipmentType === 'batteries_lifepo4') {
    push(`${parts} LiFePO4 OEM factory CE UL certification`);
  }
  if (requestDoc.equipmentType === 'generator_diesel') {
    push(`${parts} diesel genset Perkins Cummins OEM export`);
  }
  push(`${parts} Alibaba Europages supplier`);

  return out.slice(0, 4);
}

function buildUserPrompt(requestDoc, webContext, maxCandidates) {
  const lines = [
    `Заявка: ${requestDoc.requestNumber || ''}`,
    `Тип: ${EQUIPMENT_LABELS_UK[requestDoc.equipmentType] || requestDoc.equipmentType}`,
    `Найменування: ${requestDoc.equipmentName || '—'}`,
    `Кількість: ${requestDoc.quantity ?? 1}`,
    `Технічні вимоги:\n${requestDoc.technicalRequirements || '—'}`,
    `Коментар менеджера: ${requestDoc.managerComment || '—'}`,
    `Бажаний термін: ${requestDoc.desiredDeliveryDate || '—'}`,
    `\nПотрібно до ${maxCandidates} кандидатів-постачальників.`,
  ];
  if (webContext) {
    lines.push(`\n--- Уривки з веб-пошуку (SerpApi). Використовуй як джерело; не вигадуй поза контекстом. ---\n${webContext}`);
  } else {
    lines.push('\n--- Веб-пошук недоступний. Формуй обережні гіпотези; багато полів лишай порожніми. ---');
  }
  return lines.join('\n').slice(0, MAX_USER_PROMPT);
}

async function fetchVedWebContext(queries) {
  const apiKey = resolveSerpApiKey();
  if (!apiKey || !queries.length) return { context: '', sources: [] };

  const google_domain = String(process.env.SERPAPI_GOOGLE_DOMAIN || 'google.com.ua').trim() || 'google.com.ua';
  const gl = String(process.env.SERPAPI_GL || 'ua').trim() || 'ua';
  const hl = String(process.env.SERPAPI_HL || 'uk').trim() || 'uk';
  const perQuery = Math.min(8, Math.max(4, parseInt(String(process.env.VED_AI_ORGANIC_PER_QUERY || '6'), 10) || 6));

  const blocks = [];
  const sources = [];
  const seenLinks = new Set();
  let n = 0;

  for (const q of queries) {
    const sp = new URLSearchParams({
      engine: 'google',
      api_key: apiKey,
      q,
      google_domain,
      gl,
      hl,
      safe: 'active',
    });
    let data;
    try {
      const r = await fetch(`${SERPAPI_ENDPOINT}?${sp.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) continue;
      data = await r.json();
    } catch (e) {
      console.warn('[ved-ai] SerpApi:', e.message);
      continue;
    }

    const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
    for (const row of organic.slice(0, perQuery)) {
      const link = String(row?.link || '').trim();
      const title = String(row?.title || '').trim().slice(0, 220);
      const snippet = String(row?.snippet || '').trim().slice(0, 700);
      if (!snippet && !title) continue;
      if (link && seenLinks.has(link)) continue;
      if (link) {
        seenLinks.add(link);
        sources.push({ url: link, title: title || link, snippet: snippet.slice(0, 400) });
      }
      n += 1;
      const lines = [`[${n}] ${title || '(без заголовка)'}`];
      if (link) lines.push(link);
      if (snippet) lines.push(snippet);
      blocks.push(lines.join('\n'));
      if (blocks.join('\n\n').length >= MAX_WEB_CONTEXT) break;
    }
    if (blocks.join('\n\n').length >= MAX_WEB_CONTEXT) break;
  }

  return {
    context: blocks.join('\n\n').slice(0, MAX_WEB_CONTEXT),
    sources: sources.slice(0, 30),
  };
}

function normalizeCandidate(raw, idx) {
  const priceStatus = ['unverified', 'estimated', 'quoted'].includes(String(raw?.priceStatus || '').toLowerCase())
    ? String(raw.priceStatus).toLowerCase()
    : 'unverified';
  let priceEstimate = raw?.priceEstimate;
  if (priceEstimate != null) {
    const n = Number(priceEstimate);
    priceEstimate = Number.isFinite(n) && n >= 0 ? n : null;
  } else {
    priceEstimate = null;
  }
  let prep = raw?.prepaymentPercentHint;
  if (prep != null) {
    const n = Number(prep);
    prep = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
  } else {
    prep = null;
  }
  const sourceUrls = Array.isArray(raw?.sourceUrls)
    ? raw.sourceUrls.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 5)
    : [];

  return {
    supplierName: String(raw?.supplierName || '').trim().slice(0, 200),
    country: String(raw?.country || '').trim().slice(0, 120),
    website: String(raw?.website || '').trim().slice(0, 300),
    contact: String(raw?.contact || '').trim().slice(0, 300),
    productModel: String(raw?.productModel || '').trim().slice(0, 300),
    productSummary: String(raw?.productSummary || '').trim().slice(0, 800),
    priceEstimate,
    priceStatus,
    currency: String(raw?.currency || '').trim().slice(0, 12).toUpperCase(),
    incotermsHint: String(raw?.incotermsHint || '').trim().slice(0, 40).toUpperCase(),
    moqHint: String(raw?.moqHint || '').trim().slice(0, 120),
    leadTimeHint: String(raw?.leadTimeHint || '').trim().slice(0, 120),
    prepaymentPercentHint: prep,
    riskNotes: Array.isArray(raw?.riskNotes)
      ? raw.riskNotes.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    strengths: Array.isArray(raw?.strengths)
      ? raw.strengths.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6)
      : [],
    sourceUrls,
    addedToProposalId: null,
    sortOrder: idx,
  };
}

function normalizeLlmResult(parsed, model, maxCandidates) {
  const candidatesRaw = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const candidates = candidatesRaw
    .map((c, i) => normalizeCandidate(c, i))
    .filter((c) => c.supplierName || c.website || c.productModel)
    .slice(0, maxCandidates);

  return {
    summary: String(parsed?.summary || '').trim().slice(0, 2000),
    recommendations: Array.isArray(parsed?.recommendations)
      ? parsed.recommendations.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    candidates,
    llmModel: model,
    disclaimer:
      'Результат згенеровано ШІ на основі відкритих джерел. Ціни, контакти та умови потребують обов’язкової перевірки ВЕД-фахівцем перед RFQ/договором.',
  };
}

async function callVedLlm(userPrompt, maxCandidates) {
  const apiKey = resolveLlmApiKey();
  if (!apiKey) throw new Error('LLM не налаштовано (OPENAI_API_KEY або PRODUCT_ASSISTANT_LLM_API_KEY)');

  const base = String(process.env.PRODUCT_ASSISTANT_LLM_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const model = String(process.env.VED_AI_LLM_MODEL || process.env.PRODUCT_ASSISTANT_LLM_MODEL || DEFAULT_MODEL).trim();
  const timeoutMs = Math.min(
    120000,
    Math.max(15000, parseInt(String(process.env.VED_AI_LLM_TIMEOUT_MS || '90000'), 10) || 90000)
  );

  const system = SYSTEM_PROMPT.replace('MAX_CANDIDATES', String(maxCandidates));
  const url = `${base}/chat/completions`;
  const body = {
    model,
    temperature: 0.35,
    max_tokens: 3500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM повернув порожню відповідь');

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch (e) {
    throw new Error('LLM повернув некоректний JSON');
  }

  return normalizeLlmResult(parsed, model, maxCandidates);
}

/**
 * @param {object} requestDoc — lean VedImportRequest
 * @param {{ extraSearchHint?: string }} options
 */
async function runVedSupplierResearch(requestDoc, options = {}) {
  if (!vedAiEnabled()) {
    throw new Error('ШІ-модуль ВЕД вимкнено або не налаштовано LLM');
  }

  const maxCandidates = vedAiMaxCandidates();
  const searchQueries = buildSearchQueries(requestDoc, options.extraSearchHint);
  const { context: webContext, sources } = await fetchVedWebContext(searchQueries);
  const userPrompt = buildUserPrompt(requestDoc, webContext, maxCandidates);
  const llmResult = await callVedLlm(userPrompt, maxCandidates);

  return {
    searchQueries,
    webContextPreview: webContext.slice(0, 4000),
    sources,
    userPromptPreview: userPrompt.slice(0, 4000),
    ...llmResult,
    hasWebSearch: Boolean(resolveSerpApiKey()),
  };
}

function candidateToProposalDraft(candidate) {
  const commentParts = [
    candidate.productSummary,
    candidate.riskNotes?.length ? `Ризики (ШІ): ${candidate.riskNotes.join('; ')}` : '',
    candidate.strengths?.length ? `Переваги (ШІ): ${candidate.strengths.join('; ')}` : '',
    candidate.priceStatus === 'unverified'
      ? 'Ціна з ШІ: не перевірено — потрібен запит пропозиції.'
      : `Ціна з ШІ (${candidate.priceStatus}): потребує верифікації.`,
    candidate.sourceUrls?.length ? `Джерела: ${candidate.sourceUrls.join(', ')}` : '',
  ].filter(Boolean);

  return {
    supplierName: candidate.supplierName || '',
    country: candidate.country || '',
    website: candidate.website || '',
    contact: candidate.contact || '',
    productModel: candidate.productModel || '',
    price: candidate.priceEstimate,
    currency: candidate.currency || '',
    incoterms: candidate.incotermsHint || '',
    moq: candidate.moqHint || '',
    leadTime: candidate.leadTimeHint || '',
    prepaymentPercent: candidate.prepaymentPercentHint,
    paymentTerms: '',
    comment: commentParts.join('\n').slice(0, 8000),
  };
}

module.exports = {
  vedAiEnabled,
  vedAiDailyLimit,
  vedAiMaxCandidates,
  buildSearchQueries,
  runVedSupplierResearch,
  candidateToProposalDraft,
  resolveSerpApiKey,
  resolveLlmApiKey,
};
