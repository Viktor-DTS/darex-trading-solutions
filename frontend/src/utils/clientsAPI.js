// API для роботи з клієнтами CRM
import API_BASE_URL from '../config.js';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

// Список клієнтів (params: page, limit, q/search, region, manager)
// При page/limit повертає { clients, total, page, limit }, інакше — масив (зворотна сумісність)
export const getClients = async (params = {}) => {
  try {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== undefined && v !== null) qs.set(k, String(v));
    });
    const url = qs.toString() ? `${API_BASE_URL}/clients?${qs}` : `${API_BASE_URL}/clients`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Помилка завантаження клієнтів:', error);
    return { clients: [], total: 0, page: 1, limit: 30 };
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

// Пошук клієнта менеджера за телефоном (лише власні клієнти)
export const findMyClientByPhone = async (phone) => {
  try {
    const trimmed = (phone || '').trim();
    if (!trimmed) return null;
    const qs = new URLSearchParams({ phone: trimmed }).toString();
    const response = await fetch(`${API_BASE_URL}/clients/my-by-phone?${qs}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data && data._id ? data : null;
  } catch (error) {
    console.error('Помилка пошуку клієнта за телефоном:', error);
    return null;
  }
};

/** Підказка назви компанії за ЄДРПОУ: CRM → історія закупівель → публічний реєстр. */
export const lookupCompanyByEdrpou = async (edrpou) => {
  try {
    const digits = String(edrpou || '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 10) return null;
    const response = await fetch(
      `${API_BASE_URL}/procurement-requests/lookup-supplier-name?code=${encodeURIComponent(digits)}`,
      { headers: getAuthHeaders() }
    );
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    const name = data && typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) return null;
    return { name, source: data.source || 'registry', edrpou: digits };
  } catch (error) {
    console.error('Помилка пошуку за ЄДРПОУ:', error);
    return null;
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

// Опції для фільтрів (регіони, менеджери)
export const getClientsFilters = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/clients/filters`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження фільтрів:', error);
    return { regions: [], managers: [] };
  }
};

// Міні-статистика портфеля клієнтів
export const getClientsStats = async (params = {}) => {
  try {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== undefined && v !== null) qs.set(k, String(v));
    });
    const url = qs.toString() ? `${API_BASE_URL}/clients/stats?${qs}` : `${API_BASE_URL}/clients/stats`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження статистики клієнтів:', error);
    return {
      total: 0,
      overdueFollowUp: 0,
      todayFollowUp: 0,
      openDealsClients: 0,
      staleNoContact: 0,
      newThisWeek: 0,
    };
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
export const addClientInteraction = async (clientId, { type, date, notes, saleId, nextFollowUpAt }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/clients/${clientId}/interactions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        type: type || 'note',
        date: date || new Date().toISOString(),
        notes: notes || '',
        saleId: saleId || undefined,
        nextFollowUpAt: nextFollowUpAt || undefined,
      })
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
