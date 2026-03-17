// API для роботи з клієнтами CRM
import API_BASE_URL from '../config.js';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

// Список клієнтів (для manager — тільки свої)
export const getClients = async (params = {}) => {
  try {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${API_BASE_URL}/clients?${qs}` : `${API_BASE_URL}/clients`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження клієнтів:', error);
    return [];
  }
};

// Один клієнт по ID
export const getClient = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/clients/${id}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження клієнта:', error);
    return null;
  }
};

// Перевірка ЄДРПОУ на дублікат (чи не належить іншому менеджеру)
export const checkEdrpou = async (edrpou, excludeClientId = null) => {
  try {
    const trimmed = (edrpou || '').trim();
    if (!trimmed) return { exists: false };
    const qs = excludeClientId ? `?excludeClientId=${excludeClientId}` : '';
    const response = await fetch(`${API_BASE_URL}/clients/check-edrpou/${encodeURIComponent(trimmed)}${qs}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка перевірки ЄДРПОУ:', error);
    return { exists: false };
  }
};

// Пошук клієнта (для вхідного дзвінка — може повертати обмежені дані для чужих)
export const searchClients = async (query) => {
  try {
    const qs = new URLSearchParams({ q: query }).toString();
    const response = await fetch(`${API_BASE_URL}/clients/search?${qs}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка пошуку клієнтів:', error);
    return [];
  }
};

// Створення клієнта
export const createClient = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/clients`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка створення клієнта:', error);
    throw error;
  }
};

// Оновлення клієнта
export const updateClient = async (id, data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/clients/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка оновлення клієнта:', error);
    throw error;
  }
};

// Список користувачів (для вибору менеджерів)
export const getUsers = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження користувачів:', error);
    return [];
  }
};

// Історія взаємодій клієнта
export const getClientInteractions = async (clientId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/clients/${clientId}/interactions`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження історії:', error);
    return [];
  }
};

// Додати взаємодію
export const addClientInteraction = async (clientId, { type, date, notes }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/clients/${clientId}/interactions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ type: type || 'note', date: date || new Date().toISOString(), notes: notes || '' })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка додавання взаємодії:', error);
    throw error;
  }
};

// Файли взаємодії
export const getInteractionFiles = async (clientId, interactionId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/clients/${clientId}/interactions/${interactionId}/files`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження файлів взаємодії:', error);
    return [];
  }
};

export const uploadInteractionFiles = async (clientId, interactionId, files, description = '') => {
  const formData = new FormData();
  (Array.isArray(files) ? files : [files]).forEach(f => formData.append('files', f));
  if (description) formData.append('description', description);
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/clients/${clientId}/interactions/${interactionId}/files`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  return await response.json();
};

// Отримати токен для відкриття/скачування файлу
export const getFileOpenToken = async (fileId) => {
  const response = await fetch(`${API_BASE_URL}/files/open-token/${fileId}`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data.token;
};
