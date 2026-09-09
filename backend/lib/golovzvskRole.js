/**
 * Роль golovzvsk — головний завсклад: складські операції у своєму регіоні,
 * плюс моніторинг черг затвердження (переміщення / закупівлі) по всіх регіонах.
 * Затверджувати можна лише склади регіону користувача.
 */

const GOLOVZVSK_ROLE = 'golovzvsk';

function isGolovzvskRole(role) {
  return String(role || '').trim().toLowerCase() === GOLOVZVSK_ROLE;
}

module.exports = {
  GOLOVZVSK_ROLE,
  isGolovzvskRole,
};
