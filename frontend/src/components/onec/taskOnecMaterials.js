/** Парсинг кількості з полів заявки (0, порожньо, «—» → 0). */
function parseQty(value) {
  const s = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!s || s === '—' || s === '-') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Чи потрібне списання матеріалів у 1С для цієї заявки.
 * false — усі витратні позиції нульові / відсутні.
 */
export function taskRequiresOnecWriteoff(task) {
  if (!task || typeof task !== 'object') return true;

  if (parseQty(task.oilUsed) > 0) return true;
  if (parseQty(task.filterCount) > 0) return true;
  if (parseQty(task.fuelFilterCount) > 0) return true;
  if (parseQty(task.airFilterCount) > 0) return true;
  if (parseQty(task.antifreezeL) > 0) return true;
  if (parseQty(task.otherSum) > 0) return true;

  const lines = Array.isArray(task.otherMaterialLines) ? task.otherMaterialLines : [];
  if (lines.some((row) => parseQty(row?.count) > 0)) return true;

  return false;
}
