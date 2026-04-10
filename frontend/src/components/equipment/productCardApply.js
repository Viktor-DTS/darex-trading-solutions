/**
 * Підстановка полів форми обладнання з карточки продукту.
 * Технічні характеристики зливаються в масив technicalSpecs (конструктор), без фіксованих полів форми.
 */

function newSpecKey() {
  return `spec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function mergeCardSpecsIntoFormRows(prevRows, cardSpecs) {
  const prev = Array.isArray(prevRows) ? [...prevRows] : [];
  const seen = new Set(
    prev.map((r) => `${String(r.name || '').toLowerCase()}|${String(r.value || '').toLowerCase()}`),
  );
  for (const s of cardSpecs || []) {
    const name = s?.name != null ? String(s.name).trim() : '';
    const value = s?.value != null ? String(s.value).trim() : '';
    if (!name && !value) continue;
    const k = `${name.toLowerCase()}|${value.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    prev.push({ _key: newSpecKey(), name, value });
  }
  return prev;
}

export function mergeAttachedFromProductCard(prevFiles, cardFiles) {
  const list = Array.isArray(cardFiles) ? cardFiles : [];
  const mapped = list.map((f, i) => ({
    id: f._id || f.cloudinaryId || `pc-${i}-${Date.now()}`,
    cloudinaryUrl: f.cloudinaryUrl,
    cloudinaryId: f.cloudinaryId,
    originalName: f.originalName || 'з карточки',
    mimetype: f.mimetype || 'image/jpeg',
    size: f.size || 0,
  }));
  const seen = new Set((prevFiles || []).map((f) => f.cloudinaryId).filter(Boolean));
  const prefix = mapped.filter((f) => f.cloudinaryUrl && (!f.cloudinaryId || !seen.has(f.cloudinaryId)));
  return [...prefix, ...(prevFiles || [])];
}

/**
 * @param {object} card — документ карточки з API (lean)
 * @param {object} prevForm — поточний formData
 */
export function buildPatchesFromProductCard(card, prevForm) {
  if (!card) {
    return { formPatch: {}, cardAttachedFiles: [] };
  }
  const catId =
    card.categoryId != null ? String(card.categoryId._id || card.categoryId) : '';
  const mvt =
    card.materialValueType && ['service', 'electroinstall', 'internal'].includes(card.materialValueType)
      ? card.materialValueType
      : '';
  const specRows = mergeCardSpecsIntoFormRows(prevForm.technicalSpecs, card.technicalSpecs);
  const formPatch = {
    productId: String(card._id),
    type: prevForm.type?.trim() ? prevForm.type : (card.type || ''),
    manufacturer: prevForm.manufacturer?.trim() ? prevForm.manufacturer : (card.manufacturer || ''),
    categoryId: prevForm.categoryId?.trim() ? prevForm.categoryId : (catId || ''),
    itemKind: prevForm.categoryId?.trim()
      ? prevForm.itemKind
      : (card.itemKind || prevForm.itemKind || 'equipment'),
    batchUnit: prevForm.batchUnit?.trim() ? prevForm.batchUnit : (card.defaultBatchUnit || prevForm.batchUnit || ''),
    currency: prevForm.currency?.trim() ? prevForm.currency : (card.defaultCurrency || prevForm.currency || 'грн.'),
    materialValueType: prevForm.materialValueType?.trim()
      ? prevForm.materialValueType
      : (mvt || prevForm.materialValueType || ''),
    technicalSpecs: specRows,
  };
  let equipmentType;
  if (card.defaultReceiptMode === 'batch') equipmentType = 'batch';
  else if (card.defaultReceiptMode === 'single') equipmentType = 'single';
  return {
    formPatch,
    equipmentType,
    cardAttachedFiles: Array.isArray(card.attachedFiles) ? card.attachedFiles : [],
  };
}
