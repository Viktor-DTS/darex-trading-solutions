// API для роботи з обладнанням та матеріалами
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : 'https://darex-trading-solutions-f.onrender.com';
// Отримання унікальних типів обладнання
export const getEquipmentTypes = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/equipment-types`);
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
    const response = await fetch(`${API_BASE_URL}/api/equipment-materials/${encodeURIComponent(equipmentType)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Помилка отримання матеріалів обладнання:', error);
    throw error;
  }
}; 