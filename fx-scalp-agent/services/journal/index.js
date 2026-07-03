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

function readRecent(limit = 50) {
  try {
    const raw = fs.readFileSync(journalPath(), 'utf8');
    const lines = raw.trim().split(/\n/).filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch (_) {
    return [];
  }
}

function summarize() {
  const events = readRecent(500);
  const closed = events.filter((e) => e.type === 'exit');
  const wins = closed.filter((e) => (e.pnlUsd ?? 0) > 0).length;
  const losses = closed.filter((e) => (e.pnlUsd ?? 0) <= 0).length;
  const pnl = closed.reduce((s, e) => s + (Number(e.pnlUsd) || 0), 0);
  return {
    totalClosed: closed.length,
    wins,
    losses,
    totalPnlUsd: Math.round(pnl * 100) / 100,
    lastEvents: events.slice(-10),
  };
}

module.exports = {
  appendEvent,
  readRecent,
  summarize,
};
