/**
 * Звірка руху товару: 1С (OneCMovement) ↔ наша система (InventoryMovementLog).
 *
 * Мета: показати «що списано/реалізовано/переміщено в 1С» проти руху в нашій системі,
 * з прив'язкою до заявки (№ shipmentRequest/sale) — через жорсткий лінк (№ у коментарі/документі)
 * або евристику (номенклатура + кількість + дата + контрагент).
 *
 * Модуль чистий (без БД): приймає масиви, повертає рядки звірки + підсумок.
 */

/** Наш eventType → узагальнений тип операції 1С. */
const INTERNAL_EVENT_TO_OP = {
  shipment_out: 'sale',
  write_off: 'writeoff',
  warehouse_move: 'move',
  movement_document_completed: 'move',
  reserve_transferred: 'move',
  goods_receipt: 'receipt',
  receipt_document_completed: 'receipt',
  receipt_approved: 'receipt',
};

/** Типи операцій 1С, які беремо у звірку (рух залишку). */
const ONEC_OPS = new Set(['sale', 'writeoff', 'move', 'receipt', 'return']);

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/[.,;:()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contractorMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // часткове співпадіння (наша назва клієнта може бути коротшою/довшою за контрагента 1С)
  const xs = x.replace(/\b(тов|пп|фоп|фг|тдв|пат|зат|кп|дп|ат)\b/g, '').trim();
  const ys = y.replace(/\b(тов|пп|фоп|фг|тдв|пат|зат|кп|дп|ат)\b/g, '').trim();
  return xs && ys && (xs.includes(ys) || ys.includes(xs));
}

/** Витягти можливі номери заявок/документів з тексту (коментар 1С). */
function extractRefTokens(text) {
  const tokens = new Set();
  const parts = String(text || '').split(/[\s,;.]+/);
  for (const raw of parts) {
    const p = raw.replace(/[«»"'`()]+/g, '').trim();
    if (!p) continue;
    const digitCount = (p.match(/\d/g) || []).length;
    if (digitCount < 2) continue;
    tokens.add(p.toUpperCase()); // напр. A0000000924 або 12345
    const digits = (p.match(/\d{2,}/g) || [])[0];
    if (digits) tokens.add(digits); // чисті цифри: 12345, 99
  }
  return tokens;
}

/**
 * @param {Array} oneCMovements  записи OneCMovement (lean)
 * @param {Array} internalLogs   записи InventoryMovementLog (lean)
 * @param {object} [opts]
 * @param {number} [opts.windowDays=5]  допустиме вікно розбіжності дат для евристики
 */
function reconcile(oneCMovements, internalLogs, opts = {}) {
  const windowDays = opts.windowDays ?? 5;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  // Індекс внутрішнього руху за (op, normNome)
  const internalByKey = new Map(); // `${op}::${normNome}` → [entries]
  const byRequestNo = new Map(); // номер заявки/продажу → entry
  const internalEntries = [];

  for (const l of internalLogs) {
    const op = INTERNAL_EVENT_TO_OP[l.eventType];
    if (!op) continue; // подія, що не змінює залишок у термінах 1С
    const entry = {
      _id: String(l._id),
      op,
      eventType: l.eventType,
      nome: l.equipmentType || '',
      normNome: norm(l.equipmentType),
      qty: Number(l.quantity) || 0,
      date: l.occurredAt ? new Date(l.occurredAt) : null,
      clientName: l.clientName || '',
      shipmentRequestNumber: l.shipmentRequestNumber || '',
      shipmentRequestId: l.shipmentRequestId ? String(l.shipmentRequestId) : null,
      saleNumber: l.saleNumber || '',
      saleId: l.saleId ? String(l.saleId) : null,
      managerName: l.managerName || '',
      consumed: false,
    };
    internalEntries.push(entry);
    const key = `${op}::${entry.normNome}`;
    if (!internalByKey.has(key)) internalByKey.set(key, []);
    internalByKey.get(key).push(entry);
    if (entry.shipmentRequestNumber) byRequestNo.set(String(entry.shipmentRequestNumber).toUpperCase(), entry);
    if (entry.saleNumber) byRequestNo.set(String(entry.saleNumber).toUpperCase(), entry);
  }

  const rows = [];
  const summary = {
    total1C: 0,
    matched: 0,
    qtyMismatch: 0,
    unaccountedInDts: 0,
    pendingIn1C: 0,
    byType: {},
  };

  for (const m of oneCMovements) {
    if (!ONEC_OPS.has(m.docType)) continue;
    summary.total1C++;
    summary.byType[m.docType] = (summary.byType[m.docType] || 0) + 1;

    const normNome = norm(m.nomenclature);
    const qty = Number(m.qty) || 0;
    const date = m.docDate ? new Date(m.docDate) : null;

    let match = null;
    let matchKind = null;

    // 1) Жорсткий лінк: № заявки/продажу з коментаря або № документа 1С
    const tokens = extractRefTokens(`${m.comment || ''} ${m.docNumber || ''}`);
    for (const tok of tokens) {
      const cand = byRequestNo.get(tok);
      if (cand && !cand.consumed) {
        match = cand;
        matchKind = 'ref';
        break;
      }
    }

    // 2) Евристика: op + номенклатура + кількість + вікно дат (+ контрагент як перевага)
    if (!match) {
      const key = `${m.docType}::${normNome}`;
      const cands = internalByKey.get(key) || [];
      let best = null;
      let bestScore = -1;
      for (const c of cands) {
        if (c.consumed) continue;
        let score = 0;
        if (c.qty === qty) score += 2;
        if (date && c.date && Math.abs(date - c.date) <= windowMs) score += 2;
        if (contractorMatch(c.clientName, m.contractor)) score += 3;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best && bestScore >= 2) {
        match = best;
        matchKind = 'heuristic';
      }
    }

    let status;
    if (match) {
      match.consumed = true;
      status = match.qty === qty ? 'matched' : 'qty_mismatch';
      if (status === 'matched') summary.matched++;
      else summary.qtyMismatch++;
    } else {
      status = 'unaccounted_in_dts';
      summary.unaccountedInDts++;
    }

    rows.push({
      source: '1c',
      status,
      matchKind,
      docType: m.docType,
      docTypeName: m.docTypeName,
      docNumber: m.docNumber,
      docDate: m.docDate,
      nomenclature: m.nomenclature,
      qty,
      direction: m.direction,
      warehouse1c: m.warehouse1c,
      fromWarehouse1c: m.fromWarehouse1c,
      toWarehouse1c: m.toWarehouse1c,
      contractor: m.contractor,
      docSum: m.docSum,
      comment: m.comment,
      // дані з нашої системи (якщо знайдено)
      dtsEventType: match ? match.eventType : null,
      dtsQty: match ? match.qty : null,
      dtsClientName: match ? match.clientName : null,
      dtsDate: match ? match.date : null,
      shipmentRequestNumber: match ? match.shipmentRequestNumber : null,
      shipmentRequestId: match ? match.shipmentRequestId : null,
      saleNumber: match ? match.saleNumber : null,
      saleId: match ? match.saleId : null,
      oneCMovementId: m._id ? String(m._id) : null,
    });
  }

  // Внутрішній рух без відповідника в 1С
  for (const c of internalEntries) {
    if (c.consumed) continue;
    summary.pendingIn1C++;
    rows.push({
      source: 'dts',
      status: 'pending_in_1c',
      matchKind: null,
      docType: c.op,
      docTypeName: c.eventType,
      docNumber: c.shipmentRequestNumber || c.saleNumber || '',
      docDate: c.date,
      nomenclature: c.nome,
      qty: c.qty,
      direction: c.op === 'receipt' ? 'in' : 'out',
      contractor: c.clientName,
      dtsEventType: c.eventType,
      dtsQty: c.qty,
      dtsClientName: c.clientName,
      dtsDate: c.date,
      shipmentRequestNumber: c.shipmentRequestNumber || null,
      shipmentRequestId: c.shipmentRequestId,
      saleNumber: c.saleNumber || null,
      saleId: c.saleId,
    });
  }

  return { rows, summary };
}

module.exports = { reconcile, INTERNAL_EVENT_TO_OP, ONEC_OPS, norm };
