/**
 * Разовий backfill: проставити кореневу «Групу номенклатури» (дерево 1С) залишкам,
 * у яких група не визначена (categoryId порожній). Корінь береться за типом
 * номенклатури: equipment → коренева група «Товари», parts → коренева група «Деталі».
 * Уже задані групи не чіпаємо.
 */

/**
 * @param {object} opts
 * @param {import('mongoose').Model} opts.Equipment
 * @param {import('mongoose').Model} opts.Category
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<object>}
 */
async function backfillEquipmentRootCategory({ Equipment, Category, dryRun = false }) {
  const stock = require('./stockXlsxImport');
  const categories = await Category.find({}).lean();
  const rootByKind = stock.buildRootCategoryByKind(categories);

  const summary = {
    dryRun: !!dryRun,
    equipmentRoot: rootByKind.equipment ? String(rootByKind.equipment) : null,
    partsRoot: rootByKind.parts ? String(rootByKind.parts) : null,
    scanned: 0,
    equipmentAssigned: 0,
    partsAssigned: 0,
    skippedNoRoot: 0,
  };

  // Залишки без групи (categoryId == null матчить і відсутнє поле).
  const baseMissing = {
    isDeleted: { $ne: true },
    status: { $ne: 'deleted' },
    categoryId: null,
  };
  const partsFilter = { ...baseMissing, itemKind: 'parts' };
  const equipmentFilter = {
    ...baseMissing,
    $or: [{ itemKind: 'equipment' }, { itemKind: null }, { itemKind: { $exists: false } }],
  };

  summary.scanned = await Equipment.countDocuments(baseMissing);
  const partsCount = await Equipment.countDocuments(partsFilter);
  const equipmentCount = await Equipment.countDocuments(equipmentFilter);

  if (rootByKind.parts) summary.partsAssigned = partsCount;
  else summary.skippedNoRoot += partsCount;
  if (rootByKind.equipment) summary.equipmentAssigned = equipmentCount;
  else summary.skippedNoRoot += equipmentCount;

  if (!dryRun) {
    const now = new Date();
    if (rootByKind.parts && partsCount) {
      await Equipment.updateMany(partsFilter, {
        $set: { categoryId: rootByKind.parts, lastModified: now },
      });
    }
    if (rootByKind.equipment && equipmentCount) {
      await Equipment.updateMany(equipmentFilter, {
        $set: { categoryId: rootByKind.equipment, itemKind: 'equipment', lastModified: now },
      });
    }
  }

  return summary;
}

module.exports = { backfillEquipmentRootCategory };
