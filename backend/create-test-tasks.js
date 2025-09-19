const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://viktor:viktor123@cluster0.mongodb.net/dts?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('Connected to MongoDB');
  
  const Task = mongoose.model('Task', new mongoose.Schema({}, { strict: false }));
  
  // Створюємо тестові завдання з регіонами Львівський та Хмельницький
  const testTasks = [
    {
      serviceRegion: 'Львівський',
      status: 'Виконано',
      requestDate: '2025-09-18',
      date: '2025-09-18',
      client: 'Тест Львівський',
      work: 'Тест Львівський',
      requestNumber: 'LV-0000001',
      company: 'ДТС',
      approvedByWarehouse: null
    },
    {
      serviceRegion: 'Хмельницький',
      status: 'Виконано',
      requestDate: '2025-09-18',
      date: '2025-09-18',
      client: 'Тест Хмельницький',
      work: 'Тест Хмельницький',
      requestNumber: 'HY-0000001',
      company: 'Дарекс Енерго',
      approvedByWarehouse: null
    }
  ];
  
  try {
    await Task.insertMany(testTasks);
    console.log('✅ Test tasks created successfully');
    
    // Перевіряємо створені завдання
    const createdTasks = await Task.find({ serviceRegion: { $in: ['Львівський', 'Хмельницький'] } });
    console.log('📋 Created tasks:', createdTasks.length);
    createdTasks.forEach(task => {
      console.log('  - ID:', task._id, 'Region:', task.serviceRegion, 'Client:', task.client);
    });
    
  } catch (error) {
    console.error('❌ Error creating test tasks:', error);
  }
  
  mongoose.disconnect();
}).catch(err => console.error('MongoDB connection error:', err));

