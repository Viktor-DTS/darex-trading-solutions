const https = require('https');

console.log('🔍 ТЕСТУВАННЯ ENDPOINT INVOICE-REQUESTS');
console.log('=====================================\n');

// Функція для тестування endpoint'у
function testEndpoint(url, description) {
  return new Promise((resolve) => {
    console.log(`🔍 Тестуємо: ${description}`);
    console.log(`   URL: ${url}`);
    
    const req = https.get(url, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            console.log('   ✅ Успішно');
            console.log('   📊 Response structure:');
            console.log(`      - success: ${response.success}`);
            console.log(`      - data type: ${typeof response.data}`);
            if (response.data) {
              console.log(`      - data._id: ${response.data._id}`);
              console.log(`      - data.requestNumber: ${response.data.requestNumber}`);
              console.log(`      - data.status: ${response.data.status}`);
            } else {
              console.log('      - data: null/undefined');
            }
            resolve(response);
          } catch (error) {
            console.log('   ❌ Помилка парсингу JSON:', error.message);
            console.log('   Raw response:', data.substring(0, 200) + '...');
            resolve(null);
          }
        } else if (res.statusCode === 404) {
          console.log('   ❌ Not Found');
          resolve(null);
        } else {
          console.log(`   ⚠️  Неочікуваний статус: ${res.statusCode}`);
          console.log('   Response:', data.substring(0, 200) + '...');
          resolve(null);
        }
        console.log('');
      });
    });
    
    req.on('error', (error) => {
      console.log('   ❌ Помилка запиту:', error.message);
      console.log('');
      resolve(null);
    });
    
    req.setTimeout(10000, () => {
      console.log('   ⏰ Timeout');
      console.log('');
      req.destroy();
      resolve(null);
    });
  });
}

async function main() {
  try {
    // Тест 1: Отримання списку всіх запитів
    await testEndpoint(
      'https://darex-trading-solutions.onrender.com/api/invoice-requests',
      'Список всіх запитів на рахунки'
    );
    
    // Тест 2: Отримання конкретного запиту (використовуємо ID з попереднього тесту)
    await testEndpoint(
      'https://darex-trading-solutions.onrender.com/api/invoice-requests/68e637d7af11b7e215887380',
      'Конкретний запит на рахунок'
    );
    
    // Тест 3: Отримання неіснуючого запиту
    await testEndpoint(
      'https://darex-trading-solutions.onrender.com/api/invoice-requests/nonexistent',
      'Неіснуючий запит (очікуємо 404)'
    );
    
    console.log('✅ Тестування завершено!');
    
  } catch (error) {
    console.error('❌ Помилка тестування:', error.message);
  }
}

main();
