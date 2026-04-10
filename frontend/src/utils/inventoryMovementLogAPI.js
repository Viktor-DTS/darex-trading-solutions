import API_BASE_URL from '../config';

const headers = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json'
});

export async function getInventoryMovementLog({ skip = 0, limit = 150 } = {}) {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  const res = await fetch(`${API_BASE_URL}/inventory-movement-log?${params}`, { headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
