/**
 * Підстановка полів форми обладнання з карточки продукту та розпізнавання technicalSpecs.
 * Логіку узгоджено з mergeProductCardSpecsIntoEquipmentPayload у backend/index.js.
 */

function normalizeSpecLabel(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isFormFieldEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

export function mergeTechnicalSpecsIntoEquipmentForm(prevForm, technicalSpecs) {
  const patch = {};
  if (!Array.isArray(technicalSpecs) || !technicalSpecs.length) return patch;
  const rules = [
    {
      test: (l) => /резервн/.test(l) && /потуж|квт|ква|kw|kva|power/.test(l),
      field: 'standbyPower',
    },
    {
      test: (l) => /основн|номінальн|prime/.test(l) && /потуж|квт|ква|kw|kva|power/.test(l),
      field: 'primePower',
    },
    { test: (l) => l.includes('напруг') || l === 'voltage' || /^u\s/.test(l), field: 'voltage' },
    { test: (l) => l === 'фаза' || l.includes('фаз') || l === 'phase', field: 'phase' },
    {
      test: (l) =>
        l.includes('струм') ||
        l.includes('ампер') ||
        l === 'amperage' ||
        (l.includes('current') && !l.includes('account')),
      field: 'amperage',
    },
    {
      test: (l) =>
        /cos\s*[φϕ\u03c6]/.test(l) ||
        l.includes('cosphi') ||
        l.includes('коефіцієнт потужн') ||
        l.includes('power factor'),
      field: 'cosPhi',
    },
    {
      test: (l) =>
        l.includes('частот') || l.includes('frequency') || /\bhz\b/.test(l) || l.includes('гц'),
      field: 'frequency',
    },
    { test: (l) => l.includes('оберт') || l === 'rpm' || l.includes('об/хв'), field: 'rpm' },
    { test: (l) => l.includes('ваг') || l.includes('маса') || l === 'weight', field: 'weight' },
    {
      test: (l) => l.includes('габарит') || l.includes('розмір') || l === 'dimensions',
      field: 'dimensions',
    },
    {
      test: (l) =>
        l.includes('дата вироб') ||
        l.includes('рік випуск') ||
        l.includes('manufacture') ||
        l.includes('year of'),
      field: 'manufactureDate',
    },
  ];
  for (const spec of technicalSpecs) {
    const label = normalizeSpecLabel(spec?.name);
    const valRaw = spec?.value != null ? String(spec.value).trim() : '';
    if (!label || !valRaw) continue;
    for (const rule of rules) {
      if (!rule.test(label)) continue;
      if (!isFormFieldEmpty(prevForm[rule.field])) break;
      if (rule.field === 'manufactureDate') {
        patch.manufactureDate = valRaw;
      } else if (['phase', 'amperage', 'rpm', 'weight', 'cosPhi', 'frequency'].includes(rule.field)) {
        const n = parseFloat(valRaw.replace(',', '.'));
        patch[rule.field] = Number.isNaN(n) ? valRaw : String(n);
      } else {
        patch[rule.field] = valRaw;
      }
      break;
    }
  }
  return patch;
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
 * @returns {{ formPatch: object, equipmentType?: string }}
 */
export function buildPatchesFromProductCard(card, prevForm) {
  if (!card) {
    return { formPatch: {}, cardAttachedFiles: [] };
  }
  const catId =
    card.categoryId != null ? String(card.categoryId._id || card.categoryId) : '';
  const specPatch = mergeTechnicalSpecsIntoEquipmentForm(prevForm, card.technicalSpecs);
  const mvt =
    card.materialValueType && ['service', 'electroinstall', 'internal'].includes(card.materialValueType)
      ? card.materialValueType
      : '';
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
    ...specPatch,
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
