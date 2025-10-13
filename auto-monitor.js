#!/usr/bin/env node

/**
 * 🚀 АВТОМАТИЧНИЙ МОНІТОРИНГ СИСТЕМИ DTS
 * 
 * Цей скрипт автоматично:
 * - Перевіряє статус системи
 * - Аналізує логи
 * - Виявляє проблеми
 * - Надає рекомендації
 */

const https = require('https');
const http = require('http');

const BASE_URL = 'https://darex-trading-solutions.onrender.com/api';

// Кольори для консолі
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function checkSystemHealth() {
  log('\n🚀 DTS SYSTEM HEALTH CHECK', 'cyan');
  log('=' .repeat(50), 'cyan');
  
  try {
    // 1. Перевірка dashboard
    log('\n📊 Checking system dashboard...', 'blue');
    const dashboard = await makeRequest('/dashboard');
    
    if (dashboard.system) {
      log(`✅ System Status: ${dashboard.system.status}`, 'green');
      log(`✅ MongoDB: ${dashboard.system.mongodb}`, 'green');
      log(`✅ Uptime: ${Math.floor(dashboard.system.uptime)} seconds`, 'green');
      log(`✅ Memory Usage: ${Math.round(dashboard.system.memory.heapUsed / 1024 / 1024)} MB`, 'green');
    }
    
    // 2. Перевірка логів
    log('\n📋 Checking recent logs...', 'blue');
    const logs = await makeRequest('/recent-logs');
    
    if (logs.logs && logs.logs.length > 0) {
      const errorLogs = logs.logs.filter(log => log.type === 'error');
      const warningLogs = logs.logs.filter(log => log.type === 'warning');
      
      log(`📊 Total Logs: ${logs.logs.length}`, 'blue');
      log(`❌ Errors: ${errorLogs.length}`, errorLogs.length > 0 ? 'red' : 'green');
      log(`⚠️  Warnings: ${warningLogs.length}`, warningLogs.length > 0 ? 'yellow' : 'green');
      
      if (errorLogs.length > 0) {
        log('\n🔍 Recent Errors:', 'red');
        errorLogs.slice(-3).forEach(log => {
          console.log(`  • ${log.timestamp}: ${log.message}`);
        });
      }
    }
    
    // 3. Перевірка endpoint статистики
    log('\n🔧 Checking endpoint statistics...', 'blue');
    const stats = await makeRequest('/endpoint-stats');
    
    if (stats && Object.keys(stats).length > 0) {
      const sortedEndpoints = Object.entries(stats)
        .sort((a, b) => b[1].calls - a[1].calls)
        .slice(0, 5);
      
      log('📈 Most Used Endpoints:', 'blue');
      sortedEndpoints.forEach(([endpoint, data]) => {
        log(`  • ${endpoint}: ${data.calls} calls`, 'blue');
      });
    }
    
    // 4. Перевірка тестового endpoint'у
    log('\n🧪 Testing basic functionality...', 'blue');
    try {
      const testResult = await makeRequest('/test-invoice');
      if (testResult.success) {
        log('✅ Test endpoint working', 'green');
      }
    } catch (e) {
      log('❌ Test endpoint failed', 'red');
    }
    
    // 5. Аналіз та рекомендації
    log('\n🎯 ANALYSIS & RECOMMENDATIONS', 'magenta');
    log('=' .repeat(50), 'magenta');
    
    const recommendations = [];
    
    if (dashboard.health && dashboard.health.errorCount > 0) {
      recommendations.push('🔧 Fix recent errors in the system');
    }
    
    if (dashboard.system && dashboard.system.memory.heapUsed > 100 * 1024 * 1024) {
      recommendations.push('💾 High memory usage detected - consider optimization');
    }
    
    if (dashboard.system && dashboard.system.uptime < 3600) {
      recommendations.push('🔄 System recently restarted - monitor for stability');
    }
    
    if (recommendations.length === 0) {
      log('✅ System is healthy! No issues detected.', 'green');
    } else {
      log('⚠️  Recommendations:', 'yellow');
      recommendations.forEach(rec => log(`  ${rec}`, 'yellow'));
    }
    
  } catch (error) {
    log(`❌ Health check failed: ${error.message}`, 'red');
  }
}

async function monitorInvoiceRequests() {
  log('\n💰 MONITORING INVOICE REQUESTS', 'cyan');
  log('=' .repeat(50), 'cyan');
  
  try {
    const requests = await makeRequest('/invoice-requests');
    
    if (requests.success && requests.data) {
      const pendingRequests = requests.data.filter(req => req.status === 'pending');
      const completedRequests = requests.data.filter(req => req.status === 'completed');
      
      log(`📊 Total Requests: ${requests.data.length}`, 'blue');
      log(`⏳ Pending: ${pendingRequests.length}`, 'yellow');
      log(`✅ Completed: ${completedRequests.length}`, 'green');
      
      if (pendingRequests.length > 0) {
        log('\n⏳ Recent Pending Requests:', 'yellow');
        pendingRequests.slice(-3).forEach(req => {
          log(`  • Task ${req.taskId}: ${req.requesterName}`, 'yellow');
        });
      }
    }
  } catch (error) {
    log(`❌ Invoice monitoring failed: ${error.message}`, 'red');
  }
}

async function main() {
  log('🚀 DTS AUTOMATIC MONITORING SYSTEM', 'cyan');
  log('Starting comprehensive system check...', 'blue');
  
  await checkSystemHealth();
  await monitorInvoiceRequests();
  
  log('\n✅ Monitoring complete!', 'green');
  log('Run this script regularly to monitor system health.', 'blue');
}

// Запуск моніторингу
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkSystemHealth, monitorInvoiceRequests };
