// Утиліта для виконання автентифікованих API запитів
import API_BASE_URL from '../config.js';
import { logUserAction, EVENT_ACTIONS, ENTITY_TYPES } from './eventLogAPI';

// Функція для отримання токена з localStorage
export function getAuthToken() {
  return localStorage.getItem('authToken');
}

// Функція для виконання автентифікованого fetch запиту
export async function authenticatedFetch(url, options = {}) {
  const token = getAuthToken();
  
  // Додаємо токен до заголовків, якщо він є
  const headers = {
    ...options.headers,
  };
  
  // Додаємо Content-Type тільки якщо це не FormData (браузер сам встановлює правильний Content-Type для FormData)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // Якщо токен прострочений або невірний, видаляємо його
  if (response.status === 401 || response.status === 403) {
    // Логуємо вихід перед видаленням токену
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      if (currentUserStr) {
        const currentUser = JSON.parse(currentUserStr);
        logUserAction(currentUser, EVENT_ACTIONS.LOGOUT, ENTITY_TYPES.SYSTEM, null, 
          `Вихід з системи: ${currentUser.name} (${currentUser.role})`, {
            reason: response.status === 401 ? 'token_expired' : 'access_denied',
            statusCode: response.status
          });
      }
    } catch (error) {
      console.error('[AUTH] Помилка логування виходу:', error);
    }
    // Видаляємо токен та інформацію про користувача
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    // Перенаправляємо на сторінку входу
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    }
  }
  
  return response;
}

// Експортуємо функцію для використання в інших компонентах
export default authenticatedFetch;

