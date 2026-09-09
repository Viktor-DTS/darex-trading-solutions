/** Аналіз матеріалів за типом обладнання для підказки в заявці. */

const SLOT_DEFS = [
  {
    id: 'oil',
    label: 'Тип оливи',
    liquid: true,
    kind: 'fixed',
    nameField: 'oilType',
    qtyField: 'oilUsed',
    nameKeys: ['oilType'],
    qtyKeys: ['oilUsed', 'oilL'],
  },
  {
    id: 'oilFilter',
    label: 'Масляний фільтр',
    liquid: false,
    kind: 'fixed',
    nameField: 'filterName',
    qtyField: 'filterCount',
    nameKeys: ['filterName', 'oilFilterName'],
    qtyKeys: ['filterCount', 'oilFilterCount'],
  },
  {
    id: 'fuelFilter',
    label: 'Паливний фільтр',
    liquid: false,
    kind: 'fixed',
    nameField: 'fuelFilterName',
    qtyField: 'fuelFilterCount',
    nameKeys: ['fuelFilterName'],
    qtyKeys: ['fuelFilterCount'],
  },
  {
    id: 'airFilter',
    label: 'Повітряний фільтр',
    liquid: false,
    kind: 'fixed',
    nameField: 'airFilterName',
    qtyField: 'airFilterCount',
    nameKeys: ['airFilterName'],
    qtyKeys: ['airFilterCount'],
  },
  {
    id: 'antifreeze',
    label: 'Антифриз',
    liquid: true,
    kind: 'fixed',
    nameField: 'antifreezeType',
    qtyField: 'antifreezeL',
    nameKeys: ['antifreezeType'],
    qtyKeys: ['antifreezeL'],
  },
];

function compactEquipmentType(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]/gi, '');
}

function equipmentTypesMatch(a, b) {
  const ca = compactEquipmentType(a);
  const cb = compactEquipmentType(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  return short.length >= 6 && long.startsWith(short);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function equipmentSearchTokens(value) {
  const tokens = String(value || '').match(/[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9]{2,}/g) || [];
  const long = tokens.filter((t) => t.length >= 3);
  return long.length ? long : tokens;
}

function buildEquipmentSearchRegex(value) {
  const tokens = equipmentSearchTokens(value);
  if (!tokens.length) return null;
  return new RegExp(tokens.map(escapeRegex).join('.*'), 'i');
}

function parseHintQty(value) {
  if (value == null || value === '') return null;
  const n = parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickFirstText(obj, keys) {
  for (const key of keys) {
    const text = String(obj?.[key] || '').trim();
    if (text) return text;
  }
  return '';
}

function pickFirstQty(obj, keys) {
  for (const key of keys) {
    const qty = parseHintQty(obj?.[key]);
    if (qty != null) return qty;
  }
  return null;
}

function nameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function addObservation(bucket, name, qty) {
  const key = nameKey(name);
  if (!key) return;
  if (!bucket[key]) bucket[key] = { name: String(name).trim(), uses: 0, qtys: [] };
  bucket[key].uses += 1;
  if (qty != null) bucket[key].qtys.push(qty);
}

function splitLegacyOtherMaterials(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 180) return [];
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 80);
}

function collectOtherMaterials(task) {
  const items = [];
  if (Array.isArray(task?.otherMaterialLines) && task.otherMaterialLines.length) {
    for (const row of task.otherMaterialLines) {
      const name = String(row?.name || '').trim();
      if (!name) continue;
      items.push({ name, qty: parseHintQty(row.count ?? row.qty) });
    }
    return items;
  }
  for (const name of splitLegacyOtherMaterials(task?.otherMaterials)) {
    items.push({ name, qty: null });
  }
  return items;
}

function taskHasMaterials(task) {
  for (const slot of SLOT_DEFS) {
    if (pickFirstText(task, slot.nameKeys)) return true;
  }
  return collectOtherMaterials(task).length > 0;
}

function summarizeAnalogues(bucket) {
  return Object.values(bucket)
    .map((item) => ({
      name: item.name,
      uses: item.uses,
      qtyMin: item.qtys.length ? Math.min(...item.qtys) : null,
      qtyMax: item.qtys.length ? Math.max(...item.qtys) : null,
    }))
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name, 'uk'));
}

function buildSlot(def, bucket) {
  const analogues = summarizeAnalogues(bucket);
  if (!analogues.length) return null;
  const allMins = analogues.map((a) => a.qtyMin).filter((n) => n != null);
  const allMaxs = analogues.map((a) => a.qtyMax).filter((n) => n != null);
  const qtyMin = allMins.length ? Math.min(...allMins) : null;
  const qtyMax = allMaxs.length ? Math.max(...allMaxs) : null;
  const primary = analogues[0];
  return {
    id: def.id,
    label: def.label,
    liquid: !!def.liquid,
    kind: def.kind,
    nameField: def.nameField,
    qtyField: def.qtyField,
    primaryName: primary.name,
    qtyMin,
    qtyMax,
    suggestedQty: qtyMax != null ? qtyMax : primary.qtyMax,
    taskCount: analogues.reduce((sum, item) => sum + item.uses, 0),
    analogues,
  };
}

function aggregateEquipmentMaterialHints(tasks, equipment) {
  const matched = (Array.isArray(tasks) ? tasks : []).filter(
    (task) => equipmentTypesMatch(equipment, task?.equipment) && taskHasMaterials(task),
  );
  const fixedBuckets = Object.fromEntries(SLOT_DEFS.map((slot) => [slot.id, {}]));
  const otherBuckets = {};

  for (const task of matched) {
    for (const slot of SLOT_DEFS) {
      const name = pickFirstText(task, slot.nameKeys);
      if (!name) continue;
      addObservation(fixedBuckets[slot.id], name, pickFirstQty(task, slot.qtyKeys));
    }
    for (const item of collectOtherMaterials(task)) {
      addObservation(otherBuckets, item.name, item.qty);
    }
  }

  const slots = SLOT_DEFS
    .map((def) => buildSlot(def, fixedBuckets[def.id]))
    .filter(Boolean);

  for (const analogue of summarizeAnalogues(otherBuckets)) {
    slots.push({
      id: `other:${nameKey(analogue.name)}`,
      label: 'Інші матеріали',
      liquid: false,
      kind: 'other',
      nameField: 'otherMaterialLines',
      qtyField: 'count',
      primaryName: analogue.name,
      qtyMin: analogue.qtyMin,
      qtyMax: analogue.qtyMax,
      suggestedQty: analogue.qtyMax,
      taskCount: analogue.uses,
      analogues: [analogue],
    });
  }

  return {
    equipment: String(equipment || '').trim(),
    matchedTasks: matched.length,
    slots,
  };
}

module.exports = {
  SLOT_DEFS,
  compactEquipmentType,
  equipmentTypesMatch,
  equipmentSearchTokens,
  buildEquipmentSearchRegex,
  parseHintQty,
  taskHasMaterials,
  aggregateEquipmentMaterialHints,
};
