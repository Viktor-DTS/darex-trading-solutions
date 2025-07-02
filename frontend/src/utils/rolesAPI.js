import API_BASE_URL from '../config.js';

export const rolesAPI = {
  // Отримати всі ролі
  async getAll() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/roles`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання ролей:', error);
      return [
        { value: 'admin', label: 'Адміністратор' },
        { value: 'service', label: 'Сервісна служба' },
        { value: 'operator', label: 'Оператор' },
        { value: 'warehouse', label: 'Зав. склад' },
        { value: 'accountant', label: 'Бухгалтер' },
        { value: 'regional', label: 'Регіональний керівник' },
      ];
    }
  },

  // Зберегти ролі
  async save(roles) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(roles),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Помилка збереження ролей:', error);
      return false;
    }
  }
}; 