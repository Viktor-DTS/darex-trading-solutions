import API_BASE_URL from '../config.js';
import authenticatedFetch from './api.js';

export const importedTasksAPI = {
  // Отримати всі імпортовані заявки
  getAll: async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/tasks/imported`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[ERROR] importedTasksAPI.getAll - помилка:', error);
      throw error;
    }
  },

  // Створити імпортовані заявки
  create: async (tasks) => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/tasks/imported`, {
        method: 'POST',
        body: JSON.stringify({ tasks }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ERROR] importedTasksAPI.create - помилка:', error);
      throw error;
    }
  },

  // Видалити імпортовану заявку
  delete: async (id) => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/tasks/imported/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ERROR] importedTasksAPI.delete - помилка:', error);
      throw error;
    }
  },

  // Схвалити імпортовану заявку (перемістити в основну базу)
  approve: async (id, taskData) => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/tasks/imported/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ taskData }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ERROR] importedTasksAPI.approve - помилка:', error);
      throw error;
    }
  }
};
