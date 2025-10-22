const https = require('https');

console.log('🧹 Очищення тестових файлів з запиту на рахунок...\n');

// Функція для очищення файлів з запиту
function clearTestFiles() {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      invoiceFile: '',
      invoiceFileName: '',
      actFile: '',
      actFileName: '',
      status: 'pending' // Повертаємо статус в pending
    });
    
    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
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
            console.log('   ✅ Тестові файли успішно видалено');
            try {
              const response = JSON.parse(responseData);
              console.log('   Response:', response);
            } catch (e) {
              console.log('   Response (text):', responseData);
            }
          } else {
            console.log('   ❌ Помилка при видаленні файлів');
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
  console.log('🔍 Очищення тестових файлів...');
  await clearTestFiles();
  console.log('\n✅ Очищення завершено!');
  console.log('📝 Запит на рахунок повернуто в статус "pending"');
  console.log('🗑️ Тестові файли видалено');
}

main().catch(console.error);
