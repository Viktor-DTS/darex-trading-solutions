const https = require('https');

console.log('🗑️ Видалення тестових файлів через API...\n');

// Функція для видалення файлу
function deleteFile(url, description) {
  return new Promise((resolve) => {
    console.log(`🔍 ${description}`);
    console.log(`   URL: ${url}`);
    
    const req = https.request(url, { method: 'DELETE' }, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('   ✅ Файл успішно видалено');
          try {
            const response = JSON.parse(data);
            console.log('   Response:', response.message || 'Success');
          } catch (e) {
            console.log('   Response (text):', data);
          }
        } else {
          console.log('   ❌ Помилка при видаленні файлу');
          console.log('   Error:', data);
        }
        console.log('');
        resolve();
      });
    });
    
    req.on('error', (error) => {
      console.log('   ❌ Request failed:', error.message);
      console.log('');
      resolve();
    });
    
    req.end();
  });
}

async function main() {
  const requestId = '68f7baaf179f05b6c4dcad86';
  
  // Видаляємо файл рахунку
  await deleteFile(
    `https://darex-trading-solutions.onrender.com/api/invoice-requests/${requestId}/file`,
    'Видалення файлу рахунку'
  );
  
  // Видаляємо файл акту
  await deleteFile(
    `https://darex-trading-solutions.onrender.com/api/invoice-requests/${requestId}/act-file`,
    'Видалення файлу акту'
  );
  
  console.log('✅ Видалення завершено!');
  console.log('🔄 Оновіть сторінку в браузері, щоб побачити зміни');
}

main().catch(console.error);
