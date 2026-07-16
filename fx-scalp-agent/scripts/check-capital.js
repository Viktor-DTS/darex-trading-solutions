#!/usr/bin/env node
require('dotenv').config();
const config = require('../config');
const { CapitalClient } = require('../services/executor/capitalClient');
const { computeCapitalSize } = require('../services/executor/capitalPaper');
const { resolveExecutorMode } = require('../services/executor');

async function main() {
  const mode = resolveExecutorMode(config);
  console.log('FX_EXECUTOR mode:', mode);
  console.log('Capital env:', config.capital.env);
  console.log('Identifier:', config.capital.identifier || '(not set)');

  const client = new CapitalClient(config);
  if (!client.configured) {
    console.log('\nCapital.com не налаштовано. Додай у .env (або Render):');
    console.log('  FX_CAPITAL_API_KEY=...          # Settings > API integrations > Generate key');
    console.log('  FX_CAPITAL_IDENTIFIER=you@mail   # email від акаунта');
    console.log('  FX_CAPITAL_PASSWORD=...          # custom API password (не логін!)');
    console.log('  FX_CAPITAL_ENV=demo              # demo | live');
    console.log('  FX_EXECUTOR=capital');
    console.log('  FX_DATA_PROVIDER=capital        # ті самі bid/ask що при угоді (рекомендовано)');
    process.exit(1);
  }

  await client.authenticate();
  console.log('\nOK — сесія відкрита (CST + X-SECURITY-TOKEN отримано)');

  const acct = await client.getAccountSummary();
  console.log('Account:', acct.accountId, acct.currency);
  console.log('Balance:', acct.balance, ' Available:', acct.available, ' P/L:', acct.profitLoss);

  // Калібрування розміру: показуємо epic + dealing rules для кількох пар
  const pairs = (config.pairs || ['EURUSD', 'GBPUSD', 'USDJPY']).slice(0, 3);
  console.log('\nРинки (для калібрування розміру):');
  for (const pair of pairs) {
    try {
      const epic = await client.resolveEpic(pair);
      if (!epic) {
        console.log(`  ${pair}: epic не знайдено`);
        continue;
      }
      const details = await client.getMarketDetails(epic);
      const rules = details.dealingRules || {};
      const lotSize = details.instrument?.lotSize;
      const min = rules.minDealSize?.value;
      const size = computeCapitalSize(100000, details, config);
      console.log(
        `  ${pair} -> epic=${epic} lotSize=${lotSize} minDealSize=${min}`
        + ` | 1 lot(100k units) => size≈${size}`,
      );
    } catch (e) {
      console.log(`  ${pair}: ${e.message}`);
    }
  }

  console.log('\nНаступне: FX_EXECUTOR=capital → перезапуск worker. Дивись /capital/status.');
}

main().catch((e) => {
  console.error('[capital:check]', e.message);
  process.exit(1);
});
