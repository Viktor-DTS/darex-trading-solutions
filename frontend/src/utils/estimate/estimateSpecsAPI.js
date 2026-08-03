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

export async function createEstimateContractSpec(payload) {
  const res = await fetch(`${API_BASE_URL}/estimate-contract-specs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не вдалося створити специфікацію');
  }
  return res.json();
}

export async function uploadEstimateTemplate(specId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE_URL}/estimate-contract-specs/${encodeURIComponent(specId)}/template`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не вдалося завантажити шаблон');
  }
  return res.json();
}

export async function deleteEstimateTemplate(specId) {
  const res = await fetch(`${API_BASE_URL}/estimate-contract-specs/${encodeURIComponent(specId)}/template`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не вдалося видалити шаблон');
  }
  return res.json();
}

export function getDefaultEstimateTemplateDownloadUrl() {
  return `${API_BASE_URL}/estimate-contract-specs/default-template`;
}

export async function downloadDefaultEstimateTemplate() {
  const res = await fetch(getDefaultEstimateTemplateDownloadUrl(), {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не вдалося завантажити типовий шаблон');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'estimate-template.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadEstimateTemplate(url, filename = 'estimate-template.xlsx') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Не вдалося завантажити шаблон');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
