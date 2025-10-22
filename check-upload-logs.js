const https = require('https');

console.log('🔍 Checking upload-related logs...\n');

https.get('https://darex-trading-solutions.onrender.com/api/recent-logs', (res) => {
  let data = '';
  
  res.on('data', chunk => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const logs = JSON.parse(data);
      
      console.log(`📊 Total logs: ${logs.logs.length}`);
      
      // Фільтруємо логи пов'язані з завантаженням
      const uploadLogs = logs.logs.filter(log => 
        log.message.toLowerCase().includes('upload') || 
        log.message.toLowerCase().includes('invoice') ||
        log.message.toLowerCase().includes('act')
      );
      
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
      
    } catch (error) {
      console.error('❌ Error parsing logs:', error.message);
    }
  });
  
}).on('error', (error) => {
  console.error('❌ Error fetching logs:', error.message);
});
