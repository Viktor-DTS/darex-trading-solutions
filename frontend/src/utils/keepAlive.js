import API_BASE_URL from '../config.js';

class KeepAliveService {
  constructor() {
    this.interval = null;
    this.isActive = false;
    this.intervalMs = 25000; // 25 секунд (трохи менше ніж 30 секунд на сервері)
  }

  start() {
    if (this.isActive) {
      console.log('KeepAlive вже активний');
      return;
    }

    console.log('Запуск KeepAlive сервісу...');
    this.isActive = true;
    
    // Відправляємо перший запит одразу
    this.sendKeepAlive();
    
    // Встановлюємо інтервал
    this.interval = setInterval(() => {
      this.sendKeepAlive();
    }, this.intervalMs);
  }

  stop() {
    if (!this.isActive) {
      return;
    }

    console.log('Зупинка KeepAlive сервісу...');
    this.isActive = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async sendKeepAlive() {
    try {
      const response = await fetch(`${API_BASE_URL}/ping`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('KeepAlive успішний:', data.mongodb.connected ? 'MongoDB підключена' : 'MongoDB відключена');
        
        // Якщо MongoDB відключена, спробуємо перепідключитися
        if (!data.mongodb.connected) {
          console.warn('MongoDB відключена, спроба перепідключення...');
          // Можна додати додаткову логіку для перепідключення
        }
      } else {
        console.warn('KeepAlive запит невдалий:', response.status);
      }
    } catch (error) {
      console.error('Помилка KeepAlive запиту:', error);
    }
  }

  // Метод для зміни інтервалу
  setInterval(ms) {
    this.intervalMs = ms;
    if (this.isActive) {
      this.stop();
      this.start();
    }
  }
}

// Створюємо глобальний екземпляр
const keepAliveService = new KeepAliveService();

export default keepAliveService; 