// Утиліта для роботи з налаштуваннями колонок через API
const API_BASE_URL = 'http://localhost:3001/api';

export const columnsSettingsAPI = {
  // Завантажити налаштування колонок для користувача та області
  async loadSettings(userLogin, area) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userLogin}/columns-settings/${area}`);
      if (response.ok) {
        const settings = await response.json();
        return settings;
      } else {
        console.warn('Налаштування не знайдено, використовуємо стандартні');
        return { visible: [], order: [] };
      }
    } catch (error) {
      console.error('Помилка завантаження налаштувань з сервера:', error);
      return { visible: [], order: [] };
    }
  },

  // Зберегти налаштування колонок для користувача та області
  async saveSettings(userLogin, area, visible, order) {
    console.log('[DEBUG] API saveSettings викликано з параметрами:', { userLogin, area, visible, order });
    try {
      const requestBody = { area, visible, order };
      console.log('[DEBUG] Відправляємо запит на:', `${API_BASE_URL}/users/${userLogin}/columns-settings`);
      console.log('[DEBUG] Тіло запиту:', requestBody);
      
      const response = await fetch(`${API_BASE_URL}/users/${userLogin}/columns-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      console.log('[DEBUG] Отримано відповідь:', response.status, response.statusText);
      
      if (response.ok) {
        const result = await response.json();
        console.log('[DEBUG] Результат збереження:', result);
        return result.success;
      } else {
        const errorText = await response.text();
        console.error('[DEBUG] Помилка збереження налаштувань:', response.status, response.statusText, errorText);
        return false;
      }
    } catch (error) {
      console.error('[DEBUG] Помилка збереження налаштувань на сервері:', error);
      return false;
    }
  },

  // Отримати всіх користувачів
  async getAllUsers() {
    try {
      const response = await fetch(`${API_BASE_URL}/users`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Помилка отримання користувачів:', error);
    }
    return [];
  },

  // Отримати конкретного користувача
  async getUser(userLogin) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userLogin}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Помилка отримання користувача:', error);
    }
    return null;
  },

  // Зберегти/оновити користувача
  async saveUser(userData) {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.success;
      }
    } catch (error) {
      console.error('Помилка збереження користувача:', error);
    }
    return false;
  },

  // Видалити користувача
  async deleteUser(userLogin) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userLogin}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.success;
      }
    } catch (error) {
      console.error('Помилка видалення користувача:', error);
    }
    return false;
  }
}; 