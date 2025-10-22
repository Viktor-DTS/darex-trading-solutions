const https = require('https');

console.log('🔍 ДІАГНОСТИКА FRONTEND ЗАВАНТАЖЕННЯ');
console.log('===================================\n');

// Функція для перевірки endpoint'у отримання конкретного запиту
function checkInvoiceRequest(requestId) {
  return new Promise((resolve) => {
    console.log(`🔍 Перевіряємо запит: ${requestId}`);
    
    https.get(`https://darex-trading-solutions.onrender.com/api/invoice-requests/${requestId}`, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            console.log('   📊 Дані запиту:');
            console.log(`      - ID: ${response._id}`);
            console.log(`      - Номер: ${response.requestNumber}`);
            console.log(`      - Статус: ${response.status}`);
            console.log(`      - Потрібен рахунок: ${response.needInvoice}`);
            console.log(`      - Потрібен акт: ${response.needAct}`);
            console.log(`      - Файл рахунку: ${response.invoiceFile || 'None'}`);
            console.log(`      - Файл акту: ${response.actFile || 'None'}`);
            console.log(`      - Назва файлу рахунку: ${response.invoiceFileName || 'None'}`);
            console.log(`      - Назва файлу акту: ${response.actFileName || 'None'}`);
            resolve(response);
          } catch (error) {
            console.log('   ❌ Помилка парсингу:', error.message);
            resolve(null);
          }
        } else {
          console.log('   ❌ Помилка отримання запиту');
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.log('   ❌ Помилка запиту:', error.message);
      resolve(null);
    });
  });
}

// Функція для перевірки всіх запитів
function checkAllInvoiceRequests() {
  return new Promise((resolve) => {
    console.log('🔍 Перевіряємо всі запити на рахунки...');
    
    https.get('https://darex-trading-solutions.onrender.com/api/invoice-requests', (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const requests = response.data || response;
          console.log(`📊 Знайдено ${requests.length} запитів`);
          
          // Показуємо останні 3 запити
          console.log('\n📋 Останні запити:');
          requests.slice(-3).forEach((req, index) => {
            console.log(`   ${index + 1}. ${req._id} - ${req.requestNumber}`);
            console.log(`      Статус: ${req.status}`);
            console.log(`      Файл рахунку: ${req.invoiceFile ? 'Є' : 'Немає'}`);
            console.log(`      Файл акту: ${req.actFile ? 'Є' : 'Немає'}`);
          });
          
          resolve(requests);
        } catch (error) {
          console.log('   ❌ Помилка парсингу:', error.message);
          resolve([]);
        }
      });
    }).on('error', (error) => {
      console.log('   ❌ Помилка запиту:', error.message);
      resolve([]);
    });
  });
}

async function main() {
  try {
    // Перевіряємо всі запити
    const allRequests = await checkAllInvoiceRequests();
    
    if (allRequests.length > 0) {
      // Перевіряємо останній запит детально
      const lastRequest = allRequests[allRequests.length - 1];
      console.log(`\n🎯 Детальна перевірка останнього запиту: ${lastRequest._id}`);
      await checkInvoiceRequest(lastRequest._id);
    }
    
    console.log('\n💡 Рекомендації:');
    console.log('   1. Перевірте, чи frontend викликає функції завантаження');
    console.log('   2. Перевірте, чи оновлюється стан після завантаження');
    console.log('   3. Перевірте консоль браузера на помилки JavaScript');
    console.log('   4. Перевірте, чи правильно працюють обробники подій onChange');
    
  } catch (error) {
    console.error('❌ Помилка діагностики:', error.message);
  }
}

main();
