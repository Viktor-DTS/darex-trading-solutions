import API_BASE_URL from '../config.js';

export const accessRulesAPI = {
  // Отримати всі правила доступу
  async getAll() {
    try {
      const response = await fetch(`${API_BASE_URL}/accessRules`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання правил доступу:', error);
      return {};
    }
  },

  // Зберегти правила доступу
  async save(accessRules) {
    try {
      const response = await fetch(`${API_BASE_URL}/accessRules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(accessRules),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Помилка збереження правил доступу:', error);
      return false;
    }
  },

  // Отримати правила доступу для конкретної ролі
  async getForRole(role) {
    try {
      const allRules = await this.getAll();
      return allRules[role] || {};
    } catch (error) {
      console.error('Помилка отримання правил доступу для ролі:', error);
      return {};
    }
  },

  // Оновити правила доступу для конкретної ролі
  async updateForRole(role, rules) {
    try {
      const allRules = await this.getAll();
      allRules[role] = rules;
      return await this.save(allRules);
    } catch (error) {
      console.error('Помилка оновлення правил доступу для ролі:', error);
      return false;
    }
  }
}; 