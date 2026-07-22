/** Активні статуси угоди (ще в роботі). */
export const ACTIVE_SALE_STATUSES = [
  'draft',
  'primary_contact',
  'quote_sent',
  'in_negotiation',
  'in_progress',
  'in_realization',
  'pnr'
];

/** Закриті / завершені угоди — лише перегляд для менеджера. */
export const CLOSED_SALE_STATUSES = ['success', 'confirmed', 'cancelled'];

export const SALE_STATUS_LABELS = {
  draft: 'Чернетка',
  primary_contact: 'Первичний контакт',
  quote_sent: 'Відправив КП',
  in_negotiation: 'В процесі домовленості',
  in_progress: 'В процесі',
  in_realization: 'Реалізація угоди',
  pnr: 'ПНР',
  success: 'Успішно реалізовано',
  confirmed: 'Підтверджено',
  cancelled: 'Скасовано'
};

export function isClosedSale(sale) {
  return CLOSED_SALE_STATUSES.includes(sale?.status);
}

export function isActiveSale(sale) {
  return ACTIVE_SALE_STATUSES.includes(sale?.status);
}

export function saleStatusLabel(status) {
  return SALE_STATUS_LABELS[status] || status || '—';
}

/** Регіон «Україна» / «Загальний» — доступ до всіх угод (не лише своїх). */
export function userSeesAllDeals(user) {
  const region = String(user?.region || '').trim();
  return region === 'Україна' || region.includes('Загальний');
}

export function saleBelongsToUser(sale, login) {
  if (!login) return false;
  return sale?.managerLogin === login || sale?.managerLogin2 === login;
}
