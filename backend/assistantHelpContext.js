/**
 * Підказки навігації DTS для асистента (де знайти функцію).
 */
const { softenForMatching, looksLikeNavigationQuestion } = require('./assistantQueryNormalize');

const HELP_TOPICS = [
  {
    id: 'create_task',
    keywords: /(?:створ(?:ити|ення)|нова\s+заяв|подати\s+заяв|оператор|call.?center|кол.?центр)/iu,
    answer:
      '**Нова сервісна заявка:** вкладка **«Оператор»** (📞) → форма створення заявки (клієнт, ЄДРПОУ, адреса, опис). ' +
      'Чернетки зберігаються локально, якщо форму не завершили.',
    panelId: 'operator',
  },
  {
    id: 'service_list',
    keywords: /(?:сервісн(?:і|а)\s+заяв|таблиц(?:я|і)\s+заяв|список\s+заяв|фільтр\s+заяв)/iu,
    answer:
      '**Список сервісних заявок:** вкладка **«Сервісна служба»** (🔧) — фільтри по статусу, регіону, пошук по номеру/клієнту/опису.',
    panelId: 'service',
  },
  {
    id: 'testing_request',
    keywords: /(?:тест(?:ування)?\s+облад|на\s+тест|подати\s+на\s+тест|відділ\s+тест)/iu,
    answer:
      '**Заявка на тестування обладнання:** вкладка **«Менеджери»** (👔) → картка обладнання → **«Подати заявку на тестування»**. ' +
      'Альтернатива: вкладка **«Відділ тестування»** (🧪) для перегляду черги тестів.',
    panelId: 'manager',
  },
  {
    id: 'warehouse_confirm',
    keywords: /(?:підтверд(?:ити|ження)\s+завсклад|зав\.?\s*склад|склад\s+підтверд)/iu,
    answer:
      '**Підтвердження завскладом:** вкладка **«Зав. склад»** (📦) — виконані заявки, що очікують підтвердження.',
    panelId: 'warehouse',
  },
  {
    id: 'accountant_invoice',
    keywords: /(?:рахун(?:ок|ки)|бухгалтер|безготів|заявк(?:а|и)\s+на\s+рахун)/iu,
    answer:
      '**Рахунки по заявках:** **«Бух рахунки»** (📄) — запити на рахунок; **«Бух на затвердженні»** (💰) — черга на підтвердження виконаних робіт.',
    panelId: 'accountant',
  },
  {
    id: 'equipment_qr',
    keywords: /(?:обладнан(?:я|ні)|qr|картк(?:а|и)\s+облад|номенклатур)/iu,
    answer:
      '**Обладнання / QR:** сторінка `/equipment/:id` з QR-коду або розділи **«Менеджери»** / **«Складський облік»** залежно від задачі.',
    panelId: 'manager',
  },
  {
    id: 'procurement',
    keywords: /(?:закупівл|відділ\s+закуп|вз\s+заяв)/iu,
    answer:
      '**Внутрішні закупівлі (ВЗ):** вкладка **«Відділ закупівель»** (🛒) — не плутати з сервісними KV-заявками клієнтів.',
    panelId: 'procurement',
  },
  {
    id: 'reports_export',
    keywords: /(?:експорт|excel|звіт|вивантажити\s+таблиц)/iu,
    answer:
      '**Експорт / звіти:** у таблицях заявок — кнопки експорту на панелі; окремо вкладка **«Звіти»** (📊) для конструктора звітів.',
    panelId: 'reports',
  },
];

/**
 * @param {string} messageText
 * @param {string} [currentPanelId]
 * @returns {{ textForLlm: string, matchedTopics: object[] }}
 */
function buildHelpContextForLlm(messageText, currentPanelId = '') {
  if (!looksLikeNavigationQuestion(messageText)) {
    return { textForLlm: '', matchedTopics: [] };
  }

  const s = softenForMatching(messageText);
  const matched = HELP_TOPICS.filter((t) => t.keywords.test(s));
  if (!matched.length) {
    return {
      textForLlm:
        '[DTS-help]\n' +
        'Користувач питає про навігацію в DTS, але точну тему не знайдено. ' +
        'Переліч коротко релевантні вкладки зверху (Сервіс, Оператор, Зав. склад, Менеджери, Бух…) і уточни одне питання, якщо потрібно.',
      matchedTopics: [],
    };
  }

  const lines = matched.slice(0, 3).map((t) => `- ${t.answer}`);
  let block =
    '[DTS-help] Перевірені підказки навігації DTS (використовуй як основу, не вигадуй інші розділи):\n' +
    lines.join('\n');

  if (currentPanelId) {
    block += `\nПоточна вкладка користувача: ${currentPanelId}. Якщо відповідь уже на цій вкладці — скажи це прямо.`;
  }

  return { textForLlm: block.trim(), matchedTopics: matched };
}

module.exports = {
  HELP_TOPICS,
  buildHelpContextForLlm,
};
