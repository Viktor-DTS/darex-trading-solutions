// API для роботи з ЄДРПОУ та даними клієнтів
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : 'https://darex-trading-solutions.onrender.com';

// Отримання унікальних ЄДРПОУ
export const getEdrpouList = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/edrpou-list`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання списку ЄДРПОУ:', error);
    throw error;
  }
};

// Отримання даних клієнта по ЄДРПОУ
export const getClientData = async (edrpou) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/client-data/${encodeURIComponent(edrpou)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання даних клієнта:', error);
    throw error;
  }
};

// Отримання списку файлів договорів
export const getContractFiles = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/contract-files`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання списку файлів договорів:', error);
    throw error;
  }
};
