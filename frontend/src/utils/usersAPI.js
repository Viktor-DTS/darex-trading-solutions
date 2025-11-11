import API_BASE_URL from '../config.js';
import authenticatedFetch from './api.js';

export const usersAPI = {
  // Отримати всіх користувачів
  async getAll() {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/users`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const users = await response.json();
      return users;
    } catch (error) {
      console.error('Помилка отримання користувачів:', error);
      return [];
    }
  },
  // Отримати користувача по логіну
  // Це публічний endpoint для перевірки користувача при вході
  async getByLogin(login) {
    try {
      // Використовуємо звичайний fetch, оскільки це публічний endpoint
      const response = await fetch(`${API_BASE_URL}/users/${login}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання користувача:', error);
      return null;
    }
  },
  // Створити користувача
  async create(userData) {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        body: JSON.stringify(userData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка створення користувача:', error);
      return null;
    }
  },
  // Видалити користувача
  async delete(login) {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/users/${login}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка видалення користувача:', error);
      return false;
    }
  }
};
