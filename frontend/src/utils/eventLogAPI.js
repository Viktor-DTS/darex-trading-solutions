const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
export const eventLogAPI = {
  // Додати подію до журналу
  async logEvent(eventData) {
    try {
      const response = await fetch(`${API_BASE_URL}/event-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка збереження події:', error);
      // Не кидаємо помилку, щоб не порушувати роботу основного функціоналу
    }
  },
  // Отримати журнал подій з фільтрами
  async getEvents(filters = {}) {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });
      const response = await fetch(`${API_BASE_URL}/event-log?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка отримання журналу подій:', error);
      throw error;
    }
  },
  // Очистити старий журнал
  async cleanupOldEvents() {
    try {
      const response = await fetch(`${API_BASE_URL}/event-log/cleanup`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Помилка очищення журналу:', error);
      throw error;
    }
  },
};
// Утилітні функції для логування подій
export const logUserAction = (user, action, entityType, entityId, description, details = {}) => {
  if (!user) return;
  eventLogAPI.logEvent({
    userId: user.login,
    userName: user.name,
    userRole: user.role,
    action,
    entityType,
    entityId,
    description,
    details
  });
};
// Константи для типів дій
export const EVENT_ACTIONS = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW: 'view',
  EXPORT: 'export',
  IMPORT: 'import',
  APPROVE: 'approve',
  REJECT: 'reject',
  SAVE_REPORT: 'save_report',
  LOAD_REPORT: 'load_report',
  DELETE_REPORT: 'delete_report'
};
// Константи для типів сутностей
export const ENTITY_TYPES = {
  TASK: 'task',
  USER: 'user',
  REPORT: 'report',
  SYSTEM: 'system'
}; 