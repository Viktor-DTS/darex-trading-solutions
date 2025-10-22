const https = require('https');

console.log('🧹 Правильне очищення тестових файлів...\n');

// Функція для оновлення запиту з очищенням файлів
function updateInvoiceRequest() {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      invoiceFile: '',
      invoiceFileName: '',
      actFile: '',
      actFileName: '',
      status: 'pending',
      completedAt: null
    });
    
    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    console.log('📝 Оновлюємо запит на рахунок...');
    console.log('   Очищуємо файли та повертаємо статус в "pending"');
    
    const req = https.request(
      'https://darex-trading-solutions.onrender.com/api/invoice-requests/68f7baaf179f05b6c4dcad86',
      options,
      (res) => {
        let responseData = '';
        
        res.on('data', chunk => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          console.log(`   Status: ${res.statusCode}`);
          if (res.statusCode === 200) {
            console.log('   ✅ Запит успішно оновлено');
            try {
              const response = JSON.parse(responseData);
              console.log('   📊 Результат:');
              console.log(`      - Статус: ${response.data?.status || 'unknown'}`);
              console.log(`      - Файл рахунку: ${response.data?.invoiceFile || 'None'}`);
              console.log(`      - Файл акту: ${response.data?.actFile || 'None'}`);
              console.log(`      - Дата завершення: ${response.data?.completedAt || 'None'}`);
            } catch (e) {
              console.log('   Response (text):', responseData);
            }
          } else {
            console.log('   ❌ Помилка при оновленні запиту');
            console.log('   Error:', responseData);
          }
          resolve();
        });
      }
    );
    
    req.on('error', (error) => {
      console.log('   ❌ Request failed:', error.message);
      resolve();
    });
    
    req.write(data);
    req.end();
  });
}

async function main() {
  await updateInvoiceRequest();
  console.log('\n✅ Очищення завершено!');
  console.log('🔄 Оновіть сторінку в браузері, щоб побачити зміни');
}

main().catch(console.error);
