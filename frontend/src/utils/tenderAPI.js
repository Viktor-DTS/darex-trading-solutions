import API_BASE_URL from '../config';
import { tryHandleUnauthorizedResponse } from './authSession';

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (tryHandleUnauthorizedResponse(res)) throw new Error('Сесія закінчилась');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function getTenderMeta() {
  return apiFetch('/tenders/meta');
}

export function searchTenders(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') qs.set(k, String(v));
  });
  const q = qs.toString();
  return apiFetch(`/tenders/search${q ? `?${q}` : ''}`);
}

export function getProzorroTender(id, source = 'prozorro') {
  const qs = source ? `?source=${encodeURIComponent(source)}` : '';
  return apiFetch(`/tenders/prozorro/${encodeURIComponent(id)}${qs}`);
}

export function getTenderWatchlist(params = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  const q = qs.toString();
  return apiFetch(`/tenders/watchlist${q ? `?${q}` : ''}`);
}

export function getTenderWatchlistStats() {
  return apiFetch('/tenders/watchlist/stats');
}

export function saveTenderToWatchlist(payload) {
  return apiFetch('/tenders/watchlist', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateTenderWatch(id, payload) {
  return apiFetch(`/tenders/watchlist/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function assignTenderManager(id, managerLogin) {
  return apiFetch(`/tenders/watchlist/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ managerLogin }),
  });
}

export function transmitTenderToManager(id, note) {
  return apiFetch(`/tenders/watchlist/${id}/transmit`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export function deleteTenderWatch(id) {
  return apiFetch(`/tenders/watchlist/${id}`, { method: 'DELETE' });
}
