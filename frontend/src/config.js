// Конфігурація API URL
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://darex-trading-solutions-f.onrender.com/api'  // URL вашого Render API
  : 'http://localhost:3001/api';  // Локальний розробка

export default API_BASE_URL; 