const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions-f.onrender.com/api');

export const importedTasksAPI = {
  // Отримати всі імпортовані заявки
  getAll: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/imported`);
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
      const response = await fetch(`${API_BASE_URL}/tasks/imported`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      const response = await fetch(`${API_BASE_URL}/tasks/imported/${id}`, {
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
      const response = await fetch(`${API_BASE_URL}/tasks/imported/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
