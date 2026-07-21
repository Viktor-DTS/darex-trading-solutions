import privatbankSpec from '../../data/estimateSpecs/privatbank-p0156625.json';

const SPECS = [privatbankSpec];

export function normalizeEdrpou(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

export function normalizeContractNumber(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[–—−]/g, '-');
}

function contractMatches(spec, contractNumber) {
  const norm = normalizeContractNumber(contractNumber);
  if (!norm) return false;
  const aliases = [spec.contractNumber, ...(spec.contractNumberAliases || [])].map(normalizeContractNumber);
  return aliases.includes(norm);
}

export function getEstimateSpecForTask(task) {
  if (!task) return null;
  const edrpou = normalizeEdrpou(task.edrpou);
  if (!edrpou) return null;
  return SPECS.find((spec) => normalizeEdrpou(spec.edrpou) === edrpou && contractMatches(spec, task.contractNumber)) || null;
}

export function isEstimateGenerationAvailable(task) {
  if (!task) return false;
  if (task.worksWithoutContract) return false;
  if (!task.contractNumber || !String(task.contractNumber).trim()) return false;
  if (!task.contractFile) return false;
  return !!getEstimateSpecForTask(task);
}

export function getSpecItemPrice(item, powerTierId) {
  if (!item?.prices || item.prices.unavailable) return null;
  const price = item.prices[powerTierId];
  return price != null && Number.isFinite(Number(price)) ? Number(price) : null;
}

export function formatSpecItemDisplayName(categoryTitle, item) {
  const cat = String(categoryTitle || '').trim();
  const shortCat = cat.includes(':') ? cat.split(':')[0].trim() : cat;
  return `${shortCat}, п. ${item.code} ${item.label}`.replace(/\s+/g, ' ').trim();
}
