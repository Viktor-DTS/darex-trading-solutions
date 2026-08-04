import defaultPrivatbankSpec from '../../data/estimateSpecs/privatbank-p0156625.json';
import defaultLifecellSpec from '../../data/estimateSpecs/lifecell-amn24use229.json';
import { fetchEstimateContractSpecsFull } from './estimateSpecsAPI';

const FALLBACK_SPECS = [defaultPrivatbankSpec, defaultLifecellSpec];
let specsCache = null;
let loadPromise = null;

function mergeSpecsWithFallback(apiList) {
  const byId = new Map();
  for (const spec of FALLBACK_SPECS) {
    const id = String(spec?.id || '').trim();
    if (id) byId.set(id, { ...spec });
  }
  for (const spec of apiList || []) {
    const id = String(spec?.id || '').trim();
    if (!id) continue;
    const fallback = byId.get(id);
    byId.set(id, fallback ? {
      ...fallback,
      ...spec,
      excelGenerator: spec.excelGenerator || fallback.excelGenerator || '',
      templateStaticPath: spec.templateStaticPath || fallback.templateStaticPath || '',
      pricesAreNetOfVat: spec.pricesAreNetOfVat ?? fallback.pricesAreNetOfVat ?? false,
      vatRate: Number.isFinite(Number(spec.vatRate)) ? Number(spec.vatRate) : (fallback.vatRate ?? 0),
      categories: Array.isArray(spec.categories) && spec.categories.length ? spec.categories : fallback.categories,
      powerTiers: Array.isArray(spec.powerTiers) && spec.powerTiers.length ? spec.powerTiers : fallback.powerTiers,
    } : { ...spec });
  }
  return Array.from(byId.values());
}

export function getEstimateSpecsSync() {
  return specsCache || FALLBACK_SPECS;
}

export function invalidateEstimateSpecsCache() {
  specsCache = null;
  loadPromise = null;
}

export async function loadEstimateSpecs(force = false) {
  if (specsCache && !force) return specsCache;
  if (loadPromise && !force) return loadPromise;

  loadPromise = (async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        specsCache = [...FALLBACK_SPECS];
        return specsCache;
      }
      const list = await fetchEstimateContractSpecsFull();
      specsCache = mergeSpecsWithFallback(list);
    } catch (e) {
      console.warn('[estimateSpecRegistry] API fallback:', e.message);
      specsCache = [...FALLBACK_SPECS];
    } finally {
      loadPromise = null;
    }
    return specsCache;
  })();

  return loadPromise;
}

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
  const specsForEdrpou = getEstimateSpecsSync().filter(
    (spec) => normalizeEdrpou(spec.edrpou) === edrpou
  );
  if (!specsForEdrpou.length) return null;

  const contractNumber = String(task.contractNumber || '').trim();
  if (contractNumber) {
    const byContract = specsForEdrpou.find((spec) => contractMatches(spec, contractNumber));
    if (byContract) return byContract;
  }

  if (specsForEdrpou.length === 1) return specsForEdrpou[0];
  return null;
}

export function getEstimateAvailabilitySummary() {
  const specs = getEstimateSpecsSync();
  if (!specs.length) {
    return 'Специфікації договорів для кошторисів ще не налаштовані.';
  }
  const clients = specs.map((spec) => {
    const name = String(spec.clientName || spec.title || '').trim() || 'Контрагент';
    const edrpou = normalizeEdrpou(spec.edrpou);
    return edrpou ? `${name} (ЄДРПОУ ${edrpou})` : name;
  });
  return `Кнопка доступна для заявок: ${clients.join('; ')} — після збереження заявки та прив’язки файлу договору.`;
}

export function getEstimateDisabledReason(task, taskId) {
  if (!taskId) return 'Спочатку збережіть заявку.';
  if (task?.worksWithoutContract) return 'Заявка позначена як «без договору».';
  if (!String(task?.contractNumber || '').trim()) return 'Заповніть номер договору.';
  if (!getContractFileUrl(task)) return 'Завантажте або оберіть файл договору.';
  if (!getEstimateSpecForTask(task)) {
    const edrpou = normalizeEdrpou(task?.edrpou);
    const count = getEstimateSpecsSync().filter((spec) => normalizeEdrpou(spec.edrpou) === edrpou).length;
    if (!count) return `Для ЄДРПОУ ${edrpou || '—'} немає специфікації кошторису.`;
    if (count > 1) return 'Номер договору не збігається з жодною специфікацією для цього ЄДРПОУ.';
  }
  return getEstimateAvailabilitySummary();
}

export function isEstimateGenerationAvailable(task) {
  if (!task) return false;
  if (task.worksWithoutContract) return false;
  if (!task.contractNumber || !String(task.contractNumber).trim()) return false;
  if (!task.contractFile) return false;
  return !!getEstimateSpecForTask(task);
}

export function getContractFileUrl(task) {
  const contractFile = task?.contractFile;
  if (!contractFile) return '';
  if (typeof contractFile === 'string') return contractFile.trim();
  return String(
    contractFile.url || contractFile.href || contractFile.secure_url || contractFile.publicUrl || ''
  ).trim();
}

export function getContractFileLabel(url) {
  if (!url) return 'Договір';
  try {
    const path = String(url).split('?')[0];
    const name = path.split('/').pop();
    return name ? decodeURIComponent(name) : 'Договір';
  } catch {
    return 'Договір';
  }
}

export function getEstimateContractSummary(task, spec) {
  if (!task || !spec) return null;
  const contractFileUrl = getContractFileUrl(task);
  return {
    client: String(task.client || '').trim(),
    edrpou: normalizeEdrpou(task.edrpou),
    contractNumber: String(task.contractNumber || spec.contractNumber || '').trim(),
    contractDate: String(task.contractDate || '').trim(),
    specTitle: String(spec.title || '').trim(),
    requestNumber: String(task.requestNumber || '').trim(),
    contractFileUrl,
    contractFileLabel: getContractFileLabel(contractFileUrl),
  };
}

export function contractSupportsEstimate(contract, task = {}) {
  if (!contract || task.worksWithoutContract) return false;
  const contractNumber = String(contract.parsedContractNumber || task.contractNumber || '').trim();
  if (!contractNumber) return false;
  const contractFile = String(contract.url || '').trim() || getContractFileUrl(task);
  if (!contractFile) return false;
  return !!getEstimateSpecForTask({
    edrpou: task.edrpou || contract.edrpou,
    contractNumber,
    contractFile,
  });
}

import { roundMoney } from './estimatePrefill';

export function getSpecItemPrice(item, powerTierId, spec) {
  if (!item?.prices || item.prices.unavailable) return null;
  const price = item.prices[powerTierId];
  if (price == null || !Number.isFinite(Number(price))) return null;
  let gross = Number(price);
  if (spec?.pricesAreNetOfVat) {
    const rate = Number(spec.vatRate);
    gross = roundMoney(gross * (1 + (Number.isFinite(rate) ? rate : 0.2)));
  }
  return gross;
}

export function formatSpecItemDisplayName(categoryTitle, item) {
  const cat = String(categoryTitle || '').trim();
  const code = String(item?.code || '').trim();
  const label = String(item?.label || '').trim();
  if (!cat) return `п. ${code} ${label}`.replace(/\s+/g, ' ').trim();
  return `${cat}, п. ${code} ${label}`.replace(/\s+/g, ' ').trim();
}
