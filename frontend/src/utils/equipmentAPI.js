// API для роботи з обладнанням та матеріалами
import API_BASE_URL from './config.js';
import authenticatedFetch from './api.js';

// Отримання унікальних типів обладнання
export const getEquipmentTypes = async () => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/equipment-types`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання типів обладнання:', error);
    throw error;
  }
};
// Отримання матеріалів по типу обладнання
export const getEquipmentMaterials = async (equipmentType) => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/equipment-materials/${encodeURIComponent(equipmentType)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання матеріалів обладнання:', error);
    throw error;
  }
}; 