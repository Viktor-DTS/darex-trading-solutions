// Скрипт для перевірки підключення до MongoDB та користувачів
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

async function checkDatabase() {
  try {
    console.log('========================================');
    console.log('Перевірка підключення до MongoDB');
    console.log('========================================');
    console.log('URI:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    console.log('');
    
    console.log('Підключення...');
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ Підключення успішне!');
    console.log('');
    
    // Перевірка користувачів
    console.log('Перевірка користувачів...');
    const userCount = await User.countDocuments();
    console.log(`Всього користувачів: ${userCount}`);
    console.log('');
    
    if (userCount === 0) {
      console.log('⚠️  Користувачів не знайдено!');
      console.log('Створюю дефолтного адміністратора...');
      
      await User.create({
        login: 'bugai',
        password: 'admin',
        role: 'admin',
        name: 'Бугай В.',
        region: 'Україна',
        id: Date.now(),
      });
      
      console.log('✅ Дефолтного адміністратора створено!');
      console.log('   Логін: bugai');
      console.log('   Пароль: admin');
    } else {
      console.log('Список користувачів:');
      const users = await User.find().select('login role name region').lean();
      users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.login} (${user.role}) - ${user.name || 'Без імені'}`);
      });
    }
    
    console.log('');
    console.log('========================================');
    console.log('Перевірка завершена успішно!');
    console.log('========================================');
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ ПОМИЛКА:');
    console.error(error.message);
    console.error('');
    console.error('Перевірте:');
    console.error('1. Чи правильний MONGODB_URI в config.env');
    console.error('2. Чи доступний MongoDB сервер');
    console.error('3. Чи правильні credentials');
    process.exit(1);
  }
}

checkDatabase();
