/**
 * Видалення карточок продукту з опційним від'єднанням залишків (productId → null).
 */

function toObjectIds(ids) {
  const mongoose = require('mongoose');
  const out = [];
  for (const raw of ids || []) {
    const s = String(raw || '').trim();
    if (mongoose.Types.ObjectId.isValid(s)) out.push(new mongoose.Types.ObjectId(s));
  }
  return out;
}

/**
 * @param {import('mongoose').Model} Equipment
 * @param {import('mongoose').Types.ObjectId[]} productCardOids
 */
async function summarizeEquipmentLinks(Equipment, productCardOids) {
  if (!productCardOids.length) {
    return { linkedRows: 0, linkedQuantity: 0 };
  }
  const agg = await Equipment.aggregate([
    {
      $match: {
        productId: { $in: productCardOids },
        isDeleted: { $ne: true },
        status: { $ne: 'deleted' },
      },
    },
    {
      $group: {
        _id: null,
        linkedRows: { $sum: 1 },
        linkedQuantity: { $sum: { $ifNull: ['$quantity', 1] } },
      },
    },
  ]);
  return {
    linkedRows: agg[0]?.linkedRows || 0,
    linkedQuantity: agg[0]?.linkedQuantity || 0,
  };
}

/**
 * @param {object} opts
 * @param {import('mongoose').Model} opts.Equipment
 * @param {import('mongoose').Model} opts.ProductCard
 * @param {string[]} opts.ids
 * @param {boolean} [opts.unlinkStock]
 * @param {boolean} [opts.dryRun]
 */
async function deleteProductCardsWithOptionalUnlink({
  Equipment,
  ProductCard,
  ids,
  unlinkStock = true,
  dryRun = false,
}) {
  const oids = toObjectIds(ids);
  const summary = {
    dryRun: !!dryRun,
    requested: Array.isArray(ids) ? ids.length : 0,
    validIds: oids.length,
    foundCards: 0,
    deleted: 0,
    notFound: 0,
    unlinkStock: !!unlinkStock,
    linkedRows: 0,
    linkedQuantity: 0,
    unlinkedRows: 0,
    samples: [],
  };

  if (!oids.length) {
    return summary;
  }

  const cards = await ProductCard.find({ _id: { $in: oids } })
    .select('_id type displayName')
    .lean();
  summary.foundCards = cards.length;
  summary.notFound = oids.length - cards.length;

  const cardOids = cards.map((c) => c._id);
  const linkInfo = await summarizeEquipmentLinks(Equipment, cardOids);
  summary.linkedRows = linkInfo.linkedRows;
  summary.linkedQuantity = linkInfo.linkedQuantity;

  for (const c of cards.slice(0, 12)) {
    summary.samples.push({
      id: String(c._id),
      type: c.type,
      displayName: c.displayName || '',
    });
  }

  if (dryRun) {
    summary.wouldDelete = cards.length;
    summary.wouldUnlinkRows = unlinkStock ? linkInfo.linkedRows : 0;
    return summary;
  }

  if (unlinkStock && cardOids.length) {
    const now = new Date();
    const upd = await Equipment.updateMany(
      {
        productId: { $in: cardOids },
        isDeleted: { $ne: true },
        status: { $ne: 'deleted' },
      },
      { $set: { productId: null, lastModified: now } },
    );
    summary.unlinkedRows = upd.modifiedCount || 0;
  } else if (!unlinkStock && linkInfo.linkedRows > 0) {
    const err = new Error(
      `Неможливо видалити: на складі є залишки за карточкою (${linkInfo.linkedQuantity} од. у ${linkInfo.linkedRows} поз.). Увімкніть від'єднання залишків.`,
    );
    err.code = 'PRODUCT_CARD_LINKED_STOCK';
    err.linkedRows = linkInfo.linkedRows;
    err.linkedQuantity = linkInfo.linkedQuantity;
    throw err;
  }

  if (cardOids.length) {
    const del = await ProductCard.deleteMany({ _id: { $in: cardOids } });
    summary.deleted = del.deletedCount || 0;
  }

  return summary;
}

module.exports = {
  toObjectIds,
  summarizeEquipmentLinks,
  deleteProductCardsWithOptionalUnlink,
};
