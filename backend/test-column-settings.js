// Тестовий скрипт для перевірки збереження налаштувань колонок
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://darexuser:viktor22@cluster0.yaec2av.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';

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
  dismissed: { type: Boolean, default: false }
}, { strict: false });

const User = mongoose.model('User', userSchema);

async function testColumnSettings() {
  try {
    console.log('Підключення до MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Підключено до MongoDB');

    const testLogin = 'bugai';
    const testArea = 'accountant';
    
    // Знаходимо користувача
    let user = await User.findOne({ login: testLogin });
    if (!user) {
      console.log('❌ Користувача не знайдено');
      process.exit(1);
    }

    console.log('\n=== ПОЧАТКОВИЙ СТАН ===');
    console.log('columnsSettings:', JSON.stringify(user.columnsSettings, null, 2));

    // Тестові налаштування
    const testSettings = {
      visible: ['requestNumber', 'requestDate', 'client', 'status'],
      order: ['requestNumber', 'requestDate', 'client', 'status'],
      widths: { requestNumber: 150, requestDate: 200 }
    };

    console.log('\n=== ЗБЕРЕЖЕННЯ НАЛАШТУВАНЬ ===');
    if (!user.columnsSettings) user.columnsSettings = {};
    user.columnsSettings[testArea] = testSettings;
    
    // Позначаємо як змінене
    user.markModified('columnsSettings');
    
    console.log('Зберігаємо:', JSON.stringify(user.columnsSettings, null, 2));
    await user.save();
    console.log('✅ Збережено');

    // Перевіряємо
    console.log('\n=== ПЕРЕВІРКА ПІСЛЯ ЗБЕРЕЖЕННЯ ===');
    const savedUser = await User.findOne({ login: testLogin });
    console.log('columnsSettings:', JSON.stringify(savedUser.columnsSettings, null, 2));
    
    const savedSettings = savedUser.columnsSettings?.[testArea];
    if (savedSettings) {
      console.log('\n✅ Налаштування знайдено:');
      console.log('  visible:', savedSettings.visible);
      console.log('  order:', savedSettings.order);
      console.log('  widths:', savedSettings.widths);
    } else {
      console.log('\n❌ Налаштування не знайдено!');
    }

    // Перевірка через .lean()
    console.log('\n=== ПЕРЕВІРКА ЧЕРЕЗ .lean() ===');
    const savedUserLean = await User.findOne({ login: testLogin }).lean();
    const savedSettingsLean = savedUserLean.columnsSettings?.[testArea];
    if (savedSettingsLean) {
      console.log('✅ Налаштування знайдено через .lean():');
      console.log('  visible:', savedSettingsLean.visible);
      console.log('  order:', savedSettingsLean.order);
      console.log('  widths:', savedSettingsLean.widths);
    } else {
      console.log('❌ Налаштування не знайдено через .lean()!');
    }

    await mongoose.disconnect();
    console.log('\n✅ Тест завершено');
  } catch (error) {
    console.error('❌ Помилка:', error);
    process.exit(1);
  }
}

testColumnSettings();
