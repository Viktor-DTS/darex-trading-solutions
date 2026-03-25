// API для роботи з продажами CRM
import API_BASE_URL from '../config.js';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

// Довідник регіонів (для фільтрів CRM)
export const getRegions = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/regions`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження регіонів:', error);
    return [];
  }
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

// Скасування продажу (тільки адміністратор)
export const cancelSale = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${id}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка скасування продажу:', error);
    throw error;
  }
};

// Файли угоди
export const getSaleFiles = async (saleId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${saleId}/files`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження файлів угоди:', error);
    return [];
  }
};

// Файли видаткової накладної
export const getSaleInvoiceFiles = async (saleId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${saleId}/invoice-files`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Помилка завантаження файлів видаткової накладної:', error);
    return [];
  }
};

export const uploadSaleInvoiceFiles = async (saleId, files, description = '') => {
  const formData = new FormData();
  (Array.isArray(files) ? files : [files]).forEach(f => formData.append('files', f));
  if (description) formData.append('description', description);
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/sales/${saleId}/invoice-files`, {
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

export const uploadSaleFiles = async (saleId, files, description = '') => {
  const formData = new FormData();
  (Array.isArray(files) ? files : [files]).forEach(f => formData.append('files', f));
  if (description) formData.append('description', description);
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/sales/${saleId}/files`, {
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
