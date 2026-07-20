import API_BASE_URL from '../config';
import { authFetch } from './authFetch';

const headers = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

export async function lookupRequestByNumber(requestNumber) {
  const rn = String(requestNumber || '').trim();
  if (!rn) throw new Error('Номер заявки не вказано');
  const res = await authFetch(`${API_BASE_URL}/requests/by-number/${encodeURIComponent(rn)}`, {
    headers: headers(),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error('Сесія закінчилася. Перезайдіть у систему.');
  }
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}
