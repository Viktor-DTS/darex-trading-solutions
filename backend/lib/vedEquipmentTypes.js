/** Єдиний довідник типів обладнання для панелі ВЕД. */
const VED_EQUIPMENT_TYPE_LABELS = {
  generator_diesel: 'Дизель-генератор',
  generator_benzin_gas: 'Бензин/газовий генератор',
  generator_gas: 'Газовий генератор',
  inverter_lifepo4: 'Інвертор + LiFePO4',
  inverter_hybrid: 'Гібридний інвертор',
  batteries_lifepo4: 'Батареї LiFePO4',
  ups: 'ДБЖ / UPS',
  ats: 'АВР / ATS',
  solar_panels: 'Сонячні панелі',
  solar_inverter: 'Сонячний інвертор',
  charging_ev: 'Зарядна станція EV',
  spare_parts: 'Запчастини / комплектуючі',
  other: 'Інше обладнання',
};

const EQUIPMENT_TYPES = Object.keys(VED_EQUIPMENT_TYPE_LABELS);

const DEFAULT_TECHNICAL_REQUIREMENTS = {
  generator_diesel: 'Промислові дизель-генератори, export OEM, silent canopy',
  generator_benzin_gas: 'Портативні бензин/газові генератори для export',
  generator_gas: 'Газові генератори промислові та резервні, export',
  inverter_lifepo4: 'Гібридні інвертори + LiFePO4 ESS, промислові системи',
  inverter_hybrid: 'Гібридні інвертори для резервного/сонячного живлення',
  batteries_lifepo4: 'LiFePO4 rack battery BMS, промислові системи',
  ups: 'ДБЖ / UPS промислові, трифазні, export supplier',
  ats: 'АВР / ATS автоматичне введення резерву, промислові',
  solar_panels: 'Сонячні панелі моно/полі, Tier-1, export',
  solar_inverter: 'Сонячні інвертори string/hybrid, export OEM',
  charging_ev: 'Зарядні станції EV AC/DC, export manufacturer',
  spare_parts: 'Запчастини та комплектуючі для генераторів та ESS',
  other: 'Промислове енергетичне обладнання, export manufacturer',
};

function normalizeEquipmentType(value) {
  const key = String(value || '').trim();
  return EQUIPMENT_TYPES.includes(key) ? key : 'other';
}

function equipmentTypeLabel(type) {
  return VED_EQUIPMENT_TYPE_LABELS[normalizeEquipmentType(type)] || type || '—';
}

function defaultTechnicalRequirements(type) {
  return DEFAULT_TECHNICAL_REQUIREMENTS[normalizeEquipmentType(type)] || DEFAULT_TECHNICAL_REQUIREMENTS.other;
}

function normalizeEquipmentTypes(input) {
  let raw = [];
  if (Array.isArray(input?.equipmentTypes)) raw = input.equipmentTypes;
  else if (input?.equipmentType) raw = [input.equipmentType];

  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const t = normalizeEquipmentType(item);
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.length ? out : ['other'];
}

function buildDefaultTechnicalRequirementsForTypes(types) {
  return normalizeEquipmentTypes({ equipmentTypes: types })
    .map((t) => `${equipmentTypeLabel(t)}: ${defaultTechnicalRequirements(t)}`)
    .join('\n');
}

module.exports = {
  VED_EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPES,
  DEFAULT_TECHNICAL_REQUIREMENTS,
  normalizeEquipmentType,
  normalizeEquipmentTypes,
  equipmentTypeLabel,
  defaultTechnicalRequirements,
  buildDefaultTechnicalRequirementsForTypes,
};
