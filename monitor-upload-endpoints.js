const https = require('https');

console.log('🔍 MONITORING UPLOAD ENDPOINTS');
console.log('================================\n');

// Функція для перевірки endpoint'у
function checkEndpoint(url, description) {
  return new Promise((resolve) => {
    console.log(`🔍 Checking: ${description}`);
    console.log(`   URL: ${url}`);
    
    const req = https.get(url, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log(`   ✅ OK`);
        } else if (res.statusCode === 404) {
          console.log(`   ❌ Not Found`);
        } else if (res.statusCode === 500) {
          console.log(`   ❌ Server Error`);
        } else {
          console.log(`   ⚠️  Unexpected status: ${res.statusCode}`);
        }
        console.log('');
        resolve({ status: res.statusCode, data });
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ Error: ${error.message}`);
      console.log('');
      resolve({ status: 'error', error: error.message });
    });
    
    req.setTimeout(10000, () => {
      console.log(`   ⏰ Timeout`);
      console.log('');
      req.destroy();
      resolve({ status: 'timeout' });
    });
  });
}

// Функція для перевірки логів завантаження
function checkUploadLogs() {
  return new Promise((resolve) => {
    console.log('📋 Checking upload-related logs...\n');
    
    https.get('https://darex-trading-solutions.onrender.com/api/recent-logs', (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const logs = JSON.parse(data);
          
          // Фільтруємо логи пов'язані з завантаженням
          const uploadLogs = logs.logs.filter(log => 
            log.message.toLowerCase().includes('upload') || 
            log.message.toLowerCase().includes('invoice') ||
            log.message.toLowerCase().includes('act') ||
            log.message.toLowerCase().includes('file')
          );
          
          console.log(`📊 Total logs: ${logs.logs.length}`);
          console.log(`📤 Upload-related logs: ${uploadLogs.length}\n`);
          
          if (uploadLogs.length > 0) {
            console.log('🔍 Recent upload logs:');
            uploadLogs.slice(-10).forEach(log => {
              const timestamp = new Date(log.timestamp).toLocaleString();
              console.log(`  ${timestamp}: ${log.message}`);
            });
          } else {
            console.log('❌ No upload-related logs found');
          }
          
          // Перевіряємо помилки
          const errorLogs = logs.logs.filter(log => log.type === 'error');
          console.log(`\n❌ Total errors: ${errorLogs.length}`);
          
          if (errorLogs.length > 0) {
            console.log('\n🔍 Recent errors:');
            errorLogs.slice(-5).forEach(log => {
              const timestamp = new Date(log.timestamp).toLocaleString();
              console.log(`  ${timestamp}: ${log.message}`);
            });
          }
          
          resolve();
        } catch (error) {
          console.error('❌ Error parsing logs:', error.message);
          resolve();
        }
      });
    }).on('error', (error) => {
      console.error('❌ Error fetching logs:', error.message);
      resolve();
    });
  });
}

async function main() {
  console.log('🚀 Starting upload endpoints monitoring...\n');
  
  // Перевіряємо основні endpoint'и
  await checkEndpoint('https://darex-trading-solutions.onrender.com/api/dashboard', 'System Dashboard');
  await checkEndpoint('https://darex-trading-solutions.onrender.com/api/invoice-requests', 'Invoice Requests List');
  await checkEndpoint('https://darex-trading-solutions.onrender.com/api/tasks', 'Tasks List');
  
  // Перевіряємо endpoint'и завантаження (очікуємо 404 або 405, оскільки це POST)
  await checkEndpoint('https://darex-trading-solutions.onrender.com/api/invoice-requests/68f7baaf179f05b6c4dcad86/upload', 'Invoice Upload Endpoint (GET)');
  await checkEndpoint('https://darex-trading-solutions.onrender.com/api/invoice-requests/68f7baaf179f05b6c4dcad86/upload-act', 'Act Upload Endpoint (GET)');
  
  // Перевіряємо логи
  await checkUploadLogs();
  
  console.log('\n✅ Upload endpoints monitoring complete!');
  console.log('\n💡 Recommendations:');
  console.log('  1. Check if frontend is calling the correct endpoints');
  console.log('  2. Verify that file selection triggers onChange events');
  console.log('  3. Check browser console for JavaScript errors');
  console.log('  4. Test with a simple file upload to isolate the issue');
}

main().catch(console.error);
