// Конфігурація API URL
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001/api'
  : 'https://darex-trading-solutions.onrender.com/api';
export default API_BASE_URL; 