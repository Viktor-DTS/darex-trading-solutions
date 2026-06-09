/**
 * Пошук руху 1С (OneCMovement) за номером сервісної заявки (KV-0000097 тощо).
 * Шукаємо в comment, docNumber, contractor.
 */

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Варіанти номера для пошуку в коментарях/документах 1С. */
function requestNumberSearchVariants(requestNumber) {
  const raw = String(requestNumber || '').trim().toUpperCase();
  if (!raw) return [];
  const variants = new Set([raw]);
  const m = raw.match(/^([A-ZА-ЯІЇЄ]{2})-?0*(\d+)$/u);
  if (m) {
    const prefix = m[1];
    const digits = m[2];
    const padded = digits.padStart(7, '0');
    variants.add(`${prefix}-${padded}`);
    variants.add(`${prefix}${padded}`);
    variants.add(`${prefix}-${digits}`);
    variants.add(`${prefix}${digits}`);
    const trimmed = digits.replace(/^0+/, '') || digits;
    // короткі цифри (напр. «101») дають хибні збіги з іншими KV-номерами
    if (trimmed.length >= 5) variants.add(trimmed);
    if (digits.length >= 5) variants.add(digits);
  }
  const longDigits = raw.match(/\d{5,}/g) || [];
  for (const d of longDigits) variants.add(d);
  return [...variants].filter((v) => v.length >= 3 && (!/^\d+$/.test(v) || v.length >= 5));
}

/** Чи згадується номер заявки в тексті (без часткових збігів по коротких цифрах). */
function textMatchesRequestNumber(text, requestNumber) {
  const hay = String(text || '');
  if (!hay.trim()) return false;
  const variants = requestNumberSearchVariants(requestNumber);
  const upper = hay.toUpperCase();
  for (const v of variants) {
    if (/^[A-ZА-ЯІЇЄ]{2}[-]?\d+/u.test(v)) {
      if (upper.includes(v.toUpperCase())) return true;
      continue;
    }
    if (/^\d+$/.test(v)) {
      const rx = new RegExp(`(?:^|[^0-9])${escapeRegExp(v)}(?:[^0-9]|$)`);
      if (rx.test(hay)) return true;
    }
  }
  return false;
}

function movementMatchesRequest(movement, requestNumber) {
  return (
    textMatchesRequestNumber(movement?.comment, requestNumber) ||
    textMatchesRequestNumber(movement?.docNumber, requestNumber) ||
    textMatchesRequestNumber(movement?.contractor, requestNumber)
  );
}

/**
 * @param {string} requestNumber
 * @returns {object} MongoDB filter fragment ($or)
 */
function buildMovementsOrFilter(requestNumber) {
  const variants = requestNumberSearchVariants(requestNumber);
  if (!variants.length) return null;
  const or = [];
  for (const v of variants) {
    const rx = new RegExp(escapeRegExp(v), 'i');
    or.push({ comment: rx }, { docNumber: rx }, { contractor: rx });
  }
  return { $or: or };
}

const DOC_TYPE_UA = {
  sale: 'Реалізація',
  receipt: 'Надходження',
  move: 'Переміщення',
  writeoff: 'Списання',
  return: 'Повернення',
  inventory: 'Інвентаризація',
  assembly: 'Комплектація',
  other: 'Інше',
};

/**
 * @param {Array} movements lean OneCMovement[]
 */
function summarizeMovements(movements) {
  const list = Array.isArray(movements) ? movements : [];
  const byType = {};
  let writeoffQty = 0;
  for (const m of list) {
    const t = m.docType || 'other';
    byType[t] = (byType[t] || 0) + 1;
    if (t === 'writeoff') writeoffQty += Number(m.qty) || 0;
  }
  return {
    movementCount: list.length,
    hasWriteoff: (byType.writeoff || 0) > 0,
    writeoffCount: byType.writeoff || 0,
    writeoffQty,
    byType,
  };
}

/**
 * @param {import('mongoose').Model} OneCMovement
 * @param {string} requestNumber
 * @param {{ limit?: number }} [opts]
 */
async function findMovementsForRequest(OneCMovement, requestNumber, opts = {}) {
  const orFilter = buildMovementsOrFilter(requestNumber);
  if (!orFilter) return { items: [], summary: summarizeMovements([]) };
  const limit = Math.min(200, Math.max(1, opts.limit || 80));
  const rawItems = await OneCMovement.find(orFilter).sort({ docDate: -1, _id: -1 }).limit(limit * 3).lean();
  const items = rawItems.filter((m) => movementMatchesRequest(m, requestNumber)).slice(0, limit);
  return { items, summary: summarizeMovements(items) };
}

/**
 * @param {import('mongoose').Model} OneCMovement
 * @param {string[]} requestNumbers
 */
async function statusByRequestNumbers(OneCMovement, requestNumbers) {
  const numbers = [...new Set((requestNumbers || []).map((n) => String(n || '').trim()).filter(Boolean))].slice(
    0,
    150,
  );
  const statuses = {};
  for (const num of numbers) {
    const { summary } = await findMovementsForRequest(OneCMovement, num, { limit: 30 });
    statuses[num] = summary;
  }
  return statuses;
}

module.exports = {
  requestNumberSearchVariants,
  buildMovementsOrFilter,
  textMatchesRequestNumber,
  movementMatchesRequest,
  summarizeMovements,
  findMovementsForRequest,
  statusByRequestNumbers,
  DOC_TYPE_UA,
};
