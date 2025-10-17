#!/usr/bin/env node

/**
 * Скрипт для виправлення проблем з Chat ID
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

async function fixChatIdIssues() {
  try {
    console.log('🔧 Виправлення проблем з Chat ID...\n');
    
    // Підключення до MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dts-service';
    await mongoose.connect(mongoUri);
    console.log('✅ Підключено до MongoDB\n');
    
    // 1. Виправляємо користувачів з порожнім Chat ID
    console.log('🔧 === ВИПРАВЛЕННЯ ПОРОЖНІХ CHAT ID ===');
    
    const usersWithEmptyChatId = await User.find({
      $or: [
        { telegramChatId: '' },
        { telegramChatId: null },
        { telegramChatId: { $exists: false } }
      ]
    });
    
    console.log(`📊 Знайдено ${usersWithEmptyChatId.length} користувачів з порожнім Chat ID`);
    
    for (const user of usersWithEmptyChatId) {
      console.log(`👤 ${user.login} (${user.name}) - ${user.role}`);
      
      // Встановлюємо Chat ID як "Chat ID" (за замовчуванням)
      await User.updateOne(
        { _id: user._id },
        { $set: { telegramChatId: 'Chat ID' } }
      );
      
      console.log(`   ✅ Оновлено Chat ID на "Chat ID"`);
    }
    
    // 2. Виправляємо дублювання Chat ID
    console.log('\n🔧 === ВИПРАВЛЕННЯ ДУБЛЮВАНЬ CHAT ID ===');
    
    // Chat ID 630714439: bugai (admin) vs фффф (operator)
    console.log('\n📱 Chat ID 630714439:');
    const bugai = await User.findOne({ login: 'bugai' });
    const ffff = await User.findOne({ login: 'фффф' });
    
    if (bugai && ffff) {
      console.log(`👤 bugai (${bugai.name}) - admin - залишаємо Chat ID ${bugai.telegramChatId}`);
      console.log(`👤 фффф (${ffff.name}) - operator - змінюємо Chat ID`);
      
      // Змінюємо Chat ID для фффф на унікальний
      const newChatId = 'CHAT_ID_NEEDED_фффф';
      await User.updateOne(
        { login: 'фффф' },
        { $set: { telegramChatId: newChatId } }
      );
      
      console.log(`   ✅ Оновлено Chat ID для фффф на "${newChatId}"`);
    }
    
    // Chat ID 1190497211: servdkbo (regkerivn) vs operator (operator)
    console.log('\n📱 Chat ID 1190497211:');
    const servdkbo = await User.findOne({ login: 'servdkbo' });
    const operator = await User.findOne({ login: 'operator' });
    
    if (servdkbo && operator) {
      console.log(`👤 servdkbo (${servdkbo.name}) - regkerivn - залишаємо Chat ID ${servdkbo.telegramChatId}`);
      console.log(`👤 operator (${operator.name}) - operator - змінюємо Chat ID`);
      
      // Змінюємо Chat ID для operator на унікальний
      const newChatId = 'CHAT_ID_NEEDED_operator';
      await User.updateOne(
        { login: 'operator' },
        { $set: { telegramChatId: newChatId } }
      );
      
      console.log(`   ✅ Оновлено Chat ID для operator на "${newChatId}"`);
    }
    
    // 3. Перевіряємо результат
    console.log('\n📊 === ПЕРЕВІРКА РЕЗУЛЬТАТУ ===');
    
    const usersWithTelegram = await User.find({
      telegramChatId: { 
        $exists: true, 
        $ne: null, 
        $ne: '', 
        $ne: 'Chat ID',
        $not: /^CHAT_ID_NEEDED_/
      }
    });
    
    console.log(`✅ Користувачів з валідним Chat ID: ${usersWithTelegram.length}`);
    
    // Групуємо по Chat ID для перевірки дублювань
    const chatIdGroups = {};
    for (const user of usersWithTelegram) {
      const chatId = user.telegramChatId;
      if (!chatIdGroups[chatId]) {
        chatIdGroups[chatId] = [];
      }
      chatIdGroups[chatId].push(user);
    }
    
    const remainingDuplicates = Object.entries(chatIdGroups).filter(([chatId, users]) => users.length > 1);
    
    if (remainingDuplicates.length === 0) {
      console.log('✅ Дублювань Chat ID не залишилося!');
    } else {
      console.log(`❌ Залишилося ${remainingDuplicates.length} дублювань:`);
      for (const [chatId, users] of remainingDuplicates) {
        console.log(`   Chat ID ${chatId}: ${users.map(u => u.login).join(', ')}`);
      }
    }
    
    // 4. Показуємо користувачів, які потребують налаштування Chat ID
    console.log('\n⚠️ === КОРИСТУВАЧІ, ЯКІ ПОТРЕБУЮТЬ НАЛАШТУВАННЯ CHAT ID ===');
    
    const usersNeedingChatId = await User.find({
      telegramChatId: { $regex: /^CHAT_ID_NEEDED_/ }
    });
    
    if (usersNeedingChatId.length > 0) {
      console.log(`📱 ${usersNeedingChatId.length} користувачів потребують налаштування Chat ID:`);
      
      for (const user of usersNeedingChatId) {
        console.log(`   👤 ${user.login} (${user.name}) - ${user.role}`);
        console.log(`      Поточний Chat ID: ${user.telegramChatId}`);
        console.log(`      Дія: Отримати правильний Chat ID через @userinfobot`);
        console.log('');
      }
    } else {
      console.log('✅ Всі користувачі мають валідні Chat ID');
    }
    
    // 5. Фінальна статистика
    console.log('📊 === ФІНАЛЬНА СТАТИСТИКА ===');
    
    const totalUsers = await User.countDocuments();
    const usersWithValidChatId = await User.countDocuments({
      telegramChatId: { 
        $exists: true, 
        $ne: null, 
        $ne: '', 
        $ne: 'Chat ID',
        $not: /^CHAT_ID_NEEDED_/
      }
    });
    const usersWithDefaultChatId = await User.countDocuments({
      telegramChatId: 'Chat ID'
    });
    const usersNeedingChatIdCount = await User.countDocuments({
      telegramChatId: { $regex: /^CHAT_ID_NEEDED_/ }
    });
    
    console.log(`   Загальна кількість користувачів: ${totalUsers}`);
    console.log(`   З валідним Chat ID: ${usersWithValidChatId}`);
    console.log(`   З Chat ID "Chat ID" (потребують налаштування): ${usersWithDefaultChatId}`);
    console.log(`   З тимчасовим Chat ID (потребують виправлення): ${usersNeedingChatIdCount}`);
    
    console.log('\n💡 === НАСТУПНІ КРОКИ ===');
    console.log('1. 📱 Налаштувати Chat ID для користувачів:');
    console.log('   - Зв\'язатися з користувачами');
    console.log('   - Отримати правильні Chat ID через @userinfobot');
    console.log('   - Оновити в системі');
    
    console.log('\n2. 🧪 Протестувати систему:');
    console.log('   - Використати панель дебагу сповіщень');
    console.log('   - Відправити тестові сповіщення');
    console.log('   - Перевірити доставку');
    
    console.log('\n3. 📋 Моніторити систему:');
    console.log('   - Регулярно перевіряти дублювання');
    console.log('   - Відстежувати успішність доставки');
    console.log('   - Оновлювати налаштування за потреби');
    
  } catch (error) {
    console.error('❌ Помилка:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Відключено від MongoDB');
  }
}

// Запускаємо виправлення
if (require.main === module) {
  fixChatIdIssues();
}

module.exports = { fixChatIdIssues };
