const https = require('https');

console.log('🔍 Checking invoice request...\n');

// Перевіряємо чи існує запит на рахунок
https.get('https://darex-trading-solutions.onrender.com/api/invoice-requests', (res) => {
  let data = '';
  
  res.on('data', chunk => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const requests = JSON.parse(data);
      
      console.log(`📊 Total invoice requests: ${requests.length}`);
      
      // Шукаємо наш запит
      const targetRequest = requests.find(req => req._id === '68f7baaf179f05b6c4dcad86');
      
      if (targetRequest) {
        console.log('✅ Target request found:');
        console.log(`   ID: ${targetRequest._id}`);
        console.log(`   Task ID: ${targetRequest.taskId}`);
        console.log(`   Status: ${targetRequest.status}`);
        console.log(`   Need Invoice: ${targetRequest.needInvoice}`);
        console.log(`   Need Act: ${targetRequest.needAct}`);
        console.log(`   Invoice File: ${targetRequest.invoiceFile || 'None'}`);
        console.log(`   Act File: ${targetRequest.actFile || 'None'}`);
      } else {
        console.log('❌ Target request not found!');
        console.log('Available requests:');
        requests.forEach(req => {
          console.log(`   - ${req._id} (Task: ${req.taskId})`);
        });
      }
      
    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
      console.log('Raw response:', data);
    }
  });
  
}).on('error', (error) => {
  console.error('❌ Error fetching invoice requests:', error.message);
});
