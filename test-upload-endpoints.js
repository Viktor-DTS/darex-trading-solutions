const https = require('https');
const FormData = require('form-data');
const fs = require('fs');

console.log('🧪 Testing upload endpoints...\n');

// Створюємо тестовий файл
const testContent = 'Test file content for upload testing';
fs.writeFileSync('test-file.txt', testContent);

// Функція для тестування endpoint'у
function testEndpoint(url, formData, description) {
  return new Promise((resolve, reject) => {
    console.log(`🔍 Testing: ${description}`);
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
          console.log(`   ✅ Success: ${data.substring(0, 100)}...`);
        } else {
          console.log(`   ❌ Error: ${data}`);
        }
        resolve({ status: res.statusCode, data });
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ Request failed: ${error.message}`);
      reject(error);
    });
    
    formData.pipe(req);
  });
}

async function runTests() {
  try {
    // Тест 1: Завантаження рахунку
    const invoiceFormData = new FormData();
    invoiceFormData.append('invoiceFile', fs.createReadStream('test-file.txt'));
    invoiceFormData.append('invoiceNumber', 'TEST-INVOICE-001');
    
    await testEndpoint(
      'https://darex-trading-solutions.onrender.com/api/invoice-requests/68f7baaf179f05b6c4dcad86/upload',
      invoiceFormData,
      'Invoice Upload'
    );
    
    console.log('\n');
    
    // Тест 2: Завантаження акту
    const actFormData = new FormData();
    actFormData.append('actFile', fs.createReadStream('test-file.txt'));
    
    await testEndpoint(
      'https://darex-trading-solutions.onrender.com/api/invoice-requests/68f7baaf179f05b6c4dcad86/upload-act',
      actFormData,
      'Act Upload'
    );
    
    console.log('\n');
    
    // Тест 3: Звичайне завантаження файлів
    const fileFormData = new FormData();
    fileFormData.append('file', fs.createReadStream('test-file.txt'));
    fileFormData.append('taskId', '68f7ba7f179f05b6c4dcad6a');
    fileFormData.append('description', 'Test upload');
    
    await testEndpoint(
      'https://darex-trading-solutions.onrender.com/api/files/upload',
      fileFormData,
      'Regular File Upload'
    );
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Видаляємо тестовий файл
    fs.unlinkSync('test-file.txt');
    console.log('\n🧹 Cleaned up test file');
  }
}

runTests();
