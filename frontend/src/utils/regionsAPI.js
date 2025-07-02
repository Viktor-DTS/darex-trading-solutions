import API_BASE_URL from '../config.js';

export const regionsAPI = {
  // Отримати всі регіони
  async getAll() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/regions`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання регіонів:', error);
      return ['Київський', 'Одеський', 'Львівський'];
    }
  },

  // Зберегти регіони
  async save(regions) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/regions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(regions),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Помилка збереження регіонів:', error);
      return false;
    }
  }
}; 