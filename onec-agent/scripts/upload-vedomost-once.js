/**
 * Разове завантаження файлу «Ведомость» у DTS (без емуляції 1С).
 *
 * Usage:
 *   node scripts/upload-vedomost-once.js "<path-to.xlsx>" [config.json]
 *
 * Пароль: у config.json (dts.password) або змінна DTS_PASSWORD.
 */
const fs = require('fs');
const path = require('path');
const { uploadVedomost } = require('../src/dtsClient');

async function main() {
  const filePath = process.argv[2];
  const configPath =
    process.argv[3] || path.join(__dirname, '..', 'config.server.json');

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: node scripts/upload-vedomost-once.js "<path-to.xlsx>" [config.json]');
    process.exit(1);
  }
  if (!fs.existsSync(configPath)) {
    console.error('Config not found:', configPath);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const dts = { ...config.dts };
  if (process.env.DTS_PASSWORD) dts.password = process.env.DTS_PASSWORD;
  if (!dts.password || dts.password.includes('REPLACE')) {
    console.error('Вкажіть dts.password у config або змінну DTS_PASSWORD');
    process.exit(1);
  }

  console.log('Uploading', path.basename(filePath), '→', dts.apiBaseUrl);
  const summary = await uploadVedomost(dts, filePath, 'manual');
  console.log('OK');
  console.log('  movements parsed:', summary.movementsParsed);
  console.log('  inserted:', summary.movements?.inserted);
  console.log('  updated:', summary.movements?.updated);
  console.log('  duplicates:', summary.movements?.duplicates);
  console.log('  maxDocDate:', summary.maxDocDate);
  console.log('  maxDocDate move:', summary.maxDocDateByType?.move);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
