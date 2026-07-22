import defaultPrivatbankSpec from '../../data/estimateSpecs/privatbank-p0156625.json';
import { fetchEstimateContractSpecsFull } from './estimateSpecsAPI';

const FALLBACK_SPECS = [defaultPrivatbankSpec];

let specsCache = null;
let loadPromise = null;

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
      specsCache = list.length ? list : [...FALLBACK_SPECS];
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
  return getEstimateSpecsSync().find(
    (spec) => normalizeEdrpou(spec.edrpou) === edrpou && contractMatches(spec, task.contractNumber)
  ) || null;
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

export function getSpecItemPrice(item, powerTierId) {
  if (!item?.prices || item.prices.unavailable) return null;
  const price = item.prices[powerTierId];
  return price != null && Number.isFinite(Number(price)) ? Number(price) : null;
}

export function formatSpecItemDisplayName(categoryTitle, item) {
  const cat = String(categoryTitle || '').trim();
  const code = String(item?.code || '').trim();
  const label = String(item?.label || '').trim();
  if (!cat) return `п. ${code} ${label}`.replace(/\s+/g, ' ').trim();
  return `${cat}, п. ${code} ${label}`.replace(/\s+/g, ' ').trim();
}
