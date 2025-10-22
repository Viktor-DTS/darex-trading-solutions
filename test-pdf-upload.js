const https = require('https');
const FormData = require('form-data');
const fs = require('fs');

console.log('🧪 TESTING PDF UPLOAD');
console.log('=====================\n');

// Створюємо простий PDF файл (мінімальний PDF)
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
(Test PDF) Tj
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

const testFileName = 'test-upload.pdf';
fs.writeFileSync(testFileName, pdfContent);

console.log(`📁 Created test PDF file: ${testFileName}`);

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
    
    // Тест 2: Завантаження акту з PDF файлом
    console.log('\n📋 Testing Act Upload with PDF...');
    const actFormData = new FormData();
    actFormData.append('actFile', fs.createReadStream(testFileName));
    
    await testPostUpload(
      'https://darex-trading-solutions.onrender.com/api/invoice-requests/68f7baaf179f05b6c4dcad86/upload-act',
      actFormData,
      'Act Upload (PDF)'
    );
    
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
