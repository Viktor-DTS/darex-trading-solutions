// API для оптимізованого завантаження всіх даних панелі бухгалтера одним запитом
import API_BASE_URL from '../config.js';

export const accountantDataAPI = {
  // Завантажити всі необхідні дані для панелі бухгалтера одним запитом
  async getAllAccountantData(user, region) {
    try {
      console.log('[accountantDataAPI] 🚀 Fetching all accountant data in single request...');
      
      const response = await fetch(`${API_BASE_URL}/accountant/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userLogin: user.login, 
          region: region || user.region 
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ERROR] accountantDataAPI.getAllAccountantData - помилка сервера:', errorText);
        throw new Error('Помилка завантаження даних панелі бухгалтера');
      }

      const data = await response.json();
      console.log('[accountantDataAPI] ✅ All data fetched successfully:', {
        tasksCount: Object.keys(data.tasks || {}).reduce((total, key) => total + (data.tasks[key] || []).length, 0),
        hasColumnSettings: !!data.columnSettings,
        hasInvoiceColumnSettings: !!data.invoiceColumnSettings,
        hasAccessRules: !!data.accessRules,
        hasRoles: !!data.roles
      });

      return data;
    } catch (error) {
      console.error('[ERROR] accountantDataAPI.getAllAccountantData - виняток:', error);
      throw error;
    }
  },

  // Завантажити дані для конкретної вкладки (fallback метод)
  async getTabData(tab, region) {
    try {
      let url = `${API_BASE_URL}/tasks/filter?status=${encodeURIComponent(tab)}`;
      if (region && region !== 'Україна') {
        url += `&region=${encodeURIComponent(region)}`;
      }
      
      console.log(`[accountantDataAPI] Fetching data for tab: ${tab}, region: ${region}`);
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] accountantDataAPI.getTabData - помилка сервера:', errorText);
        throw new Error('Помилка завантаження даних вкладки');
      }
      const data = await res.json();
      console.log(`[accountantDataAPI] Fetched ${data.length} tasks for tab: ${tab}`);
      return data;
    } catch (error) {
      console.error('[ERROR] accountantDataAPI.getTabData - виняток:', error);
      throw error;
    }
  }
};
