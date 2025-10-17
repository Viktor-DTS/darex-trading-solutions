#!/usr/bin/env node

/**
 * Скрипт для пошуку всіх дублювань Chat ID в системі
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

// Схема користувача
const userSchema = new mongoose.Schema({
  login: String,
  password: String,
  role: String,
  name: String,
  region: String,
  columnsSettings: Object,
  id: Number,
  telegramChatId: String,
  lastActivity: { type: Date, default: Date.now },
  notificationSettings: {
    newRequests: { type: Boolean, default: false },
    pendingApproval: { type: Boolean, default: false },
    accountantApproval: { type: Boolean, default: false },
    approvedRequests: { type: Boolean, default: false },
    rejectedRequests: { type: Boolean, default: false },
    invoiceRequests: { type: Boolean, default: false },
    completedInvoices: { type: Boolean, default: false },
    systemNotifications: { type: Boolean, default: false }
  }
});

const User = mongoose.model('User', userSchema);

async function findDuplicateChatIds() {
  try {
    console.log('🔍 Пошук дублювань Chat ID в системі...\n');
    
    // Підключення до MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dts-service';
    await mongoose.connect(mongoUri);
    console.log('✅ Підключено до MongoDB\n');
    
    // Отримуємо всіх користувачів з Telegram Chat ID
    const usersWithTelegram = await User.find({
      telegramChatId: { 
        $exists: true, 
        $ne: null, 
        $ne: '', 
        $ne: 'Chat ID' 
      }
    }).sort({ telegramChatId: 1 });
    
    console.log(`📊 Загальна кількість користувачів з Telegram Chat ID: ${usersWithTelegram.length}\n`);
    
    // Групуємо користувачів по Chat ID
    const chatIdGroups = {};
    
    for (const user of usersWithTelegram) {
      const chatId = user.telegramChatId;
      if (!chatIdGroups[chatId]) {
        chatIdGroups[chatId] = [];
      }
      chatIdGroups[chatId].push(user);
    }
    
    // Знаходимо дублювання
    const duplicates = {};
    const uniqueChatIds = {};
    
    for (const [chatId, users] of Object.entries(chatIdGroups)) {
      if (users.length > 1) {
        duplicates[chatId] = users;
      } else {
        uniqueChatIds[chatId] = users[0];
      }
    }
    
    // Виводимо результати
    console.log('🚨 === ДУБЛЮВАННЯ CHAT ID ===');
    
    if (Object.keys(duplicates).length === 0) {
      console.log('✅ Дублювань Chat ID не знайдено!');
    } else {
      console.log(`❌ Знайдено ${Object.keys(duplicates).length} дублювань Chat ID:\n`);
      
      for (const [chatId, users] of Object.entries(duplicates)) {
        console.log(`📱 Chat ID: ${chatId}`);
        console.log(`   Кількість користувачів: ${users.length}`);
        
        for (const user of users) {
          console.log(`   👤 ${user.login} (${user.name}) - Роль: ${user.role} - Регіон: ${user.region}`);
          
          // Показуємо налаштування сповіщень
          if (user.notificationSettings) {
            const enabledNotifications = Object.entries(user.notificationSettings)
              .filter(([key, value]) => value === true)
              .map(([key]) => key);
            
            if (enabledNotifications.length > 0) {
              console.log(`      📋 Увімкнені сповіщення: ${enabledNotifications.join(', ')}`);
            } else {
              console.log(`      📋 Увімкнені сповіщення: немає`);
            }
          }
        }
        console.log('');
      }
    }
    
    // Статистика
    console.log('📊 === СТАТИСТИКА ===');
    console.log(`   Загальна кількість користувачів з Telegram: ${usersWithTelegram.length}`);
    console.log(`   Унікальних Chat ID: ${Object.keys(uniqueChatIds).length}`);
    console.log(`   Дублювань Chat ID: ${Object.keys(duplicates).length}`);
    console.log(`   Користувачів з дублюваннями: ${Object.values(duplicates).flat().length}`);
    
    // Проблемні Chat ID
    console.log('\n⚠️ === ПРОБЛЕМНІ CHAT ID ===');
    
    const problematicChatIds = [];
    
    for (const [chatId, users] of Object.entries(duplicates)) {
      const roles = users.map(u => u.role);
      const uniqueRoles = [...new Set(roles)];
      
      if (uniqueRoles.length > 1) {
        problematicChatIds.push({
          chatId,
          users,
          issue: 'Різні ролі користувачів'
        });
      }
      
      // Перевіряємо налаштування сповіщень
      const notificationSettings = users.map(u => u.notificationSettings);
      const hasDifferentSettings = notificationSettings.some((settings, index) => {
        if (index === 0) return false;
        return JSON.stringify(settings) !== JSON.stringify(notificationSettings[0]);
      });
      
      if (hasDifferentSettings) {
        problematicChatIds.push({
          chatId,
          users,
          issue: 'Різні налаштування сповіщень'
        });
      }
    }
    
    if (problematicChatIds.length > 0) {
      console.log(`❌ Знайдено ${problematicChatIds.length} проблемних Chat ID:\n`);
      
      for (const problem of problematicChatIds) {
        console.log(`📱 Chat ID: ${problem.chatId}`);
        console.log(`   Проблема: ${problem.issue}`);
        console.log(`   Користувачі:`);
        
        for (const user of problem.users) {
          console.log(`     👤 ${user.login} (${user.name}) - ${user.role}`);
        }
        console.log('');
      }
    } else {
      console.log('✅ Проблемних Chat ID не знайдено');
    }
    
    // Рекомендації
    console.log('💡 === РЕКОМЕНДАЦІЇ ===');
    
    if (Object.keys(duplicates).length > 0) {
      console.log('1. 🔧 Виправити дублювання Chat ID:');
      for (const [chatId, users] of Object.entries(duplicates)) {
        console.log(`   - Chat ID ${chatId}: ${users.map(u => u.login).join(', ')}`);
        console.log(`     Рекомендація: залишити один Chat ID, інші оновити`);
      }
      
      console.log('\n2. 📱 Перевірити правильність Chat ID:');
      console.log('   - Зв\'язатися з користувачами');
      console.log('   - Перевірити через @userinfobot в Telegram');
      console.log('   - Оновити неправильні Chat ID');
      
      console.log('\n3. 🧪 Протестувати після виправлення:');
      console.log('   - Використати панель дебагу сповіщень');
      console.log('   - Відправити тестові сповіщення');
      console.log('   - Перевірити доставку');
    } else {
      console.log('✅ Дублювань не знайдено - система налаштована правильно!');
    }
    
    // Детальна інформація про всіх користувачів
    console.log('\n📋 === ВСІ КОРИСТУВАЧІ З TELEGRAM ===');
    console.log('Chat ID | Логін | Ім\'я | Роль | Регіон | Налаштування');
    console.log('--------|-------|------|------|--------|-------------');
    
    for (const user of usersWithTelegram) {
      const enabledCount = user.notificationSettings ? 
        Object.values(user.notificationSettings).filter(Boolean).length : 0;
      
      console.log(`${user.telegramChatId} | ${user.login} | ${user.name} | ${user.role} | ${user.region || 'Н/Д'} | ${enabledCount} увімкнено`);
    }
    
  } catch (error) {
    console.error('❌ Помилка:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Відключено від MongoDB');
  }
}

// Запускаємо пошук
if (require.main === module) {
  findDuplicateChatIds();
}

module.exports = { findDuplicateChatIds };
