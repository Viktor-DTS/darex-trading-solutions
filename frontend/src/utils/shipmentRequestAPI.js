import API_BASE_URL from '../config.js';

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
});

export async function getShipmentRequestPreviewNumber() {
  const res = await fetch(`${API_BASE_URL}/shipment-requests/preview-number`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Не вдалося отримати номер заявки');
  const data = await res.json();
  return data.previewNumber || '';
}

export async function submitSaleShipmentRequest(saleId, payload, ttnFile) {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  if (ttnFile) formData.append('ttn', ttnFile);
  const res = await fetch(`${API_BASE_URL}/sales/${saleId}/shipment-request`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getShipmentRequestFull(id) {
  const res = await fetch(`${API_BASE_URL}/shipment-requests/${id}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Заявку не знайдено');
  return res.json();
}

export async function listShipmentRequests(status = 'pending') {
  const res = await fetch(`${API_BASE_URL}/shipment-requests?status=${encodeURIComponent(status)}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Немає доступу до списку');
  return res.json();
}

export async function patchShipmentRequestStatus(id, status) {
  const res = await fetch(`${API_BASE_URL}/shipment-requests/${id}/status`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
