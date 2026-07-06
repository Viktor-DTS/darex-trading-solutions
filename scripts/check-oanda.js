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
    console.log('  FX_OANDA_ACCOUNT=...');
    console.log('  FX_OANDA_ENV=practice');
    console.log('  FX_SIMULATE=0');
    console.log('  FX_EXECUTOR=oanda');
    console.log('  FX_DATA_PROVIDER=oanda');
    process.exit(1);
  }

  const summary = await client.getAccountSummary();
  const acct = summary.account || {};
  console.log('\nOK — connected to OANDA practice/live API');
  console.log('Balance:', acct.balance, acct.currency);
  console.log('Open trades:', acct.openTradeCount);
  console.log('Unrealized P/L:', acct.unrealizedPL);
}

main().catch((e) => {
  console.error('[oanda:check]', e.message);
  process.exit(1);
});
