import API_BASE_URL from '../config.js';
import authenticatedFetch from './api.js';

export const activityAPI = {
  // Оновити активність користувача на сервері
  async updateActivity(login) {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/users/activity`, {
        method: 'POST',
        body: JSON.stringify({ login }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка оновлення активності:', error);
      return null;
    }
  },
  // Отримати список активних користувачів з сервера
  async getActiveUsers() {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/active-users`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання активних користувачів:', error);
      return [];
    }
  }
};
