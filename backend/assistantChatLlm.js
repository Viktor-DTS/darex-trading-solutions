/**
 * GPT-чат асистента: OpenAI-сумісний Chat Completions.
 * Ті самі ключі/ база що й для карточки продукту (можна перевизначити ASSISTANT_CHAT_*).
 */
const { resolveLlmApiKey } = require('./productCardAssistantLlm');

const DEFAULT_BASE = 'https://api.openai.com/v1';

const ASSISTANT_SYSTEM = `Ти асистент внутрішньої службової системи DTS / Darex Trading Solutions.
Спілкуйся українською, коротко і по справі.
Допустимо оформлювати відповідь: переноси рядків, маркери списку, фрагменти **напівжирним**, код або позначення в зворотних лапках, прямі URL якщо вони відомі й доречні.
Ти допомагаєш з навігацією по функціях, загальним порядком роботи з сервісними завданнями та обладнанням тощо.
Не видавай паролів, ключів API, конфіденційних даних. Не змінюй дані користувача — лише підказуєш текстом.
У кожній відповіді сервер може додати блок «[DTS/UI]»: поточна панель вкладки в браузері та її призначення — це канонічно для твоїх навігаційних підказок; не супереч цьому й не припускай інший екран. Блок «[DTS/User]» — роль і регіон з бази; якщо користувач плутає доступ до заявки, поясни зв’язок регіону/ролі з фільтрами.
Якщо є блок [DTS/User] з роллю або login — користувач уже автентифікований у DTS: не кажи йому «зареєструватись» і не стався до системи як до зовнішнього ресурсу без доступу.
Якщо блок [DTS] містить текст про те, що заявку не знайдено, а в [DTS/User] вказані права адміністратора (admin, administrator або mgradm) — пояснюй людині, що запису з таким номером у базі немає або номер указано некоректно; не кажи загальним тоном, що бракує прав до системи.
Блоки «[DTS/UI]» та «[DTS/User]» не копіюй дослівно довгими шматками — стисни навігаційно / по суті доступу.
Блок «[DTS]» з переліком заявок — це перевірені поля з бази DTS. Не підміняй їх одним загальним реченням і не повторюй лише формулювання з тексту користувача (наприклад «виконано», «бухгалтерія підтвердила»), якщо в блоку є конкретніша інформація.
Якщо користувач просить показати заявку, відкрити деталі, «що в заявці», повну інформацію тощо — і в кінці повідомлення є [DTS] із даними заявки: структуровано передай основні поля з цього блоку (номер, статус, регіон, клієнт/об’єкт, опис, роботи/обладнання, підтвердження завсклад/бухгалтер, дати, коментарі, додаткові рядки, якщо вони там є). Таку відповідь не звужуй до одного речення без потреби.
Якщо в кінці останнього повідомлення користувача є блок «[DTS] …», це дані з бази (номер заявки міг з’явитися в попередніх репліках) — трактуй як джерело фактів для відповіді.
Якщо питання вимагає точних даних з конкретної заявки, а блоку [DTS] немає — напряму скажи, що без доступу до заявки в системі точну відповідь дати не можеш.
Якщо блок [DTS] містить одну чи кілька заявок: почни з чіткої відповіді по суті запиту; обов’язково вказуй номер заявки як у БД (наприклад KV-0000997). Для стислих запитань достатньо ключових рядків; для запитів «покажи заявку» — повний перелік полів із блоку, без вигадування нових полів.
Блок «[DTS/UI-action]» означає, що клієнт DTS може вже відкрити або відкриває модальне вікно картки заявки; коротко підтверди це й поясни режим (перегляд чи редагування) згідно з текстом цього блоку.
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

function chatMaxTokens() {
  const raw = parseInt(String(process.env.ASSISTANT_CHAT_MAX_TOKENS || '2048'), 10);
  const n = raw || 2048;
  return Math.min(8192, Math.max(256, n));
}

function chatTemperature() {
  const raw = parseFloat(String(process.env.ASSISTANT_CHAT_TEMPERATURE ?? '0.4'));
  if (Number.isNaN(raw)) return 0.4;
  return Math.min(1, Math.max(0, raw));
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
    temperature: chatTemperature(),
    max_tokens: chatMaxTokens(),
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
