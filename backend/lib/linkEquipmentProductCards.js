/**
 * Прив’язка залишків (Equipment) до карточок продукту за збігом назви номенклатури.
 * Окрема операція — не вбудовується в імпорт «Ведомости».
 */

function normalizeNomenclatureName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Ключ для порівняння (регістр не враховується). */
function nomenclatureMatchKey(value) {
  const n = normalizeNomenclatureName(value);
  return n ? n.toLocaleLowerCase('uk') : '';
}

/**
 * Індекс активних карточок: нормалізована назва (type або displayName) → масив карточок.
 */
function buildProductCardIndex(cards) {
  const byKey = new Map();
  for (const card of cards) {
    for (const field of [card.type, card.displayName]) {
      const key = nomenclatureMatchKey(field);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      const bucket = byKey.get(key);
      if (!bucket.some((c) => String(c._id) === String(card._id))) bucket.push(card);
    }
  }
  return byKey;
}

/**
 * @param {object} opts
 * @param {import('mongoose').Model} opts.Equipment
 * @param {import('mongoose').Model} opts.ProductCard
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<object>}
 */
async function linkEquipmentToProductCardsByName({ Equipment, ProductCard, dryRun = false }) {
  const summary = {
    dryRun: !!dryRun,
    scanned: 0,
    linked: 0,
    groupAssigned: 0,
    noMatch: 0,
    ambiguous: 0,
    emptyType: 0,
    samples: {
      linked: [],
      noMatch: [],
      ambiguous: [],
    },
  };

  const cards = await ProductCard.find({ isActive: { $ne: false } })
    .select('_id type displayName manufacturer categoryId itemKind materialValueType')
    .lean();
  const cardIndex = buildProductCardIndex(cards);

  const equipmentRows = await Equipment.find({
    isDeleted: { $ne: true },
    status: { $ne: 'deleted' },
    $or: [{ productId: null }, { productId: { $exists: false } }],
  })
    .select('_id type categoryId itemKind materialValueType')
    .lean();

  const bulkOps = [];
  const now = new Date();
  const seenNoMatch = new Set();
  const seenAmbiguous = new Set();

  for (const row of equipmentRows) {
    summary.scanned++;
    const key = nomenclatureMatchKey(row.type);
    if (!key) {
      summary.emptyType++;
      continue;
    }

    const matches = cardIndex.get(key) || [];
    if (matches.length === 0) {
      summary.noMatch++;
      const label = normalizeNomenclatureName(row.type);
      if (summary.samples.noMatch.length < 12 && label && !seenNoMatch.has(label)) {
        seenNoMatch.add(label);
        summary.samples.noMatch.push(label);
      }
      continue;
    }
    if (matches.length > 1) {
      summary.ambiguous++;
      const label = normalizeNomenclatureName(row.type);
      if (summary.samples.ambiguous.length < 12 && label && !seenAmbiguous.has(label)) {
        seenAmbiguous.add(label);
        summary.samples.ambiguous.push(label);
      }
      continue;
    }

    const card = matches[0];
    summary.linked++;
    if (summary.samples.linked.length < 15) {
      summary.samples.linked.push({
        equipmentId: String(row._id),
        type: normalizeNomenclatureName(row.type),
        cardId: String(card._id),
        cardType: card.type,
      });
    }

    // Група товарів та класифікація з карточки (як при ручному застосуванні
    // карточки — buildPatchesFromProductCard): не перетираємо вже задану групу.
    const set = {
      productId: card._id,
      lastModified: now,
    };
    const rowHasCategory = row.categoryId != null && String(row.categoryId).trim() !== '';
    if (!rowHasCategory && card.categoryId != null) {
      set.categoryId = card.categoryId;
      if (card.itemKind === 'equipment' || card.itemKind === 'parts') {
        set.itemKind = card.itemKind;
      }
      summary.groupAssigned++;
    }
    const rowHasMaterialValueType =
      typeof row.materialValueType === 'string' && row.materialValueType.trim() !== '';
    if (
      !rowHasMaterialValueType &&
      ['service', 'electroinstall', 'internal'].includes(card.materialValueType)
    ) {
      set.materialValueType = card.materialValueType;
    }

    if (!dryRun) {
      bulkOps.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: set },
        },
      });
    }
  }

  if (!dryRun && bulkOps.length) {
    const chunkSize = 500;
    for (let i = 0; i < bulkOps.length; i += chunkSize) {
      await Equipment.bulkWrite(bulkOps.slice(i, i + chunkSize), { ordered: false });
    }
  }

  return summary;
}

module.exports = {
  normalizeNomenclatureName,
  nomenclatureMatchKey,
  buildProductCardIndex,
  linkEquipmentToProductCardsByName,
};
