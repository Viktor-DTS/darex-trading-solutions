export const ZAVSKLAD_INVENTORY_TAB_IDS = [
  'stock',
  'receipt',
  'movement',
  'shipment',
  'movement-journal',
  'notifications',
  'write-off',
  'approval',
];

export const ACCOUNTING_INVENTORY_TAB_IDS = [
  'onec-reconciliation',
  'inventory',
  'reservations',
  'reports',
  'statistics',
];

export const ALL_INVENTORY_TAB_IDS = new Set([
  ...ZAVSKLAD_INVENTORY_TAB_IDS,
  ...ACCOUNTING_INVENTORY_TAB_IDS,
]);

export function isZavskladInventoryTab(tabId) {
  return ZAVSKLAD_INVENTORY_TAB_IDS.includes(tabId);
}

export function buildZavskladTabs({ approvalBadge = 0 } = {}) {
  return [
    { id: 'stock', label: 'Залишки на складах', icon: '📦' },
    { id: 'receipt', label: 'Надходження', icon: '📥' },
    { id: 'movement', label: 'Переміщення', icon: '🔄' },
    { id: 'shipment', label: 'Відвантаження', icon: '🚚' },
    { id: 'movement-journal', label: 'Журнал руху товару', icon: '📒' },
    { id: 'notifications', label: 'Сповіщення', icon: '🔔' },
    { id: 'write-off', label: 'Списання', icon: '📝' },
    {
      id: 'approval',
      label: 'Затвердження отримання товару',
      icon: '✅',
      badge: approvalBadge,
    },
  ];
}

export function buildAccountingTabs() {
  return [
    { id: 'onec-reconciliation', label: 'Звірка з 1С', icon: '🔍' },
    { id: 'inventory', label: 'Інвентаризація', icon: '📋' },
    { id: 'reservations', label: 'Резервування', icon: '🔒' },
    { id: 'reports', label: 'Звіти', icon: '📊' },
    { id: 'statistics', label: 'Статистика', icon: '📈' },
  ];
}
