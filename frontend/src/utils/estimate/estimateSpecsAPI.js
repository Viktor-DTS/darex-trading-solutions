import API_BASE_URL from '../../config';

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchEstimateContractSpecsList() {
  const res = await fetch(`${API_BASE_URL}/estimate-contract-specs`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не вдалося завантажити список специфікацій');
  }
  const data = await res.json();
  return Array.isArray(data.specs) ? data.specs : [];
}

export async function fetchEstimateContractSpecsFull() {
  const res = await fetch(`${API_BASE_URL}/estimate-contract-specs?full=1`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не вдалося завантажити специфікації');
  }
  const data = await res.json();
  return Array.isArray(data.specs) ? data.specs : [];
}

export async function fetchEstimateContractSpecById(id) {
  const res = await fetch(`${API_BASE_URL}/estimate-contract-specs/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не вдалося завантажити специфікацію');
  }
  return res.json();
}

export async function saveEstimateContractSpec(id, payload) {
  const res = await fetch(`${API_BASE_URL}/estimate-contract-specs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не вдалося зберегти специфікацію');
  }
  return res.json();
}
