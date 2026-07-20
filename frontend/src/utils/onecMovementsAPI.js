import API_BASE_URL from '../config';

const headers = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

export async function getOneCMovements({
  docType,
  from,
  to,
  warehouseId,
  search,
  skip = 0,
  limit = 100,
} = {}) {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });
  if (docType) params.set('docType', docType);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (warehouseId) params.set('warehouseId', warehouseId);
  if (search) params.set('search', search);

  const res = await fetch(`${API_BASE_URL}/onec/movements?${params}`, { headers: headers() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}
