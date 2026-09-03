/**
 * Канонічні знання про DTS для асистента: поля, метрики, панелі, синоніми.
 * Джерело правди для LLM — не вигадувати поза цим блоком.
 */

const TASK_STATUSES = {
  new: { key: 'Заявка', label: 'Заявка (не взято в роботу)' },
  inWork: { key: 'В роботі', label: 'В роботі' },
  done: { key: 'Виконано', label: 'Виконано' },
  blocked: { key: 'Заблоковано', label: 'Заблоковано' },
};

/** Ключові поля Task (повний список — TaskTable ALL_COLUMNS). */
const TASK_FIELD_GLOSSARY = [
  { key: 'requestNumber', label: '№ заявки', synonyms: ['номер заявки', 'kv', 'заявка номер'] },
  { key: 'status', label: 'Статус заявки', synonyms: ['статус'] },
  { key: 'client', label: 'Замовник / контрагент', synonyms: ['клієнт', 'контрагент', 'замовник'] },
  { key: 'edrpou', label: 'ЄДРПОУ', synonyms: ['єдрпou', 'код'] },
  { key: 'serviceRegion', label: 'Регіон сервісного відділу', synonyms: ['регіон'] },
  { key: 'work', label: 'Найменування робіт', synonyms: ['роботи', 'виконані роботи'] },
  { key: 'date', label: 'Дата проведення робіт', synonyms: ['дата робіт'] },
  { key: 'requestAuthor', label: 'Автор заявки (оператор)', synonyms: ['автор', 'хто створив'] },
  { key: 'engineer1', label: 'Сервісний інженер №1', synonyms: ['інженер', 'виконавець'] },
  { key: 'engineer2', label: 'Сервісний інженер №2' },
  { key: 'engineer3', label: 'Сервісний інженер №3' },
  { key: 'engineer4', label: 'Сервісний інженер №4' },
  { key: 'engineer5', label: 'Сервісний інженер №5' },
  { key: 'engineer6', label: 'Сервісний інженер №6' },
  { key: 'workPrice', label: 'Вартість робіт, грн', synonyms: ['сума робіт'] },
  { key: 'serviceTotal', label: 'Загальна сума послуги', synonyms: ['загальна сума', 'виручка'] },
  { key: 'approvedByWarehouse', label: 'Підтвердження завскладом' },
  { key: 'approvedByAccountant', label: 'Підтвердження бухгалтером' },
];

const METRIC_DEFINITIONS = [
  {
    id: 'client_task_count',
    questionPatterns: ['скільки заявок у', 'скільки заявок по', 'заявок контрагента'],
    tool: 'client_stats',
    definition:
      'Підрахунок заявок Task де поле client/clientName містить назву клієнта. Фільтр status опційний.',
  },
  {
    id: 'engineer_completed_count',
    questionPatterns: ['скільки виконав', 'скільки робіт зробив', 'скільки заявок виконав'],
    tool: 'engineer_stats',
    definition:
      'Інженер = текст у engineer1..engineer6 (не userId). «Виконав» за замовчуванням = status «Виконано». ' +
      'Якщо на заявці 2 інженери — заявка зараховується обом (participations). ' +
      'Для часткового кредиту див. analytics byEngineer (taskShare).',
  },
  {
    id: 'regional_task_count',
    questionPatterns: ['статистика заявок', 'скільки в роботі по регіону'],
    tool: 'regional_stats',
    definition: 'Агрегати по serviceRegion + status buckets як у TasksStatisticsBar.',
  },
  {
    id: 'task_by_number',
    questionPatterns: ['kv-', 'покажи заявку', 'номер заявки'],
    tool: 'task_lookup',
    definition: 'Пошук Task.requestNumber з варіантами padding (KV-997 = KV-0000997).',
  },
];

const PANEL_HINTS = [
  { id: 'operator', label: 'Оператор', use: 'Створення нової сервісної заявки' },
  { id: 'service', label: 'Сервісна служба', use: 'Таблиця заявок, фільтри, редагування' },
  { id: 'warehouse', label: 'Зав. склад', use: 'Підтвердження виконаних заявок' },
  { id: 'manager', label: 'Менеджери', use: 'CRM, обладнання, заявка на тест' },
  { id: 'accountant', label: 'Бух рахунки', use: 'Рахунки по заявках' },
  { id: 'analytics', label: 'Аналітика', use: 'byEngineer, byClient, KPI — офіційні звіти' },
];

/** Блок для LLM (стисло). */
function buildKnowledgeLlmBlockUk() {
  const fields = TASK_FIELD_GLOSSARY.slice(0, 12)
    .map((f) => `${f.key} (${f.label})`)
    .join('; ');
  const metrics = METRIC_DEFINITIONS.map((m) => `• ${m.id}: ${m.definition}`).join('\n');
  return (
    '[DTS-knowledge]\n' +
    'Task — schemaless MongoDB. Статуси: Заявка | В роботі | Виконано | Заблоковано.\n' +
    `Ключові поля: ${fields}.\n` +
    'Метрики (лише через tools, не вигадуй цифри):\n' +
    metrics +
    '\nІнженери — текст engineer1..6, match по User.name. Суми: serviceTotal (пріоритет) або workPrice.'
  );
}

module.exports = {
  TASK_STATUSES,
  TASK_FIELD_GLOSSARY,
  METRIC_DEFINITIONS,
  PANEL_HINTS,
  buildKnowledgeLlmBlockUk,
};
