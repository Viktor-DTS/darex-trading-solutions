#!/usr/bin/env node

/**
 * Скрипт для тестування системи сповіщень
 * Використання: node test-notifications.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/config.env' });

// Підключаємо дебагер
const NotificationDebugger = require('./backend/notification-debugger');

async function testNotificationSystem() {
  try {
    console.log('🚀 Запуск тестування системи сповіщень...\n');
    
    // Підключення до MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dts-service';
    await mongoose.connect(mongoUri);
    console.log('✅ Підключено до MongoDB\n');
    
    // Створюємо екземпляр дебагера
    const debugger = new NotificationDebugger();
    
    // 1. Аналіз налаштувань користувачів
    console.log('📊 === КРОК 1: АНАЛІЗ НАЛАШТУВАНЬ КОРИСТУВАЧІВ ===');
    const userAnalysis = await debugger.analyzeUserSettings();
    
    if (!userAnalysis) {
      console.log('❌ Не вдалося проаналізувати налаштування користувачів');
      return;
    }
    
    console.log(`\n📈 Підсумок:`);
    console.log(`   Загальна кількість користувачів: ${userAnalysis.totalUsers}`);
    console.log(`   З Telegram Chat ID: ${userAnalysis.usersWithTelegram}`);
    console.log(`   Без Telegram Chat ID: ${userAnalysis.usersWithoutTelegram}`);
    
    // 2. Аналіз логів сповіщень
    console.log('\n📊 === КРОК 2: АНАЛІЗ ЛОГІВ СПОВІЩЕНЬ ===');
    const logAnalysis = await debugger.analyzeNotificationLogs(20);
    
    if (logAnalysis) {
      console.log(`\n📈 Підсумок логів:`);
      console.log(`   Загальна кількість логів: ${logAnalysis.totalLogs}`);
      console.log(`   Невдалих сповіщень: ${logAnalysis.failedLogs}`);
    }
    
    // 3. Симуляція різних типів сповіщень
    console.log('\n🧪 === КРОК 3: СИМУЛЯЦІЯ СПОВІЩЕНЬ ===');
    
    const testCases = [
      {
        type: 'new_requests',
        data: {
          task: {
            serviceRegion: 'Київський',
            requestNumber: 'TEST-001',
            createdBy: 'test_user',
            requestDesc: 'Тестова заявка',
            client: 'Тестовий клієнт'
          },
          authorLogin: 'test_user'
        }
      },
      {
        type: 'system_notifications',
        data: {
          message: 'Тестове системне повідомлення'
        }
      },
      {
        type: 'pending_approval',
        data: {
          task: {
            serviceRegion: 'Хмельницький',
            requestNumber: 'TEST-002',
            createdBy: 'test_user2'
          },
          authorLogin: 'test_user2'
        }
      }
    ];
    
    for (const testCase of testCases) {
      console.log(`\n🔍 Тестування: ${testCase.type}`);
      const result = await debugger.simulateNotification(testCase.type, testCase.data);
      
      if (result.success) {
        console.log(`   ✅ Успішно: ${result.filteredUsers} користувачів отримають сповіщення`);
        if (result.recipients && result.recipients.length > 0) {
          console.log(`   📱 Отримувачі: ${result.recipients.map(r => r.login).join(', ')}`);
        }
      } else {
        console.log(`   ❌ Помилка: ${result.reason || result.error}`);
      }
    }
    
    // 4. Тестування конкретного користувача
    console.log('\n🎯 === КРОК 4: ТЕСТУВАННЯ КОНКРЕТНОГО КОРИСТУВАЧА ===');
    
    // Знаходимо першого користувача з Telegram
    const User = mongoose.model('User');
    const userWithTelegram = await User.findOne({
      telegramChatId: { 
        $exists: true, 
        $ne: null, 
        $ne: '', 
        $ne: 'Chat ID' 
      }
    });
    
    if (userWithTelegram) {
      console.log(`\n🧪 Тестування користувача: ${userWithTelegram.login}`);
      const testResult = await debugger.testUserNotification(
        userWithTelegram.login, 
        '🧪 Тестове сповіщення з скрипта'
      );
      
      if (testResult.success) {
        console.log(`   ✅ Користувач готовий до отримання сповіщень`);
        console.log(`   📱 Chat ID: ${testResult.user.chatId}`);
        console.log(`   🌍 Регіон: ${testResult.user.region}`);
      } else {
        console.log(`   ❌ Проблема: ${testResult.reason || testResult.error}`);
      }
    } else {
      console.log('   ⚠️ Не знайдено користувачів з налаштованим Telegram');
    }
    
    // 5. Генерація повного звіту
    console.log('\n📋 === КРОК 5: ГЕНЕРАЦІЯ ПОВНОГО ЗВІТУ ===');
    const report = await debugger.generateSystemReport();
    
    if (report && report.recommendations.length > 0) {
      console.log('\n💡 Рекомендації для покращення:');
      report.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }
    
    console.log('\n✅ Тестування завершено!');
    
  } catch (error) {
    console.error('❌ Помилка під час тестування:', error);
  } finally {
    // Закриваємо з'єднання з MongoDB
    await mongoose.disconnect();
    console.log('\n🔌 Відключено від MongoDB');
  }
}

// Запускаємо тестування
if (require.main === module) {
  testNotificationSystem();
}

module.exports = { testNotificationSystem };
