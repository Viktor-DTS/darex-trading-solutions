/**
 * GPT-чат асистента: OpenAI-сумісний Chat Completions.
 * Ті самі ключі/ база що й для карточки продукту (можна перевизначити ASSISTANT_CHAT_*).
 */
const { resolveLlmApiKey } = require('./productCardAssistantLlm');

const DEFAULT_BASE = 'https://api.openai.com/v1';

const ASSISTANT_SYSTEM = `Ти асистент внутрішньої службової системи DTS / Darex Trading Solutions.
Спілкуйся українською, коротко і по справі.
Ти допомагаєш з навігацією по функціях, загальним порядком роботи з сервісними завданнями та обладнанням тощо.
Не видавай паролів, ключів API, конфіденційних даних. Не змінюй дані користувача — лише підказуєш текстом.
Якщо в кінці останнього повідомлення користувача є блок «[DTS] …», це дані, підставлені сервером з бази DTS (номер заявки міг з’явитися в попередніх репліках діалогу) — трактуй їх як перевірені для цієї відповіді (але не показуй сирого блоку дословно, якщо користувач не просить).
Якщо питання вимагає точних даних з конкретної заявки, а блоку [DTS] немає — напряму скажи, що без доступу до заявки в системі точну відповідь дати не можеш.
Не давай юридичних чи податкових гарантій; за потреби направ до бухгалтерії або керівника.`;

function chatModel() {
  return String(
    process.env.ASSISTANT_CHAT_MODEL ||
      process.env.PRODUCT_ASSISTANT_LLM_MODEL ||
      'gpt-4o-mini',
  ).trim();
}

function chatBaseUrl() {
  return String(process.env.ASSISTANT_CHAT_BASE_URL || process.env.PRODUCT_ASSISTANT_LLM_BASE_URL || DEFAULT_BASE).replace(
    /\/$/,
    '',
  );
}

function chatTimeoutMs() {
  const t = parseInt(String(process.env.ASSISTANT_CHAT_TIMEOUT_MS || '60000'), 10);
  return Math.min(120000, Math.max(10000, t || 60000));
}

/**
 * @param {{ role: string, content: string }[]} messages — без system; він додається тут.
 * @returns {{ content: string, model: string }}
 */
async function assistantChatCompletion(messages) {
  const apiKey = resolveLlmApiKey();
  if (!apiKey) {
    const err = new Error('LLM ключ не налаштований (PRODUCT_ASSISTANT_LLM_API_KEY або OPENAI_API_KEY)');
    err.code = 'NO_LLM_KEY';
    throw err;
  }

  const model = chatModel();
  const base = chatBaseUrl();
  const url = `${base}/chat/completions`;

  const body = {
    model,
    temperature: 0.4,
    max_tokens: 1200,
    messages: [{ role: 'system', content: ASSISTANT_SYSTEM }, ...messages],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(chatTimeoutMs()),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 200)}`);
    err.code = 'LLM_HTTP_ERROR';
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    const err = new Error('Модель не повернула текст відповіді');
    err.code = 'LLM_EMPTY';
    throw err;
  }

  return { content: String(content).trim(), model };
}

module.exports = { assistantChatCompletion, ASSISTANT_SYSTEM };
