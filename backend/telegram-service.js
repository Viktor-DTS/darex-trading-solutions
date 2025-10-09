const mongoose = require('mongoose');

// Імпортуємо модель NotificationLog з основного файлу
const NotificationLog = mongoose.model('NotificationLog');

class TelegramNotificationService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  // Основний метод для відправки сповіщень
  async sendNotification(type, data) {
    try {
      console.log(`[TelegramService] sendNotification - тип: ${type}, дані:`, data);
      
      console.log(`[TelegramService] sendNotification - формуємо повідомлення для типу ${type}`);
      const message = this.formatNotificationMessage(type, data);
      console.log(`[TelegramService] sendNotification - сформоване повідомлення:`, message);
      
      console.log(`[TelegramService] sendNotification - отримуємо chatIds для типу ${type}`);
      const chatIds = await this.getChatIdsForNotification(type, data);
      console.log(`[TelegramService] sendNotification - отримано chatIds:`, chatIds);
      
      if (chatIds.length === 0) {
        console.log(`[TelegramService] sendNotification - немає chatIds для типу: ${type}`);
        return false;
      }
      
      let successCount = 0;
      for (const chatId of chatIds) {
        const success = await this.sendMessage(chatId, message);
        if (success) successCount++;
        
        // Логуємо сповіщення
        await NotificationLog.create({
          type,
          taskId: data.task?._id || data.task?.id || data.taskId,
          userId: data.authorLogin || data.user?.login || data.userId,
          message,
          telegramChatId: chatId,
          status: success ? 'sent' : 'failed'
        });
      }
      
      console.log(`[TelegramService] sendNotification - відправлено ${successCount}/${chatIds.length} сповіщень`);
      return successCount > 0;
      
    } catch (error) {
      console.error(`[TelegramService] sendNotification - помилка:`, error);
      return false;
    }
  }

  // Форматування повідомлень для різних типів сповіщень
  formatNotificationMessage(type, data) {
    const task = data.task || {};
    
    const baseMessage = `
📋 <b>ЗАЯВКА №${task.requestNumber || task.id || 'Н/Д'}</b>
📅 <b>Дата:</b> ${task.requestDate || 'Н/Д'}
🏢 <b>Клієнт:</b> ${task.client || 'Н/Д'}
📍 <b>Адреса:</b> ${task.address || 'Н/Д'}
🔧 <b>Обладнання:</b> ${task.equipment || 'Н/Д'}
    `;

    switch (type) {
      case 'new_requests':
        return baseMessage + '\n✅ <b>🆕 НОВА ЗАЯВКА СТВОРЕНА</b>\n\n💡 <b>Дія:</b> Необхідно розглянути та призначити виконавця';
      
      case 'pending_approval':
        return baseMessage + '\n🔔 <b>⚠️ ЗАЯВКА ВИКОНАНА ТА ПОТРЕБУЄ ЗАТВЕРДЖЕННЯ ЗАВ. СКЛАДА</b>\n\n💡 <b>Дія:</b> Необхідно розглянути та підтвердити заявку';
      
      case 'accountant_approval':
        return baseMessage + '\n🔔 <b>⚠️ ЗАЯВКА ВИКОНАНА ТА ПОТРЕБУЄ ЗАТВЕРДЖЕННЯ БУХГАЛТЕРА</b>\n\n💡 <b>Дія:</b> Необхідно розглянути та підтвердити заявку';
      
      case 'approved_requests':
        return baseMessage + '\n✅ <b>✅ ВАША ЗАЯВКА ЗАТВЕРДЖЕНА ТА НАЧИСЛЕНА ПРЕМІЯ ЗА ВИКОНАНУ ЗАЯВКУ</b>\n\n🎉 <b>Заявка готова до оплати</b>';
      
      case 'rejected_requests':
        return baseMessage + '\n❌ <b>❌ ВІДХИЛЕНО</b>\n\n⚠️ <b>Необхідно виправити зауваження</b>';
      
      case 'invoice_requested':
        return `📄 <b>Новий запит на рахунок</b>\n\n` +
               `🏢 <b>Компанія:</b> ${data.companyName || 'Н/Д'}\n` +
               `🏛️ <b>ЄДРПОУ:</b> ${data.edrpou || 'Н/Д'}\n` +
               `👤 <b>Запитувач:</b> ${data.requesterName || 'Н/Д'}\n` +
               `📋 <b>ID заявки:</b> ${data.taskId || 'Н/Д'}\n\n` +
               `⏳ <b>Очікує обробки бухгалтером</b>`;
      
      case 'invoice_completed':
        return `✅ <b>Рахунок готовий</b>\n\n` +
               `🏢 <b>Компанія:</b> ${data.companyName || 'Н/Д'}\n` +
               `📋 <b>ID заявки:</b> ${data.taskId || 'Н/Д'}\n` +
               `👤 <b>Для користувача:</b> ${data.requesterId || 'Н/Д'}\n\n` +
               `📥 <b>Файл рахунку завантажено</b>\n` +
               `💡 <b>Можете завантажити файл в системі</b>`;
      
      case 'system_notifications':
        return `🌸💕 <b>СИСТЕМНЕ ПОВІДОМЛЕННЯ</b> 💕🌸\n\n` +
               `🔔 <b>Повідомлення від адміністратора:</b>\n` +
               `${data.message || 'Н/Д'}\n\n` +
               `📅 <b>Час відправки:</b> ${new Date().toLocaleString('uk-UA')}\n\n` +
               `🌸💕 <b>ВАЖЛИВО!</b> 💕🌸`;
      
      default:
        return baseMessage + '\n📢 <b>📝 ОНОВЛЕННЯ СТАТУСУ</b>';
    }
  }

  // Отримання chatIds для відправки сповіщень з фільтрацією
  async getChatIdsForNotification(type, data) {
    try {
      console.log(`[TelegramService] getChatIdsForNotification - тип: ${type}`);
      
      // Отримуємо користувачів з увімкненими налаштуваннями
      const User = mongoose.model('User');
      const query = {
        telegramChatId: { 
          $exists: true, 
          $ne: null, 
          $ne: '', 
          $ne: 'Chat ID' 
        }
      };
      
      // Додаємо умову для конкретного типу сповіщень
      // Конвертуємо snake_case в camelCase
      const camelCaseType = type.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
      query[`notificationSettings.${camelCaseType}`] = true;
      
      console.log(`[TelegramService] getChatIdsForNotification - тип сповіщення: ${type}`);
      console.log(`[TelegramService] getChatIdsForNotification - camelCase тип: ${camelCaseType}`);
      console.log(`[TelegramService] getChatIdsForNotification - поле для пошуку: notificationSettings.${camelCaseType}`);
      console.log(`[TelegramService] getChatIdsForNotification - запит:`, JSON.stringify(query, null, 2));
      
      // Спочатку перевіримо всіх користувачів з telegramChatId
      const allUsersWithTelegram = await User.find({
        telegramChatId: { 
          $exists: true, 
          $ne: null, 
          $ne: '', 
          $ne: 'Chat ID' 
        }
      });
      console.log(`[TelegramService] getChatIdsForNotification - всі користувачі з Telegram:`, allUsersWithTelegram.map(u => ({
        login: u.login,
        name: u.name,
        telegramChatId: u.telegramChatId,
        hasNotificationSettings: !!u.notificationSettings,
        notificationSettings: u.notificationSettings
      })));
      
      const users = await User.find(query);
      
      console.log(`[TelegramService] getChatIdsForNotification - знайдено користувачів: ${users.length}`);
      console.log(`[TelegramService] getChatIdsForNotification - користувачі:`, users.map(u => ({
        login: u.login,
        name: u.name,
        telegramChatId: u.telegramChatId,
        notificationSettings: u.notificationSettings
      })));
      
      if (users.length === 0) {
        return [];
      }
      
      // Фільтруємо по регіонах (крім системних сповіщень)
      let filteredUsers = users;
      
      if (type !== 'system_notifications' && data.task) {
        filteredUsers = users.filter(user => {
          // Якщо регіон користувача "Україна" - отримує всі сповіщення
          if (user.region === 'Україна') {
            return true;
          }
          
          // Перевіряємо співпадіння регіонів
          const userRegions = user.region ? user.region.split(',').map(r => r.trim()) : [];
          const taskRegion = data.task.serviceRegion;
          
          if (!taskRegion) {
            return false;
          }
          
          return userRegions.some(userRegion => 
            userRegion.toLowerCase().includes(taskRegion.toLowerCase()) || 
            taskRegion.toLowerCase().includes(userRegion.toLowerCase())
          );
        });
      }
      
      // Виключаємо автора дії
      if (data.authorLogin) {
        filteredUsers = filteredUsers.filter(user => user.login !== data.authorLogin);
      }
      
      console.log(`[TelegramService] getChatIdsForNotification - після фільтрації: ${filteredUsers.length} користувачів`);
      
      return filteredUsers.map(user => user.telegramChatId).filter(chatId => chatId);
      
    } catch (error) {
      console.error(`[TelegramService] getChatIdsForNotification - помилка:`, error);
      return [];
    }
  }

  // Відправка повідомлення в Telegram
  async sendMessage(chatId, message) {
    if (!this.botToken || !this.baseUrl) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      
      const result = await response.json();
      return result.ok;
      
    } catch (error) {
      console.error(`[TelegramService] sendMessage - помилка:`, error);
      return false;
    }
  }

  // Метод для тестування повідомлень
  async sendTestMessage(chatId, message) {
    try {
      console.log(`[TelegramService] sendTestMessage - відправка тестового повідомлення до ${chatId}`);
      
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `🧪 Тестове повідомлення:\n\n${message}\n\n✅ Сповіщення працюють правильно!`
        })
      });
      
      const result = await response.json();
      console.log(`[TelegramService] sendTestMessage - результат:`, result);
      
      return result.ok;
      
    } catch (error) {
      console.error(`[TelegramService] sendTestMessage - помилка:`, error);
      return false;
    }
  }
}

module.exports = TelegramNotificationService;