/**
 * Масове створення карточок продукту для залишків без productId:
 * унікальні назви → асистент (LLM / Wikipedia) → чернетка ProductCard → опційно прив’язка залишків.
 */

const {
  normalizeNomenclatureName,
  nomenclatureMatchKey,
  buildProductCardIndex,
  linkEquipmentToProductCardsByName,
} = require('./linkEquipmentProductCards');

const DRAFT_NOTE =
  'Автоматично створено масовим наповненням (чернетка). Перевірте характеристики та фото перед використанням у продажах.';

function sanitizeSpecsFromAssistant(rawSpecs, source) {
  const out = [];
  if (!Array.isArray(rawSpecs)) return out;
  for (const row of rawSpecs) {
    if (!row || typeof row !== 'object') continue;
    if (source === 'mock' && String(row.id || '') === 'mock-note') continue;
    const name = row.name != null ? String(row.name).trim().slice(0, 200) : '';
    const value = row.value != null ? String(row.value).trim().slice(0, 500) : '';
    if (!name && !value) continue;
    out.push({ name: name || 'Характеристика', value: value || '—' });
    if (out.length >= 24) break;
  }
  return out;
}

function pickManufacturer(group, suggestion) {
  const fromStock = String(group.manufacturer || '').trim();
  if (fromStock && !/^не\s*визначено$/i.test(fromStock)) return fromStock;
  return String(suggestion?.manufacturerHint || '').trim();
}

function buildInternalNotes(suggestion) {
  const parts = [DRAFT_NOTE];
  if (suggestion?.disclaimer) parts.push(String(suggestion.disclaimer).trim());
  if (suggestion?.source) {
    const src = String(suggestion.source);
    const model = suggestion.llmModel ? ` (${suggestion.llmModel})` : '';
    parts.push(`Джерело асистента: ${src}${model}.`);
  }
  return parts.filter(Boolean).join('\n\n');
}

function buildAttachedFilesFromImport(importResult) {
  if (!importResult?.photoUrl) return [];
  return [
    {
      cloudinaryUrl: importResult.photoUrl,
      cloudinaryId: importResult.cloudinaryId || '',
      originalName: importResult.filename || 'assistant-image.jpg',
      mimetype: 'image/jpeg',
      size: 0,
      uploadedAt: new Date(),
    },
  ];
}

/**
 * Збирає унікальні назви залишків без карточки.
 * @returns {{ pending: object[], totalUnique: number, skippedExisting: number, emptyTypeRows: number }}
 */
async function collectPendingUniqueTypes({ Equipment, ProductCard }) {
  const cards = await ProductCard.find({ isActive: { $ne: false } })
    .select('_id type displayName')
    .lean();
  const cardIndex = buildProductCardIndex(cards);

  const rows = await Equipment.find({
    isDeleted: { $ne: true },
    status: { $ne: 'deleted' },
    $or: [{ productId: null }, { productId: { $exists: false } }],
  })
    .select('type manufacturer categoryId itemKind materialValueType batchUnit')
    .lean();

  const byKey = new Map();
  let emptyTypeRows = 0;

  for (const row of rows) {
    const key = nomenclatureMatchKey(row.type);
    if (!key) {
      emptyTypeRows++;
      continue;
    }
    if (!byKey.has(key)) {
      byKey.set(key, {
        type: normalizeNomenclatureName(row.type),
        key,
        equipmentCount: 0,
        manufacturer: '',
        categoryId: null,
        itemKind: 'equipment',
        materialValueType: '',
        defaultBatchUnit: 'шт.',
      });
    }
    const g = byKey.get(key);
    g.equipmentCount += 1;
    const mfr = String(row.manufacturer || '').trim();
    if (mfr && !/^не\s*визначено$/i.test(mfr) && !g.manufacturer) g.manufacturer = mfr;
    if (!g.categoryId && row.categoryId) g.categoryId = row.categoryId;
    if (row.itemKind === 'parts') g.itemKind = 'parts';
    if (row.materialValueType && !g.materialValueType) g.materialValueType = String(row.materialValueType);
    const bu = String(row.batchUnit || '').trim();
    if (bu && g.defaultBatchUnit === 'шт.') g.defaultBatchUnit = bu;
  }

  const pending = [];
  let skippedExisting = 0;
  for (const g of byKey.values()) {
    const existing = cardIndex.get(g.key) || [];
    if (existing.length > 0) {
      skippedExisting += 1;
      continue;
    }
    pending.push(g);
  }

  pending.sort((a, b) => b.equipmentCount - a.equipmentCount || a.type.localeCompare(b.type, 'uk'));

  return {
    pending,
    totalUnique: byKey.size,
    skippedExisting,
    emptyTypeRows,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} opts
 * @param {import('mongoose').Model} opts.Equipment
 * @param {import('mongoose').Model} opts.ProductCard
 * @param {(q: string) => Promise<object>} opts.suggest
 * @param {(url: string) => Promise<object>} [opts.importImageFromUrl]
 * @param {boolean} [opts.dryRun]
 * @param {number} [opts.limit]
 * @param {boolean} [opts.importImages]
 * @param {boolean} [opts.linkAfter]
 * @param {{ login?: string, name?: string }} [opts.user]
 * @param {number} [opts.delayMsBetweenSuggest]
 */
async function bulkCreateProductCardsFromEquipment({
  Equipment,
  ProductCard,
  suggest,
  importImageFromUrl,
  dryRun = false,
  limit = 15,
  importImages = true,
  linkAfter = true,
  user = {},
  delayMsBetweenSuggest = 400,
}) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 15));

  const { pending, totalUnique, skippedExisting, emptyTypeRows } = await collectPendingUniqueTypes({
    Equipment,
    ProductCard,
  });

  const slice = pending.slice(0, safeLimit);

  const summary = {
    dryRun: !!dryRun,
    uniqueTypesTotal: totalUnique,
    pendingWithoutCard: pending.length,
    skippedExistingCard: skippedExisting,
    emptyTypeRows,
    limit: safeLimit,
    processedThisRun: slice.length,
    wouldCreate: slice.length,
    created: 0,
    failed: 0,
    remaining: Math.max(0, pending.length - slice.length),
    linkSummary: null,
    items: [],
  };

  if (dryRun) {
    summary.samples = slice.slice(0, 25).map((g) => ({
      type: g.type,
      equipmentCount: g.equipmentCount,
      manufacturer: g.manufacturer || '',
      itemKind: g.itemKind,
    }));
    return summary;
  }

  const cardIndex = buildProductCardIndex(
    await ProductCard.find({ isActive: { $ne: false } }).select('_id type displayName').lean(),
  );

  for (let i = 0; i < slice.length; i++) {
    const group = slice[i];
    const itemResult = {
      type: group.type,
      equipmentCount: group.equipmentCount,
      status: 'pending',
      cardId: null,
      source: null,
      specsCount: 0,
      imageImported: false,
      error: null,
    };

    try {
      const existing = cardIndex.get(group.key) || [];
      if (existing.length > 0) {
        itemResult.status = 'skipped_existing';
        summary.items.push(itemResult);
        continue;
      }

      const suggestion = await suggest(group.type);
      itemResult.source = suggestion?.source || 'unknown';

      let attachedFiles = [];
      if (importImages && importImageFromUrl && Array.isArray(suggestion?.images) && suggestion.images.length) {
        const first = suggestion.images.find((img) => img?.url);
        if (first?.url) {
          try {
            const imported = await importImageFromUrl(first.url);
            attachedFiles = buildAttachedFilesFromImport(imported);
            itemResult.imageImported = attachedFiles.length > 0;
          } catch (imgErr) {
            console.warn('[bulk-product-cards] image import:', group.type, imgErr.message);
          }
        }
      }

      const technicalSpecs = sanitizeSpecsFromAssistant(suggestion?.specs, suggestion?.source);
      itemResult.specsCount = technicalSpecs.length;

      const suggestedName = String(suggestion?.suggestedName || '').trim();
      const doc = await ProductCard.create({
        displayName: suggestedName && suggestedName !== group.type ? suggestedName : '',
        type: group.type,
        manufacturer: pickManufacturer(group, suggestion),
        categoryId: group.categoryId || null,
        itemKind: group.itemKind === 'parts' ? 'parts' : 'equipment',
        defaultBatchUnit: String(group.defaultBatchUnit || 'шт.').trim() || 'шт.',
        defaultCurrency: 'грн.',
        internalNotes: buildInternalNotes(suggestion),
        technicalSpecs,
        attachedFiles,
        materialValueType: ['service', 'electroinstall', 'internal'].includes(group.materialValueType)
          ? group.materialValueType
          : '',
        defaultReceiptMode: group.equipmentCount > 1 ? 'batch' : 'single',
        isActive: true,
        createdByLogin: user.login || 'bulk-assistant',
        createdByName: user.name || user.login || 'Масове наповнення',
      });

      itemResult.status = 'created';
      itemResult.cardId = String(doc._id);
      summary.created += 1;

      if (!cardIndex.has(group.key)) cardIndex.set(group.key, []);
      cardIndex.get(group.key).push({ _id: doc._id, type: doc.type, displayName: doc.displayName });
    } catch (err) {
      itemResult.status = 'failed';
      itemResult.error = err.message || String(err);
      summary.failed += 1;
      console.error('[bulk-product-cards] create failed:', group.type, err);
    }

    summary.items.push(itemResult);

    if (i < slice.length - 1 && delayMsBetweenSuggest > 0) {
      await sleep(delayMsBetweenSuggest);
    }
  }

  summary.remaining = Math.max(0, pending.length - slice.length);

  if (linkAfter && summary.created > 0) {
    summary.linkSummary = await linkEquipmentToProductCardsByName({
      Equipment,
      ProductCard,
      dryRun: false,
    });
  }

  return summary;
}

module.exports = {
  collectPendingUniqueTypes,
  bulkCreateProductCardsFromEquipment,
  DRAFT_NOTE,
};
