import API_BASE_URL from '../config.js';
import { authenticatedFetch } from './api.js';

export const backupAPI = {
  // Отримати всі бекапи користувача
  async getAll(userId) {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/backups?userId=${userId}`);
      if (!res.ok) {
        throw new Error('Помилка завантаження бекапів');
      }
      return await res.json();
    } catch (error) {
      console.error('[ERROR] backupAPI.getAll:', error);
      throw error;
    }
  },
  // Створити новий бекап
  async create(backupData) {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/backups`, {
        method: 'POST',
        body: JSON.stringify(backupData)
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Помилка створення бекапу: ${errorText}`);
      }
      return await res.json();
    } catch (error) {
      console.error('[ERROR] backupAPI.create:', error);
      throw error;
    }
  },
  // Видалити бекап
  async delete(backupId, userId) {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/backups/${backupId}?userId=${userId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Помилка видалення бекапу: ${errorText}`);
      }
      return await res.json();
    } catch (error) {
      console.error('[ERROR] backupAPI.delete:', error);
      throw error;
    }
  },
  // Отримати конкретний бекап
  async getById(backupId, userId) {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/backups/${backupId}?userId=${userId}`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Помилка завантаження бекапу: ${errorText}`);
      }
      return await res.json();
    } catch (error) {
      console.error('[ERROR] backupAPI.getById:', error);
      throw error;
    }
  }
};
