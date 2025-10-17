const mongoose = require('mongoose');

class NotificationDebugger {
  constructor() {
    this.User = mongoose.model('User');
    this.NotificationLog = mongoose.model('NotificationLog');
  }

  // Детальний аналіз користувачів та їх налаштувань
  async analyzeUserSettings() {
    try {
      console.log('\n🔍 === АНАЛІЗ НАЛАШТУВАНЬ КОРИСТУВАЧІВ ===');
      
      const users = await this.User.find({});
      console.log(`📊 Загальна кількість користувачів: ${users.length}`);
      
      const usersWithTelegram = users.filter(u => 
        u.telegramChatId && 
        u.telegramChatId.trim() && 
        u.telegramChatId !== 'Chat ID'
      );
      console.log(`📱 Користувачі з Telegram Chat ID: ${usersWithTelegram.length}`);
      
      const usersWithoutTelegram = users.filter(u => 
        !u.telegramChatId || 
        !u.telegramChatId.trim() || 
        u.telegramChatId === 'Chat ID'
      );
      console.log(`❌ Користувачі без Telegram Chat ID: ${usersWithoutTelegram.length}`);
      
      // Аналіз налаштувань сповіщень
      const notificationTypes = [
        'newRequests', 'pendingApproval', 'accountantApproval', 
        'approvedRequests', 'rejectedRequests', 'invoiceRequests', 
        'completedInvoices', 'systemNotifications'
      ];
      
      console.log('\n📋 === НАЛАШТУВАННЯ СПОВІЩЕНЬ ===');
      for (const type of notificationTypes) {
        const usersWithType = usersWithTelegram.filter(u => 
          u.notificationSettings && u.notificationSettings[type] === true
        );
        console.log(`${type}: ${usersWithType.length} користувачів`);
        
        if (usersWithType.length > 0) {
          console.log(`  └─ Користувачі: ${usersWithType.map(u => u.login).join(', ')}`);
        }
      }
      
      // Детальна інформація про кожного користувача
      console.log('\n👥 === ДЕТАЛЬНА ІНФОРМАЦІЯ ПРО КОРИСТУВАЧІВ ===');
      for (const user of usersWithTelegram) {
        console.log(`\n👤 ${user.login} (${user.name})`);
        console.log(`   Роль: ${user.role}`);
        console.log(`   Регіон: ${user.region || 'Не вказано'}`);
        console.log(`   Telegram Chat ID: ${user.telegramChatId}`);
        console.log(`   Налаштування сповіщень:`);
        
        if (user.notificationSettings) {
          for (const [key, value] of Object.entries(user.notificationSettings)) {
            console.log(`     ${key}: ${value ? '✅' : '❌'}`);
          }
        } else {
          console.log(`     ❌ Налаштування відсутні`);
        }
      }
      
      // Користувачі без налаштувань
      if (usersWithoutTelegram.length > 0) {
        console.log('\n❌ === КОРИСТУВАЧІ БЕЗ TELEGRAM ===');
        for (const user of usersWithoutTelegram) {
          console.log(`👤 ${user.login} (${user.name}) - ${user.role} - ${user.region || 'Без регіону'}`);
        }
      }
      
      return {
        totalUsers: users.length,
        usersWithTelegram: usersWithTelegram.length,
        usersWithoutTelegram: usersWithoutTelegram.length,
        notificationSettings: this.getNotificationStats(usersWithTelegram, notificationTypes)
      };
      
    } catch (error) {
      console.error('❌ Помилка аналізу налаштувань користувачів:', error);
      return null;
    }
  }

  // Статистика налаштувань сповіщень
  getNotificationStats(users, notificationTypes) {
    const stats = {};
    for (const type of notificationTypes) {
      stats[type] = users.filter(u => 
        u.notificationSettings && u.notificationSettings[type] === true
      ).length;
    }
    return stats;
  }

  // Симуляція відправки сповіщення з детальним логуванням
  async simulateNotification(type, data) {
    try {
      console.log(`\n🧪 === СИМУЛЯЦІЯ СПОВІЩЕННЯ: ${type} ===`);
      console.log('📋 Дані:', JSON.stringify(data, null, 2));
      
      // Отримуємо користувачів з увімкненими налаштуваннями
      const query = {
        telegramChatId: { 
          $exists: true, 
          $ne: null, 
          $ne: '', 
          $ne: 'Chat ID' 
        }
      };
      
      // Додаємо умову для конкретного типу сповіщень
      let notificationKey;
      switch (type) {
        case 'system_notifications':
          notificationKey = 'systemNotifications';
          break;
        case 'new_requests':
          notificationKey = 'newRequests';
          break;
        case 'pending_approval':
          notificationKey = 'pendingApproval';
          break;
        case 'accountant_approval':
          notificationKey = 'accountantApproval';
          break;
        case 'approved_requests':
          notificationKey = 'approvedRequests';
          break;
        case 'rejected_requests':
          notificationKey = 'rejectedRequests';
          break;
        case 'invoice_requested':
          notificationKey = 'invoiceRequests';
          break;
        case 'invoice_completed':
          notificationKey = 'completedInvoices';
          break;
        default:
          notificationKey = type;
      }
      
      query[`notificationSettings.${notificationKey}`] = true;
      
      console.log(`🔍 Пошук користувачів з увімкненим ${notificationKey}`);
      console.log('📝 Запит:', JSON.stringify(query, null, 2));
      
      const users = await this.User.find(query);
      console.log(`👥 Знайдено користувачів: ${users.length}`);
      
      if (users.length === 0) {
        console.log('❌ Не знайдено користувачів для відправки сповіщення');
        return { success: false, reason: 'No users found' };
      }
      
      // Фільтруємо по регіонах (крім системних сповіщень)
      let filteredUsers = users;
      
      if (type !== 'system_notifications' && data.task) {
        console.log(`🌍 Фільтрація по регіонах. Регіон заявки: ${data.task.serviceRegion}`);
        
        filteredUsers = users.filter(user => {
          // Якщо регіон користувача "Україна" - отримує всі сповіщення
          if (user.region === 'Україна') {
            console.log(`  ✅ ${user.login} - регіон "Україна", отримує всі сповіщення`);
            return true;
          }
          
          // Перевіряємо співпадіння регіонів
          const userRegions = user.region ? user.region.split(',').map(r => r.trim()) : [];
          const taskRegion = data.task.serviceRegion;
          
          if (!taskRegion) {
            console.log(`  ❌ ${user.login} - немає регіону заявки`);
            return false;
          }
          
          const matches = userRegions.some(userRegion => 
            userRegion.toLowerCase().includes(taskRegion.toLowerCase()) || 
            taskRegion.toLowerCase().includes(userRegion.toLowerCase())
          );
          
          console.log(`  ${matches ? '✅' : '❌'} ${user.login} - регіони користувача: [${userRegions.join(', ')}], регіон заявки: ${taskRegion}`);
          return matches;
        });
      }
      
      // Виключаємо автора дії
      if (data.authorLogin) {
        const beforeExclude = filteredUsers.length;
        filteredUsers = filteredUsers.filter(user => user.login !== data.authorLogin);
        console.log(`👤 Виключено автора ${data.authorLogin}: ${beforeExclude} → ${filteredUsers.length} користувачів`);
      }
      
      console.log(`📤 Підсумок: буде відправлено ${filteredUsers.length} сповіщень`);
      
      // Детальна інформація про кожного отримувача
      for (const user of filteredUsers) {
        console.log(`  📱 ${user.login} (${user.name}) - Chat ID: ${user.telegramChatId} - Регіон: ${user.region}`);
      }
      
      return {
        success: true,
        totalUsers: users.length,
        filteredUsers: filteredUsers.length,
        recipients: filteredUsers.map(u => ({
          login: u.login,
          name: u.name,
          chatId: u.telegramChatId,
          region: u.region
        }))
      };
      
    } catch (error) {
      console.error('❌ Помилка симуляції сповіщення:', error);
      return { success: false, error: error.message };
    }
  }

  // Аналіз логів сповіщень
  async analyzeNotificationLogs(limit = 50) {
    try {
      console.log(`\n📊 === АНАЛІЗ ЛОГІВ СПОВІЩЕНЬ (останні ${limit}) ===`);
      
      const logs = await this.NotificationLog.find({})
        .sort({ sentAt: -1 })
        .limit(limit);
      
      console.log(`📋 Загальна кількість логів: ${logs.length}`);
      
      // Статистика по статусах
      const statusStats = {};
      const typeStats = {};
      
      for (const log of logs) {
        statusStats[log.status] = (statusStats[log.status] || 0) + 1;
        typeStats[log.type] = (typeStats[log.type] || 0) + 1;
      }
      
      console.log('\n📈 Статистика по статусах:');
      for (const [status, count] of Object.entries(statusStats)) {
        console.log(`  ${status}: ${count}`);
      }
      
      console.log('\n📈 Статистика по типах:');
      for (const [type, count] of Object.entries(typeStats)) {
        console.log(`  ${type}: ${count}`);
      }
      
      // Останні помилки
      const failedLogs = logs.filter(log => log.status === 'failed');
      if (failedLogs.length > 0) {
        console.log(`\n❌ Останні помилки (${failedLogs.length}):`);
        for (const log of failedLogs.slice(0, 5)) {
          console.log(`  ${log.sentAt.toISOString()} - ${log.type} - ${log.telegramChatId} - ${log.error || 'Невідома помилка'}`);
        }
      }
      
      return {
        totalLogs: logs.length,
        statusStats,
        typeStats,
        failedLogs: failedLogs.length
      };
      
    } catch (error) {
      console.error('❌ Помилка аналізу логів:', error);
      return null;
    }
  }

  // Тестування відправки сповіщення конкретному користувачу
  async testUserNotification(userLogin, message = '🧪 Тестове сповіщення') {
    try {
      console.log(`\n🧪 === ТЕСТ СПОВІЩЕННЯ ДЛЯ ${userLogin} ===`);
      
      const user = await this.User.findOne({ login: userLogin });
      if (!user) {
        console.log(`❌ Користувач ${userLogin} не знайдений`);
        return { success: false, reason: 'User not found' };
      }
      
      if (!user.telegramChatId || user.telegramChatId === 'Chat ID') {
        console.log(`❌ У користувача ${userLogin} не налаштований Telegram Chat ID`);
        return { success: false, reason: 'No Telegram Chat ID' };
      }
      
      console.log(`👤 Користувач: ${user.name} (${user.role})`);
      console.log(`📱 Chat ID: ${user.telegramChatId}`);
      console.log(`🌍 Регіон: ${user.region || 'Не вказано'}`);
      console.log(`📋 Налаштування сповіщень:`, user.notificationSettings);
      
      // Тут можна додати реальну відправку через Telegram API
      console.log(`📤 Буде відправлено повідомлення: "${message}"`);
      
      return {
        success: true,
        user: {
          login: user.login,
          name: user.name,
          chatId: user.telegramChatId,
          region: user.region,
          notificationSettings: user.notificationSettings
        }
      };
      
    } catch (error) {
      console.error('❌ Помилка тестування сповіщення:', error);
      return { success: false, error: error.message };
    }
  }

  // Генерація звіту про стан системи сповіщень
  async generateSystemReport() {
    try {
      console.log('\n📊 === ЗВІТ ПРО СТАН СИСТЕМИ СПОВІЩЕНЬ ===');
      
      const userAnalysis = await this.analyzeUserSettings();
      const logAnalysis = await this.analyzeNotificationLogs();
      
      const report = {
        timestamp: new Date().toISOString(),
        userAnalysis,
        logAnalysis,
        recommendations: this.generateRecommendations(userAnalysis, logAnalysis)
      };
      
      console.log('\n💡 === РЕКОМЕНДАЦІЇ ===');
      for (const rec of report.recommendations) {
        console.log(`  • ${rec}`);
      }
      
      return report;
      
    } catch (error) {
      console.error('❌ Помилка генерації звіту:', error);
      return null;
    }
  }

  // Генерація рекомендацій
  generateRecommendations(userAnalysis, logAnalysis) {
    const recommendations = [];
    
    if (!userAnalysis) return recommendations;
    
    if (userAnalysis.usersWithoutTelegram > 0) {
      recommendations.push(`Налаштувати Telegram Chat ID для ${userAnalysis.usersWithoutTelegram} користувачів`);
    }
    
    if (userAnalysis.notificationSettings) {
      const settings = userAnalysis.notificationSettings;
      for (const [type, count] of Object.entries(settings)) {
        if (count === 0) {
          recommendations.push(`Жоден користувач не підписаний на сповіщення типу "${type}"`);
        }
      }
    }
    
    if (logAnalysis && logAnalysis.failedLogs > 0) {
      recommendations.push(`Перевірити ${logAnalysis.failedLogs} невдалих сповіщень в логах`);
    }
    
    return recommendations;
  }
}

module.exports = NotificationDebugger;
