const https = require('https');

console.log('🔍 ТЕСТУВАННЯ З ПАРАМЕТРОМ showAll');
console.log('==================================\n');

// Функція для тестування з параметром showAll
function testWithShowAll(showAll) {
  return new Promise((resolve) => {
    const url = `https://darex-trading-solutions.onrender.com/api/invoice-requests?showAll=${showAll}`;
    console.log(`🔍 Тестуємо з showAll=${showAll}`);
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
            console.log(`      - data is array: ${Array.isArray(response.data)}`);
            if (Array.isArray(response.data)) {
              console.log(`      - data length: ${response.data.length}`);
              if (response.data.length > 0) {
                console.log('   📋 Перший запит:');
                const first = response.data[0];
                console.log(`      - ID: ${first._id}`);
                console.log(`      - Номер: ${first.requestNumber}`);
                console.log(`      - Статус: ${first.status}`);
                console.log(`      - Потрібен рахунок: ${first.needInvoice}`);
                console.log(`      - Потрібен акт: ${first.needAct}`);
                console.log(`      - Файл рахунку: ${first.invoiceFile ? 'Є' : 'Немає'}`);
                console.log(`      - Файл акту: ${first.actFile ? 'Є' : 'Немає'}`);
              }
            } else {
              console.log('      - data не є масивом!');
            }
            resolve(response);
          } catch (error) {
            console.log('   ❌ Помилка парсингу JSON:', error.message);
            console.log('   Raw response:', data.substring(0, 200) + '...');
            resolve(null);
          }
        } else {
          console.log(`   ❌ Помилка: ${res.statusCode}`);
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
    // Тест 1: Без параметра showAll (за замовчуванням pending)
    await testWithShowAll('false');
    
    // Тест 2: З showAll=true (всі запити)
    await testWithShowAll('true');
    
    console.log('✅ Тестування завершено!');
    
  } catch (error) {
    console.error('❌ Помилка тестування:', error.message);
  }
}

main();
