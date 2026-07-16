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
  const { type: _ignoredType, ts: _ignoredTs, ...rest } = payload || {};
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type,
    ...rest,
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

function inferTradeSide(exitEv, entryEv) {
  const raw = exitEv.side || entryEv?.side;
  if (raw === 'short' || raw === 'long') return raw;
  const entry = exitEv.entry ?? entryEv?.entry;
  const sl = entryEv?.stopLoss ?? exitEv.stopLoss;
  if (entry != null && sl != null) {
    return sl > entry ? 'short' : 'long';
  }
  return 'long';
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
        side: inferTradeSide(ev, entry),
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

/** Entries without matching exit (still open). */
function getOpenEntries() {
  const events = readAllEvents();
  const openByKey = new Map();
  for (const ev of events) {
    const key = `${ev.pair}-${ev.openedAt}`;
    const isExit = ev.type === 'exit' || ev.exitReason != null || ev.closedAt != null;
    if (isExit) {
      openByKey.delete(key);
      continue;
    }
    if (ev.type === 'entry') openByKey.set(key, ev);
  }
  return [...openByKey.values()];
}

function dayKeyFromTs(ts) {
  if (ts == null || ts === '') return '';
  const n = Number(ts);
  if (Number.isFinite(n) && n > 1e11) {
    return new Date(n).toISOString().slice(0, 10);
  }
  return String(ts).slice(0, 10);
}

function getTodayClosedPnl(dayKey = new Date().toISOString().slice(0, 10)) {
  return getClosedTrades(500)
    .filter((t) => dayKeyFromTs(t.closedAt) === dayKey)
    .reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0);
}

function getTodayEntryCount(dayKey = new Date().toISOString().slice(0, 10)) {
  return readAllEvents().filter((ev) => {
    if (ev.type !== 'entry') return false;
    return dayKeyFromTs(ev.ts || ev.openedAt) === dayKey;
  }).length;
}

function summarize() {
  const closed = getClosedTrades(500);
  const openEntries = getOpenEntries();
  const wins = closed.filter((t) => (t.pnlUsd ?? 0) > 0).length;
  const losses = closed.filter((t) => (t.pnlUsd ?? 0) <= 0).length;
  const pnl = closed.reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0);
  const dayKey = new Date().toISOString().slice(0, 10);
  return {
    totalClosed: closed.length,
    openCount: openEntries.length,
    openTrades: openEntries,
    wins,
    losses,
    totalPnlUsd: Math.round(pnl * 100) / 100,
    todayPnlUsd: Math.round(getTodayClosedPnl(dayKey) * 100) / 100,
    lastEvents: readRecent(10),
  };
}

function repairMalformedEvents() {
  const events = readAllEvents();
  let fixed = 0;
  const repaired = events.map((ev) => {
    if (ev.type === 'entry' && (ev.exitReason != null || ev.closedAt != null)) {
      fixed += 1;
      const { type: _t, ...rest } = ev;
      return { ...rest, type: 'exit' };
    }
    return ev;
  });
  if (fixed === 0) return 0;
  const body = repaired.map((ev) => JSON.stringify(ev)).join('\n');
  fs.writeFileSync(journalPath(), body ? `${body}\n` : '');
  return fixed;
}

function clearJournal({ backup = true } = {}) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  let backupPath = null;
  const target = journalPath();
  if (backup && fs.existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(DATA_DIR, `trades-backup-${stamp}.jsonl`);
    fs.copyFileSync(target, backupPath);
  }
  fs.writeFileSync(target, '');
  return { backupPath, clearedAt: new Date().toISOString() };
}

module.exports = {
  appendEvent,
  readRecent,
  readAllEvents,
  getClosedTrades,
  getOpenEntries,
  getTodayClosedPnl,
  getTodayEntryCount,
  dayKeyFromTs,
  summarize,
  repairMalformedEvents,
  clearJournal,
};
