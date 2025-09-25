// Конфігурація API URL
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://darex-trading-solutions-f.onrender.com/api'
  : 'http://localhost:3001/api';
export default API_BASE_URL; 