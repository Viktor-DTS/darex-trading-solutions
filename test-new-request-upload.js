const https = require('https');
const FormData = require('form-data');
const fs = require('fs');

console.log('🧪 ТЕСТУВАННЯ ЗАВАНТАЖЕННЯ ФАЙЛІВ ДЛЯ НОВОЇ ЗАЯВКИ');
console.log('==================================================\n');

// Створюємо простий PDF файл
const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test Invoice PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
299
%%EOF`;

const testFileName = 'test-invoice-new.pdf';
fs.writeFileSync(testFileName, pdfContent);

console.log(`📁 Створено тестовий PDF файл: ${testFileName}`);

// Функція для отримання списку запитів на рахунки
function getInvoiceRequests() {
  return new Promise((resolve) => {
    console.log('🔍 Отримуємо список запитів на рахунки...');
    
    https.get('https://darex-trading-solutions.onrender.com/api/invoice-requests', (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const requests = response.data || response;
          console.log(`📊 Знайдено ${requests.length} запитів на рахунки`);
          
          // Шукаємо останній запит
          const latestRequest = requests[requests.length - 1];
          if (latestRequest) {
            console.log(`🎯 Останній запит: ${latestRequest._id}`);
            console.log(`   - Номер: ${latestRequest.requestNumber}`);
            console.log(`   - Замовник: ${latestRequest.companyDetails?.companyName || 'N/A'}`);
            console.log(`   - Статус: ${latestRequest.status}`);
            console.log(`   - Потрібен рахунок: ${latestRequest.needInvoice}`);
            console.log(`   - Потрібен акт: ${latestRequest.needAct}`);
            resolve(latestRequest._id);
          } else {
            console.log('❌ Запитів на рахунки не знайдено');
            resolve(null);
          }
        } catch (error) {
          console.error('❌ Помилка парсингу відповіді:', error.message);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error('❌ Помилка запиту:', error.message);
      resolve(null);
    });
  });
}

// Функція для тестування завантаження файлу
function testUpload(url, formData, description) {
  return new Promise((resolve) => {
    console.log(`\n🔍 Тестуємо: ${description}`);
    console.log(`   URL: ${url}`);
    
    const options = {
      method: 'POST',
      headers: formData.getHeaders()
    };
    
    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('   ✅ Успішно завантажено');
          try {
            const response = JSON.parse(data);
            console.log('   📄 Файл URL:', response.data?.invoiceFile || response.data?.actFile);
            console.log('   📄 Назва файлу:', response.data?.invoiceFileName || response.data?.actFileName);
          } catch (e) {
            console.log('   Response (text):', data.substring(0, 200) + '...');
          }
        } else if (res.statusCode === 400) {
          console.log('   ❌ Bad Request');
          try {
            const response = JSON.parse(data);
            console.log('   Error:', response.message || response);
          } catch (e) {
            console.log('   Error (text):', data);
          }
        } else if (res.statusCode === 500) {
          console.log('   ❌ Server Error');
          console.log('   Error:', data);
        } else {
          console.log(`   ⚠️  Неочікуваний статус: ${res.statusCode}`);
          console.log('   Response:', data.substring(0, 200) + '...');
        }
        resolve({ status: res.statusCode, data });
      });
    });
    
    req.on('error', (error) => {
      console.log('   ❌ Помилка запиту:', error.message);
      resolve({ status: 'error', error: error.message });
    });
    
    req.setTimeout(15000, () => {
      console.log('   ⏰ Timeout');
      req.destroy();
      resolve({ status: 'timeout' });
    });
    
    formData.pipe(req);
  });
}

async function main() {
  try {
    // Отримуємо ID останнього запиту
    const requestId = await getInvoiceRequests();
    
    if (!requestId) {
      console.log('❌ Не вдалося знайти запит для тестування');
      return;
    }
    
    console.log(`\n🎯 Тестуємо завантаження для запиту: ${requestId}`);
    
    // Тест 1: Завантаження рахунку
    console.log('\n📄 Тестуємо завантаження рахунку...');
    const invoiceFormData = new FormData();
    invoiceFormData.append('invoiceFile', fs.createReadStream(testFileName));
    invoiceFormData.append('invoiceNumber', 'TEST-INVOICE-' + Date.now());
    
    await testUpload(
      `https://darex-trading-solutions.onrender.com/api/invoice-requests/${requestId}/upload`,
      invoiceFormData,
      'Завантаження рахунку'
    );
    
    // Тест 2: Завантаження акту
    console.log('\n📋 Тестуємо завантаження акту...');
    const actFormData = new FormData();
    actFormData.append('actFile', fs.createReadStream(testFileName));
    
    await testUpload(
      `https://darex-trading-solutions.onrender.com/api/invoice-requests/${requestId}/upload-act`,
      actFormData,
      'Завантаження акту'
    );
    
    // Перевіряємо результат
    console.log('\n🔍 Перевіряємо результат...');
    await new Promise((resolve) => {
      https.get(`https://darex-trading-solutions.onrender.com/api/invoice-requests/${requestId}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log('   📊 Результат:');
            console.log(`      - Статус: ${response.status || 'unknown'}`);
            console.log(`      - Файл рахунку: ${response.invoiceFile || 'None'}`);
            console.log(`      - Файл акту: ${response.actFile || 'None'}`);
          } catch (e) {
            console.log('   ❌ Помилка парсингу результату');
          }
          resolve();
        });
      }).on('error', (error) => {
        console.log('   ❌ Помилка:', error.message);
        resolve();
      });
    });
    
  } catch (error) {
    console.error('❌ Тест не вдався:', error.message);
  } finally {
    // Видаляємо тестовий файл
    try {
      fs.unlinkSync(testFileName);
      console.log(`\n🧹 Видалено тестовий файл: ${testFileName}`);
    } catch (e) {
      console.log(`\n⚠️  Не вдалося видалити тестовий файл: ${e.message}`);
    }
  }
}

main();
