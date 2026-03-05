/**
 * Поля, які НЕ копіюються при «Створити заявку на основі даної».
 * Вони заповняться згідно загальних правил при створенні заявки.
 * Важливо не копіювати: дату виконання, рахунок, дату оплати, файли рахунків.
 */
const FIELDS_TO_EXCLUDE = new Set([
  'id',
  '_id',
  'requestNumber',
  'status',
  'requestDate',
  'plannedDate',
  'invoice',
  'invoiceNumber',
  'paymentDate',
  'paymentType',
  'needInvoice',
  'needAct',
  'invoiceRequestId',
  'invoiceFile',
  'invoiceFileName',
  'actFile',
  'actFileName',
  'invoiceRequestDate',
  'invoiceUploadDate',
  'debtStatus',
  'debtStatusCheckbox',
  'date', // дата виконанання
  'work',
  'bonusApprovalDate',
  'approvedByWarehouse',
  'warehouseComment',
  'approvedByAccountant',
  'accountantComment',
  'autoCreatedAt',
  'autoCompletedAt',
  'autoWarehouseApprovedAt',
  'autoAccountantApprovedAt',
]);

/**
 * Повертає об'єкт для нової заявки на основі існуючої: копіюються всі поля,
 * крім перелічених у FIELDS_TO_EXCLUDE (вони не передаються — форма/сервер заповнять їх при створенні).
 * @param {Object} task — існуюча заявка з таблиці
 * @returns {Object} — дані для initialData модалки «Додати заявку» (нова заявка)
 */
export function buildTaskDataFromExisting(task) {
  if (!task || typeof task !== 'object') return {};
  const result = {};
  for (const key of Object.keys(task)) {
    if (FIELDS_TO_EXCLUDE.has(key)) continue;
    result[key] = task[key];
  }
  return result;
}
