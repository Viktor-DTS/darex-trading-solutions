// API для роботи з продажами CRM
import API_BASE_URL from '../config.js';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

// Список продажів
export const getSales = async (params = {}) => {
  try {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${API_BASE_URL}/sales?${qs}` : `${API_BASE_URL}/sales`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження продажів:', error);
    return [];
  }
};

// Один продаж по ID
export const getSale = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${id}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження продажу:', error);
    return null;
  }
};

// Створення продажу
export const createSale = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sales`, {
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
    console.error('Помилка створення продажу:', error);
    throw error;
  }
};

// Оновлення продажу
export const updateSale = async (id, data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${id}`, {
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
    console.error('Помилка оновлення продажу:', error);
    throw error;
  }
};

// Видалення продажу (тільки draft)
export const deleteSale = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('Помилка видалення продажу:', error);
    throw error;
  }
};
