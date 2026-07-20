import API_BASE_URL from '../config';
import { authFetch } from './authFetch';

export async function lookupRequestByNumber(requestNumber) {
  const rn = String(requestNumber || '').trim();
  if (!rn) throw new Error('Номер заявки не вказано');
  const res = await authFetch(`${API_BASE_URL}/requests/by-number/${encodeURIComponent(rn)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}
