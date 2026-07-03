#!/usr/bin/env node
/**
 * Seed data/trades.jsonl with sample round-trips for learning module smoke test.
 * Usage: npm run seed:journal
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../services/state');

const journalPath = path.join(DATA_DIR, 'journal-seed-backup.jsonl');

const TRADES = [
  { score: 78, pips: 8, pnlUsd: 8, exitReason: 'take_profit', regime: 'trend' },
  { score: 74, pips: -5, pnlUsd: -5, exitReason: 'stop', regime: 'trend' },
  { score: 76, pips: -5, pnlUsd: -5, exitReason: 'stop', regime: 'range' },
  { score: 82, pips: 8, pnlUsd: 8, exitReason: 'take_profit', regime: 'trend' },
  { score: 73, pips: -5, pnlUsd: -5, exitReason: 'stop', regime: 'range' },
  { score: 75, pips: -5, pnlUsd: -5, exitReason: 'stop', regime: 'trend' },
  { score: 74, pips: -5, pnlUsd: -5, exitReason: 'stop', regime: 'range' },
  { score: 81, pips: 8, pnlUsd: 8, exitReason: 'take_profit', regime: 'trend' },
  { score: 77, pips: -5, pnlUsd: -5, exitReason: 'stop', regime: 'trend' },
  { score: 76, pips: -5, pnlUsd: -5, exitReason: 'stop', regime: 'range' },
];

function seed() {
  const target = path.join(DATA_DIR, 'trades.jsonl');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(target)) {
    fs.copyFileSync(target, journalPath);
    console.log(`[seed] backup → ${journalPath}`);
  }

  const lines = [];
  const base = Date.now() - TRADES.length * 3600000;
  let t = base;

  for (const spec of TRADES) {
    const openedAt = t;
    const closedAt = t + 120000;
    const entry = 1.085;
    const exit = entry + spec.pips * 0.0001;
    const stopLoss = entry - 0.0005;
    const takeProfit = entry + 0.0008;

    lines.push(JSON.stringify({
      ts: new Date(openedAt).toISOString(),
      type: 'entry',
      pair: 'EURUSD',
      side: 'long',
      openedAt,
      entry,
      stopLoss,
      takeProfit,
      score: spec.score,
      regime: spec.regime,
      stopPips: 5,
      targetPips: 8,
    }));

    lines.push(JSON.stringify({
      ts: new Date(closedAt).toISOString(),
      type: 'exit',
      pair: 'EURUSD',
      openedAt,
      closedAt,
      entry,
      exit,
      stopLoss,
      takeProfit,
      score: spec.score,
      exitReason: spec.exitReason,
      pips: spec.pips,
      pnlUsd: spec.pnlUsd,
    }));

    t += 3600000;
  }

  fs.writeFileSync(target, `${lines.join('\n')}\n`);
  console.log(`[seed] wrote ${TRADES.length} round-trips → ${target}`);
  console.log('[seed] run: npm run learn:dry');
}

seed();
