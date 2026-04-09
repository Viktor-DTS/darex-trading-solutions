/** Підпис фільтра «Тип номенклатури» — гілка дерева (як у складі) */
export const ITEM_KIND_FILTER_FIXED_ASSETS_LABEL =
  'Необоротні активи (офісно-складське приладдя)';

/** Значення за замовчуванням у фільтрах типу номенклатури (лише товари / equipment) */
export const ITEM_KIND_FILTER_DEFAULT_GOODS = 'Товари';

function collectCategorySubtreeIds(node) {
  const ids = [String(node._id)];
  for (const ch of node.children || []) {
    ids.push(...collectCategorySubtreeIds(ch));
  }
  return ids;
}

/** Усі categoryId у гілці «Необоротні активи…» */
export function findFixedAssetsCategoryIdsFromTree(nodes) {
  const ids = new Set();
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const n of list) {
      const name = (n.name || '').trim();
      if (
        name === ITEM_KIND_FILTER_FIXED_ASSETS_LABEL ||
        name.includes('Необоротні активи')
      ) {
        collectCategorySubtreeIds(n).forEach((id) => ids.add(id));
      }
      walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

/**
 * Чи проходить позиція обладнання фільтр колонки «Тип номенклатури» (як у EquipmentList).
 * @param {object} eq
 * @param {string} filterValue — '' | 'Товари' | 'Деталі' | ITEM_KIND_FILTER_FIXED_ASSETS_LABEL
 * @param {Set<string>|null} fixedAssetsCategoryIds — null поки дерево не завантажено
 */
export function equipmentMatchesItemKindFilter(eq, filterValue, fixedAssetsCategoryIds) {
  if (!filterValue || filterValue.trim() === '') return true;
  if (filterValue === ITEM_KIND_FILTER_FIXED_ASSETS_LABEL) {
    if (fixedAssetsCategoryIds == null) return true;
    const cid = eq.categoryId != null ? String(eq.categoryId) : '';
    return cid !== '' && fixedAssetsCategoryIds.has(cid);
  }
  if (filterValue === 'Товари') {
    return (eq.itemKind || 'equipment') === 'equipment';
  }
  if (filterValue === 'Деталі') {
    return eq.itemKind === 'parts';
  }
  return true;
}

/**
 * Опції select «Тип номенклатури».
 * @param {{ includeFixedAssets?: boolean }} [opts] — у формі продажу без гілки «Необоротні активи»; у складі — повний список.
 */
export function getItemKindFilterSelectOptions({ includeFixedAssets = true } = {}) {
  const base = ['', 'Товари', 'Деталі'];
  if (includeFixedAssets) base.push(ITEM_KIND_FILTER_FIXED_ASSETS_LABEL);
  return base;
}
