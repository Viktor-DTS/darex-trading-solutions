#!/usr/bin/env node

/**
 * Простий скрипт для перевірки Chat ID оператора
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

async function checkOperator() {
  try {
    console.log('🔍 Перевірка Chat ID оператора...\n');
    
    // Підключення до MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dts-service';
    await mongoose.connect(mongoUri);
    console.log('✅ Підключено до MongoDB\n');
    
    // Знаходимо оператора
    const operator = await User.findOne({ login: 'operator' });
    
    if (!operator) {
      console.log('❌ Користувач "operator" не знайдений');
      return;
    }
    
    console.log('👤 Інформація про оператора:');
    console.log(`   Логін: ${operator.login}`);
    console.log(`   Ім'я: ${operator.name}`);
    console.log(`   Роль: ${operator.role}`);
    console.log(`   Регіон: ${operator.region}`);
    console.log(`   Telegram Chat ID: ${operator.telegramChatId}`);
    console.log(`   ID: ${operator.id}`);
    
    console.log('\n📋 Налаштування сповіщень:');
    if (operator.notificationSettings) {
      for (const [key, value] of Object.entries(operator.notificationSettings)) {
        console.log(`   ${key}: ${value ? '✅' : '❌'}`);
      }
    } else {
      console.log('   ❌ Налаштування відсутні');
    }
    
    // Перевіряємо всіх користувачів з роллю operator
    console.log('\n🔍 Всі користувачі з роллю "operator":');
    const allOperators = await User.find({ role: 'operator' });
    
    for (const op of allOperators) {
      console.log(`   ${op.login} (${op.name}) - Chat ID: ${op.telegramChatId}`);
    }
    
    // Перевіряємо всіх користувачів з Chat ID що містить 1190497
    console.log('\n🔍 Користувачі з Chat ID що містить "1190497":');
    const usersWithSimilarChatId = await User.find({
      telegramChatId: { $regex: /1190497/ }
    });
    
    for (const user of usersWithSimilarChatId) {
      console.log(`   ${user.login} (${user.name}) - Chat ID: ${user.telegramChatId} - Роль: ${user.role}`);
    }
    
  } catch (error) {
    console.error('❌ Помилка:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Відключено від MongoDB');
  }
}

// Запускаємо перевірку
if (require.main === module) {
  checkOperator();
}

module.exports = { checkOperator };
