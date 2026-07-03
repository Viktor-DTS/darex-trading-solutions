const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../state');

function journalPath() {
  return path.join(DATA_DIR, 'trades.jsonl');
}

function appendEvent(type, payload) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type,
    ...payload,
  });
  fs.appendFileSync(journalPath(), `${line}\n`);
}

function readAllEvents() {
  try {
    const raw = fs.readFileSync(journalPath(), 'utf8');
    return raw.trim().split(/\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch (_) {
    return [];
  }
}

function readRecent(limit = 50) {
  const all = readAllEvents();
  return all.slice(-limit);
}

/** Pair entry + exit into round-trip trades. */
function getClosedTrades(limit = 500) {
  const events = readAllEvents().slice(-limit * 2);
  const trades = [];
  const openByKey = new Map();

  for (const ev of events) {
    if (ev.type === 'entry') {
      openByKey.set(`${ev.pair}-${ev.openedAt}`, ev);
    }
    if (ev.type === 'exit') {
      const key = `${ev.pair}-${ev.openedAt}`;
      const entry = openByKey.get(key) || {};
      trades.push({
        pair: ev.pair,
        openedAt: ev.openedAt,
        closedAt: ev.closedAt,
        entry: ev.entry ?? entry.entry,
        exit: ev.exit,
        stopLoss: entry.stopLoss ?? ev.stopLoss,
        takeProfit: entry.takeProfit ?? ev.takeProfit,
        score: entry.score ?? ev.score,
        regime: entry.regime ?? ev.regime,
        exitReason: ev.exitReason,
        pips: ev.pips,
        pnlUsd: ev.pnlUsd,
        durationMs: (ev.closedAt || 0) - (ev.openedAt || 0),
      });
      openByKey.delete(key);
    }
  }
  return trades;
}

function summarize() {
  const closed = getClosedTrades(500);
  const wins = closed.filter((t) => (t.pnlUsd ?? 0) > 0).length;
  const losses = closed.filter((t) => (t.pnlUsd ?? 0) <= 0).length;
  const pnl = closed.reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0);
  return {
    totalClosed: closed.length,
    wins,
    losses,
    totalPnlUsd: Math.round(pnl * 100) / 100,
    lastEvents: readRecent(10),
  };
}

module.exports = {
  appendEvent,
  readRecent,
  readAllEvents,
  getClosedTrades,
  summarize,
};
