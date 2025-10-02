const mongoose = require('mongoose');
require('dotenv').config();

// Підключення до MongoDB
const connectToMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dts-service', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB підключено');
    return true;
  } catch (error) {
    console.error('❌ Помилка підключення до MongoDB:', error);
    return false;
  }
};

// Схема заявки
const taskSchema = new mongoose.Schema({
  requestNumber: String,
  requestDate: String,
  client: String,
  address: String,
  requestDesc: String,
  serviceRegion: String,
  company: String,
  status: String,
  date: String,
  engineer1: String,
  engineer2: String,
  workPrice: String,
  oilTotal: String,
  filterSum: String,
  fuelFilterSum: String,
  airFilterSum: String,
  antifreezeSum: String,
  otherSum: String,
  totalPrice: String,
  approvedByWarehouse: String,
  warehouseComment: String,
  approvedByAccountant: String,
  accountantComment: String,
  accountantComments: String,
  approvedByRegionalManager: String,
  regionalManagerComment: String,
  bonusApprovalDate: String,
  reportMonthYear: String,
  isImported: Boolean
}, { strict: false });

const Task = mongoose.model('Task', taskSchema);

// Функція для виправлення bonusApprovalDate
const fixBonusApprovalDates = async () => {
  try {
    console.log('🔍 Пошук заявок без bonusApprovalDate...');
    
    // Знаходимо всі заявки без bonusApprovalDate
    const tasksWithoutBonusDate = await Task.find({
      $or: [
        { bonusApprovalDate: { $exists: false } },
        { bonusApprovalDate: null },
        { bonusApprovalDate: '' }
      ]
    });

    console.log(`📊 Знайдено ${tasksWithoutBonusDate.length} заявок без bonusApprovalDate`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const task of tasksWithoutBonusDate) {
      // Перевіряємо чи заявка підтверджена всіма ролями
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
      const isRegionalManagerApproved = task.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === true;

      // Якщо заявка підтверджена складом та бухгалтером, встановлюємо bonusApprovalDate
      if (isWarehouseApproved && isAccountantApproved && task.workPrice) {
        // Встановлюємо bonusApprovalDate на поточний місяць
        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentYear = now.getFullYear();
        const bonusApprovalDate = `${currentMonth}-${currentYear}`;

        await Task.updateOne(
          { _id: task._id },
          { $set: { bonusApprovalDate: bonusApprovalDate } }
        );

        console.log(`✅ Оновлено заявку ${task._id}: bonusApprovalDate = ${bonusApprovalDate}`);
        updatedCount++;
      } else {
        console.log(`⏭️ Пропущено заявку ${task._id}: не підтверджена всіма ролями або немає workPrice`);
        skippedCount++;
      }
    }

    console.log(`\n📈 Результати:`);
    console.log(`✅ Оновлено: ${updatedCount} заявок`);
    console.log(`⏭️ Пропущено: ${skippedCount} заявок`);
    console.log(`📊 Всього оброблено: ${tasksWithoutBonusDate.length} заявок`);

  } catch (error) {
    console.error('❌ Помилка при виправленні bonusApprovalDate:', error);
  }
};

// Головна функція
const main = async () => {
  console.log('🚀 Запуск скрипта виправлення bonusApprovalDate...');
  
  const connected = await connectToMongoDB();
  if (!connected) {
    console.error('❌ Не вдалося підключитися до MongoDB');
    process.exit(1);
  }

  await fixBonusApprovalDates();
  
  console.log('✅ Скрипт завершено');
  await mongoose.disconnect();
  process.exit(0);
};

// Запуск скрипта
main().catch(console.error);
