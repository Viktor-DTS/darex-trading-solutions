/**
 * Чат DTS не створює файли звітів; користувач інколи переходить на такі запити після списку заявок.
 */

/**
 * Запити звіту/контрагент/файлу (укр./рос., різні сполучення).
 * @param {string} messageText
 */
function userMessageAsksOutOfChatScope(messageText) {
  const raw = String(messageText || '').trim();
  if (!raw) return false;

  /** @type {string} нормалізовано нижній регістр для латини + кирилиці окремих шаблонів */
  const s = raw.toLowerCase().replace(/\s+/g, ' ');
  /** російський той же .toLowerCase() */
  const hasCounterpartyUk = /\bконтрагент/iu.test(raw);
  const hasReportUk = /\bзвіт/iu.test(raw);
  /** Росіянські формули («сформировать отчёт») часто збігаються в тексті навіть на укр-сайті */
  const reportRu =
    /отч(ёт|ет|ёта|ета)|экспорт|выгруз|выгрузк|скача(ть)?|ставит(ь)?\s+отчёт|составит(ь)?\s+отчёт|сформулиру|составлен(ие|ии)\s+отч/.test(raw);
  const reportOrFile =
    hasReportUk ||
    reportRu ||
    /експорт|експортуй|експортован|excel|pdf|xlsx|\bxls\b|табличн\w*\s+(у\s+|в\s+|до\s+)файл|файлов\w+|до\s+друку|роздрук|друкувати|скача|скачува|завантаж(ити)?\s+(звіт|файл|таблиц)|згенер(уй|увати)\s+(звіт|файл|документ|таблиц)|підготуй\s+(звіт|файл)|підготувати\s+(звіт|файл)|виписк\w+|довідку\s+(у\s+|в\s+)?файл|аналітичн\w+|зведення.*файл|зведені\s+дані\s+(.{0,20})?(файл|excel)/.test(
      s,
    );
  const контрагентPlusReport =
    /(звіт|експорт|аналітик|аналітичн).*контрагент|контрагент.*(звіт|експорт|аналітик)/iu.test(raw) ||
    /\bзвіт\s+по\s+(контрагент|єдрпоу|клієнт|компан)/iu.test(raw) ||
    (hasCounterpartyUk && (hasReportUk || reportRu || /формувати|формуй|сформувати|видачі/i.test(raw)));
  /** «по цьому / по даній» контрагент */
  const byCounterpartyUk =
    /\b(?:по|за)\s+(?:цьом(у|и)|этом(у|и)|дан(ому|ій)|данному|єдрпоу|єд рп о у|компані|компані[їі]|компанію|компаніє|тов|фірм)/iu.test(raw) ||
    /\bкомпані\w*\s+(звіт|аналітик)/iu.test(raw);

  const formVerb =
    /сформуй|сформувати|формаці[яії]\s+звіту|формацію\s+звіту|створ(и|ити)\s+(звіт|файл)|зібра(ти)?\s+звіт|підстав(ь|ити)\s+(в\s+|у\s+)звіт|зроби\s+(мені\s+)?(звіт|експорт)/.test(
      s,
    ) ||
    /формировать|формуй\s+отчёт|формування\s+звіту|запитай\s+звіт|запитати\s+звіт/iu.test(raw);

  return reportOrFile || formVerb || контрагентPlusReport || byCounterpartyUk;
}

/**
 * Додає блок-інструкцію перед викликом LLM (українською для моделі та користувача в відповіді).
 *
 * @param {string} userMsg
 * @param {string} contentForChat
 * @param {number} discoveryOpenActionsCount
 */
function appendAssistantScopeHintToUserPayload(userMsg, contentForChat, discoveryOpenActionsCount) {
  if (!userMessageAsksOutOfChatScope(userMsg)) return contentForChat;
  const hasDiscovery = contentForChat.includes('[DTS-discovery]');
  const hasMultiFakeDts = /\[DTS\]\s*Заявки\s+за/i.test(contentForChat);

  const btnsNote =
    discoveryOpenActionsCount > 1
      ? ` Є кнопки «Відкрити форму» під чатом для ${discoveryOpenActionsCount} заявок — згадай про них. `
      : discoveryOpenActionsCount === 1
        ? ` Можна відкрити картку заявки через пошук/таблицю в DTS або відповідну кнопку. `
        : ` `;

  const duplicateBan =
    hasDiscovery || hasMultiFakeDts
      ? `\n\n[КРИТИЧНО для відповіді] У цьому ж запиті вже передано блоки **[DTS]** / **[DTS-discovery]** із переліком заявок. У відповіді користувачу ЗАБОРОНЕНО виводити ДВІ повні версії того самого списку (типово «[DTS] Заявки…» потім окремим списком «Дані заявок…» із тими ж LV-/KV- адресами). Дозволено лише одне коротке нагадування: наприклад «знайдено N заявок (LV-…, LV-…)» або «див. уривки сервера нижче / кнопки під чатом» без повторення адрес, контактів і дат двічі.`
      : '\n';

  const scopeBlock =
    `[ПРІОРИТЕТ-ІНСТРУКЦІЯ DTS-assistant-scope — ЗАСТОСУЙ ПЕРЕД УСІМ іншим у цьому повідомленні]\n\n` +
    `Користувач просить дію поза текстовими можливостями чату (звіти як файл, експорт Excel/PDF тощо). НЕ імітуй створення файлу. НЕ дублюй повні переліки заявок, якщо вони й так присутні в цьому ж payload.` +
      duplicateBan +
      `\nВідповідай Українською коротко у такій структурі:\n` +
      `1) 1–2 речення: обмеження чату («не можу сформувати/прикріпити файл звіту тут» — своїми словами).\n` +
      `2) Нумерований перелік 3–5 пунктів альтернатив (підсумок за даними блоків лише ЯКОЩО потрібен і стисло; доступ [DTS/User]; ${hasDiscovery ? 'кнопки під чатом;' : 'відкриття картки в DTS;'}` +
      ` експорт таблиці в самій DTS після пошуку/фільтру; навігація за [DTS/UI]).\n` +
      `3) Завершення: «Оберіть, що з переліченого потрібно».` +
      `${btnsNote}` +
      `\n\n──────── Початок службового контексту [DTS] для довідки (не повторюй той самий перелік у відповіді двічі) ────────\n\n`;

  return `${scopeBlock}${contentForChat}`;
}

module.exports = {
  userMessageAsksOutOfChatScope,
  appendAssistantScopeHintToUserPayload,
};
