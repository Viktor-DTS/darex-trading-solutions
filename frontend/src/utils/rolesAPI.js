import API_BASE_URL from '../config.js';
import authenticatedFetch from './api.js';

export const rolesAPI = {
  // Отримати всі ролі
  async getAll() {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/roles`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const rolesData = await response.json();
      // Трансформуємо з формату {name} у формат {value, label} для select
      return rolesData.map(role => ({
        value: role.name,
        label: role.name
      }));
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
      // Трансформуємо з формату {value, label} у формат {name} для бекенду
      const rolesToSave = roles.map(role => ({ name: role.value }));
      const response = await authenticatedFetch(`${API_BASE_URL}/roles`, {
        method: 'POST',
        body: JSON.stringify(rolesToSave),
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