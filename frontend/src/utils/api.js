// Утиліта для виконання автентифікованих API запитів
import API_BASE_URL from '../config.js';

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
    localStorage.removeItem('authToken');
    // Перенаправляємо на сторінку входу
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    }
  }
  
  return response;
}

// Експортуємо функцію для використання в інших компонентах
export default authenticatedFetch;

