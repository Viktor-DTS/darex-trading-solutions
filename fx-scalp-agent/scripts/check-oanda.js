#!/usr/bin/env node
require('dotenv').config();
const config = require('../config');
const { OandaClient } = require('../services/executor/oandaClient');
const { resolveExecutorMode } = require('../services/executor');

async function main() {
  const mode = resolveExecutorMode(config);
  console.log('FX_EXECUTOR mode:', mode);
  console.log('OANDA env:', config.oanda.env);
  console.log('Account:', config.oanda.accountId || '(not set)');

  const client = new OandaClient(config);
  if (!client.configured) {
    console.log('\nOANDA not configured. Add to .env:');
    console.log('  FX_OANDA_TOKEN=...');
    console.log('  FX_OANDA_ACCOUNT=101-004-XXXXXXX-001');
    console.log('  FX_OANDA_ENV=practice');
    console.log('  FX_EXECUTOR=oanda');
    console.log('  FX_DATA_PROVIDER=yahoo   # 40 пар: дані з Yahoo, виконання OANDA');
    process.exit(1);
  }

  const summary = await client.getAccountSummary();
  const acct = summary.account || {};
  console.log('\nOK — connected to OANDA practice/live API');
  console.log('Balance:', acct.balance, acct.currency);
  console.log('Margin available:', acct.marginAvailable);
  console.log('Open trades:', acct.openTradeCount);
  console.log('Unrealized P/L:', acct.unrealizedPL);
  console.log('\nНаступне: FX_EXECUTOR=oanda → перезапуск worker. Дивись /oanda/status.');
}

main().catch((e) => {
  console.error('[oanda:check]', e.message);
  process.exit(1);
});
