import API_BASE_URL from '../../config';
import { getClientData } from '../edrpouAPI';
import { analyzeContractFileByUrl } from '../pdfUtils';

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function normalizeEdrpouDigits(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

export async function lookupClientNameByEdrpou(edrpou) {
  const digits = normalizeEdrpouDigits(edrpou);
  if (digits.length < 8) return { name: '', source: null };

  try {
    const clientData = await getClientData(digits);
    const fromTasks = String(clientData?.client || '').trim();
    if (fromTasks) return { name: fromTasks, source: 'tasks' };
  } catch {
    /* fallback below */
  }

  try {
    const res = await fetch(
      `${API_BASE_URL}/procurement-requests/lookup-supplier-name?edrpou=${encodeURIComponent(digits)}`,
      { headers: authHeaders() }
    );
    if (res.ok) {
      const data = await res.json();
      const name = String(data?.name || '').trim();
      if (name) return { name, source: data.source || 'registry' };
    }
  } catch {
    /* ignore */
  }

  return { name: '', source: null };
}

async function fetchContractFilesRaw() {
  const res = await fetch(`${API_BASE_URL}/contract-files`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Не вдалося завантажити список договорів');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Активні договори контрагента з розпізнаним номером (дедуплікація по вмісту PDF).
 * @param {string} edrpou
 * @param {{ onProgress?: (loaded: number, total: number) => void }} opts
 */
export async function fetchActiveContractsByEdrpou(edrpou, opts = {}) {
  const digits = normalizeEdrpouDigits(edrpou);
  if (digits.length < 8) return [];

  const all = await fetchContractFilesRaw();
  const filtered = all.filter((c) => normalizeEdrpouDigits(c.edrpou) === digits);
  if (!filtered.length) return [];

  const uniqueUrls = [...new Set(filtered.map((c) => c.url).filter(Boolean))];
  const metaByUrl = new Map();
  let loaded = 0;

  for (let i = 0; i < uniqueUrls.length; i += 4) {
    const batch = uniqueUrls.slice(i, i + 4);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const { pdfKey, meta } = await analyzeContractFileByUrl(url);
          metaByUrl.set(url, {
            pdfKey: pdfKey || url,
            contractNumber: String(meta?.contractNumber || '').trim(),
            contractDate: String(meta?.contractDate || '').trim(),
          });
        } catch {
          metaByUrl.set(url, { pdfKey: url, contractNumber: '', contractDate: '' });
        } finally {
          loaded += 1;
          opts.onProgress?.(loaded, uniqueUrls.length);
        }
      })
    );
  }

  const byKey = new Map();
  for (const row of filtered) {
    if (!row.url) continue;
    const meta = metaByUrl.get(row.url) || {};
    const pdfKey = meta.pdfKey || row.url;
    const contractNumber = meta.contractNumber
      || String(row.fileName || '').replace(/\.(pdf|docx?)$/i, '').trim();

    if (!byKey.has(pdfKey)) {
      byKey.set(pdfKey, {
        url: row.url,
        client: row.client || '',
        edrpou: digits,
        contractNumber,
        contractDate: meta.contractDate || '',
        fileName: row.fileName || 'contract.pdf',
        pdfKey,
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const an = a.contractNumber || '';
    const bn = b.contractNumber || '';
    return an.localeCompare(bn, 'uk');
  });
}
