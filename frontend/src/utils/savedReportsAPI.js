const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');

export const savedReportsAPI = {
  // Зберегти звіт
  async saveReport(reportData) {
    try {
      const response = await fetch(`${API_BASE_URL}/saved-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Помилка збереження звіту:', error);
      throw error;
    }
  },

  // Отримати всі збережені звіти користувача
  async getReports(userId) {
    try {
      const response = await fetch(`${API_BASE_URL}/saved-reports/${userId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання звітів:', error);
      throw error;
    }
  },

  // Видалити збережений звіт
  async deleteReport(reportId) {
    try {
      const response = await fetch(`${API_BASE_URL}/saved-reports/${reportId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Помилка видалення звіту:', error);
      throw error;
    }
  },
}; 