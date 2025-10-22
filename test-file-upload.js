const https = require('https');
const FormData = require('form-data');
const fs = require('fs');

console.log('🧪 TESTING FILE UPLOAD FUNCTIONALITY');
console.log('====================================\n');

// Створюємо тестовий файл
const testContent = 'Test file content for upload testing - ' + new Date().toISOString();
const testFileName = 'test-upload.txt';
fs.writeFileSync(testFileName, testContent);

console.log(`📁 Created test file: ${testFileName}`);

// Функція для тестування POST завантаження
function testPostUpload(url, formData, description) {
  return new Promise((resolve) => {
    console.log(`\n🔍 Testing: ${description}`);
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
          console.log(`   ✅ Success`);
          try {
            const response = JSON.parse(data);
            console.log(`   Response:`, response);
          } catch (e) {
            console.log(`   Response (text):`, data.substring(0, 200) + '...');
          }
        } else if (res.statusCode === 400) {
          console.log(`   ❌ Bad Request`);
          try {
            const response = JSON.parse(data);
            console.log(`   Error:`, response.message || response);
          } catch (e) {
            console.log(`   Error (text):`, data);
          }
        } else if (res.statusCode === 500) {
          console.log(`   ❌ Server Error`);
          console.log(`   Error:`, data);
        } else {
          console.log(`   ⚠️  Unexpected status: ${res.statusCode}`);
          console.log(`   Response:`, data.substring(0, 200) + '...');
        }
        resolve({ status: res.statusCode, data });
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ Request failed: ${error.message}`);
      resolve({ status: 'error', error: error.message });
    });
    
    req.setTimeout(15000, () => {
      console.log(`   ⏰ Timeout`);
      req.destroy();
      resolve({ status: 'timeout' });
    });
    
    formData.pipe(req);
  });
}

async function runTests() {
  try {
    // Тест 1: Завантаження рахунку з PDF файлом
    console.log('\n📄 Testing Invoice Upload with PDF...');
    const invoiceFormData = new FormData();
    invoiceFormData.append('invoiceFile', fs.createReadStream(testFileName));
    invoiceFormData.append('invoiceNumber', 'TEST-INVOICE-' + Date.now());
    
    await testPostUpload(
      'https://darex-trading-solutions.onrender.com/api/invoice-requests/68f7baaf179f05b6c4dcad86/upload',
      invoiceFormData,
      'Invoice Upload (PDF)'
    );
    
    // Тест 2: Завантаження акту
    console.log('\n📋 Testing Act Upload...');
    const actFormData = new FormData();
    actFormData.append('actFile', fs.createReadStream(testFileName));
    
    await testPostUpload(
      'https://darex-trading-solutions.onrender.com/api/invoice-requests/68f7baaf179f05b6c4dcad86/upload-act',
      actFormData,
      'Act Upload'
    );
    
    // Тест 3: Перевірка після завантаження
    console.log('\n🔍 Checking invoice request after upload...');
    await new Promise((resolve) => {
      https.get('https://darex-trading-solutions.onrender.com/api/invoice-requests', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const requests = JSON.parse(data);
            const targetRequest = requests.data?.find(req => req._id === '68f7baaf179f05b6c4dcad86');
            if (targetRequest) {
              console.log(`   Invoice File: ${targetRequest.invoiceFile || 'None'}`);
              console.log(`   Act File: ${targetRequest.actFile || 'None'}`);
              console.log(`   Invoice Status: ${targetRequest.status || 'Unknown'}`);
            } else {
              console.log('   ❌ Target request not found');
            }
          } catch (error) {
            console.log('   ❌ Error parsing response:', error.message);
          }
          resolve();
        });
      }).on('error', (error) => {
        console.log('   ❌ Error:', error.message);
        resolve();
      });
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Видаляємо тестовий файл
    try {
      fs.unlinkSync(testFileName);
      console.log(`\n🧹 Cleaned up test file: ${testFileName}`);
    } catch (e) {
      console.log(`\n⚠️  Could not delete test file: ${e.message}`);
    }
  }
}

runTests();
