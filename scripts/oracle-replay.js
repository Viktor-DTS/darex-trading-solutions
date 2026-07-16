#!/usr/bin/env node
/**
 * Offline replay: would ORACLE-5 gate have allowed testbot entries?
 * Usage: node scripts/oracle-replay.js [--journal data/testbot-trades.jsonl] [--limit 200]
 */

require('dotenv').config();
const path = require('path');
const config = require('../config');
const { readAllEvents } = require('../services/testbot/journal');
const { forecastOracle5m } = require('../services/oracle/oracle5m');
const { oracleGateAllows } = require('../services/oracle/gate');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { limit: 200 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--journal') out.journal = args[++i];
    else if (args[i] === '--limit') out.limit = Number(args[++i]) || 200;
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const fileName = args.journal || config.testbot?.journalFile || 'testbot-trades.jsonl';
  const events = readAllEvents(fileName).slice(-args.limit * 2);
  const entries = events.filter((e) => e.type === 'entry');

  const oracleCfg = {
    ...(config.oracle || {}),
    logForecasts: false,
    testbotJournalFile: fileName,
  };

  let allowed = 0;
  let blocked = 0;
  const blockReasons = {};
  const byPair = {};

  for (const entry of entries) {
    const pair = entry.pair;
    if (!byPair[pair]) byPair[pair] = { allowed: 0, blocked: 0 };

    const analysis = {
      pair,
      side: entry.side,
      action: entry.side === 'short' ? 'SELL' : 'BUY',
      entry: entry.entry,
      stopLoss: entry.stopLoss,
      takeProfit: entry.takeProfit,
      testbotInverted: entry.testbotInverted,
      testbotSignalAction: entry.testbotSignalAction,
    };

    const oracle = forecastOracle5m({
      pair,
      quote: { mid: entry.entry, spreadPips: 1.2 },
      barsM5: null,
      analysis,
      cfg: oracleCfg,
    });

    if (!oracle.ok) {
      blocked += 1;
      byPair[pair].blocked += 1;
      const r = oracle.reason || 'oracle fail';
      blockReasons[r] = (blockReasons[r] || 0) + 1;
      continue;
    }

    const gate = oracleGateAllows(oracle, analysis, oracleCfg);
    if (gate.ok) {
      allowed += 1;
      byPair[pair].allowed += 1;
    } else {
      blocked += 1;
      byPair[pair].blocked += 1;
      const r = gate.reason || 'gate fail';
      blockReasons[r] = (blockReasons[r] || 0) + 1;
    }
  }

  console.log('ORACLE replay');
  console.log('Journal:', path.join(__dirname, '../data', fileName));
  console.log('Entries:', entries.length);
  console.log('Allowed:', allowed);
  console.log('Blocked:', blocked);
  console.log('\nBlock reasons:');
  for (const [r, n] of Object.entries(blockReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}× ${r}`);
  }
  console.log('\nBy pair:');
  for (const [p, row] of Object.entries(byPair).sort((a, b) => (b[1].blocked + b[1].allowed) - (a[1].blocked + a[1].allowed))) {
    console.log(`  ${p}: allow=${row.allowed} block=${row.blocked}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
