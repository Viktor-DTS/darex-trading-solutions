// API для роботи з ЄДРПОУ та автозаповненням
import API_BASE_URL from '../config.js';

// Отримання унікальних ЄДРПОУ
export const getEdrpouList = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/edrpou-list`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання списку ЄДРПОУ:', error);
    return [];
  }
};

// Отримання даних клієнта по ЄДРПОУ
export const getClientData = async (edrpou) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/client-data/${encodeURIComponent(edrpou)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання даних клієнта:', error);
    return { client: '', address: '', contractFile: null, invoiceRecipientDetails: '' };
  }
};

// Отримання типів обладнання по ЄДРПОУ
export const getEdrpouEquipmentTypes = async (edrpou) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/edrpou-equipment-types/${encodeURIComponent(edrpou)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання типів обладнання для ЄДРПОУ:', error);
    return [];
  }
};

// Отримання матеріалів по ЄДРПОУ та типу обладнання
export const getEdrpouEquipmentMaterials = async (edrpou, equipmentType) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/edrpou-equipment-materials/${encodeURIComponent(edrpou)}/${encodeURIComponent(equipmentType)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання матеріалів для ЄДРПОУ та типу обладнання:', error);
    return {};
  }
};

// Отримання унікальних типів обладнання
export const getEquipmentTypes = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/equipment-types`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання типів обладнання:', error);
    return [];
  }
};

// Отримання даних по типу обладнання
export const getEquipmentData = async (equipmentType) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/equipment-data/${encodeURIComponent(equipmentType)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання даних обладнання:', error);
    return {};
  }
};
