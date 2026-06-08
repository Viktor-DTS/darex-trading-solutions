/**
 * Разовий запуск (розробка): node src/runOnce.js
 * У exe: dts-onec-agent.exe --once
 */
if (!process.argv.includes('--once')) {
  process.argv.push('--once');
}
require('./index.js');
