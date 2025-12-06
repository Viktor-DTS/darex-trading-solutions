// Автоматичне визначення URL для production (Render) або development (localhost)
const getApiUrl = () => {
  // Якщо встановлено через environment variable - використовуємо його
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Якщо працюємо на Render (production) - використовуємо Render backend URL
  if (window.location.hostname.includes('onrender.com') || import.meta.env.PROD) {
    return 'https://darex-trading-solutions.onrender.com/api';
  }
  
  // Для локальної розробки
  return 'http://localhost:3001/api';
};

export const API_BASE_URL = getApiUrl();

export default API_BASE_URL;
