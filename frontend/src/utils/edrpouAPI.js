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
    console.log('[DEBUG] getContractFiles - запит до API:', `${API_BASE_URL}/api/contract-files`);
    const response = await fetch(`${API_BASE_URL}/api/contract-files`);
    console.log('[DEBUG] getContractFiles - статус відповіді:', response.status);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log('[DEBUG] getContractFiles - отримані дані:', data);
    return data;
  } catch (error) {
    console.error('Помилка отримання списку файлів договорів:', error);
    throw error;
  }
};

export const getEdrpouEquipmentTypes = async (edrpou) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/edrpou-equipment-types/${encodeURIComponent(edrpou)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання типів обладнання для ЄДРПОУ:', error);
    throw error;
  }
};

export const getEdrpouEquipmentMaterials = async (edrpou, equipmentType) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/edrpou-equipment-materials/${encodeURIComponent(edrpou)}/${encodeURIComponent(equipmentType)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання матеріалів для ЄДРПОУ та типу обладнання:', error);
    throw error;
  }
};
