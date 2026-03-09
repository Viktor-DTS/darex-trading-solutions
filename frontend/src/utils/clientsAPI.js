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
