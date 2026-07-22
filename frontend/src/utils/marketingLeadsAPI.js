import API_BASE_URL from '../config.js';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

export async function getMarketingLeadsMeta() {
  const res = await fetch(`${API_BASE_URL}/marketing/leads/meta`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function getMarketingLeadsStats() {
  const res = await fetch(`${API_BASE_URL}/marketing/leads/stats`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function getMarketingLeads(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${API_BASE_URL}/marketing/leads?${qs}` : `${API_BASE_URL}/marketing/leads`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function getMarketingLead(id) {
  const res = await fetch(`${API_BASE_URL}/marketing/leads/${id}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function createMarketingLead(data) {
  const res = await fetch(`${API_BASE_URL}/marketing/leads`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function updateMarketingLead(id, data) {
  const res = await fetch(`${API_BASE_URL}/marketing/leads/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function assignMarketingLead(id, managerLogin) {
  const res = await fetch(`${API_BASE_URL}/marketing/leads/${id}/assign`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ managerLogin }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function transmitMarketingLead(id, note = '') {
  const res = await fetch(`${API_BASE_URL}/marketing/leads/${id}/transmit`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function getMarketingIntegrationsStatus() {
  const res = await fetch(`${API_BASE_URL}/marketing/integrations/status`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function setupTelegramWebhook() {
  const res = await fetch(`${API_BASE_URL}/marketing/integrations/telegram/setup`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

export async function setupViberWebhook() {
  const res = await fetch(`${API_BASE_URL}/marketing/integrations/viber/setup`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}
