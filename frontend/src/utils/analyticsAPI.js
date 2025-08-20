const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');

export const analyticsAPI = {
  // Отримати аналітику за період
  async getAnalytics(filters = {}) {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });

      const response = await fetch(`${API_BASE_URL}/analytics?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання аналітики:', error);
      throw error;
    }
  },

  // Отримати повну аналітику з доходами та прибутком
  async getFullAnalytics(filters = {}) {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });

      const response = await fetch(`${API_BASE_URL}/analytics/full?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання повної аналітики:', error);
      throw error;
    }
  },

  // Зберегти аналітику
  async saveAnalytics(analyticsData) {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(analyticsData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Помилка збереження аналітики:', error);
      throw error;
    }
  },

  // Копіювати витрати з попереднього місяця
  async copyPreviousMonth(copyData) {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/copy-previous`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(copyData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Помилка копіювання витрат:', error);
      throw error;
    }
  },

  // Отримати дохід за період
  async getRevenue(filters = {}) {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });

      const response = await fetch(`${API_BASE_URL}/analytics/revenue?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання доходу:', error);
      throw error;
    }
  },
};

// Константи для статей витрат
export const EXPENSE_CATEGORIES = {
  salary: { label: 'Зарплата', color: '#FF6384' },
  fuel: { label: 'Паливо', color: '#36A2EB' },
  transport: { label: 'Транспорт', color: '#FFCE56' },
  materials: { label: 'Матеріали', color: '#4BC0C0' },
  equipment: { label: 'Обладнання', color: '#9966FF' },
  office: { label: 'Офісні витрати', color: '#FF9F40' },
  marketing: { label: 'Маркетинг', color: '#FF6384' },
  other: { label: 'Інші витрати', color: '#C9CBCF' }
};

// Утилітні функції
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    minimumFractionDigits: 2
  }).format(amount || 0);
};

export const formatPercent = (value) => {
  return `${(value || 0).toFixed(2)}%`;
};

export const getMonthName = (month) => {
  const months = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
  ];
  return months[month - 1] || '';
}; 