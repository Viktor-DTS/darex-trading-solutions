const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../state');

function journalPath(fileName = 'testbot-trades.jsonl') {
  return path.join(DATA_DIR, fileName);
}

function appendTestbotEvent(type, payload, fileName) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const { type: _ignoredType, ts: _ignoredTs, ...rest } = payload || {};
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type,
    botKind: 'testbot',
    ...rest,
  });
  fs.appendFileSync(journalPath(fileName), `${line}\n`);
}

function readAllEvents(fileName) {
  try {
    const raw = fs.readFileSync(journalPath(fileName), 'utf8');
    return raw.trim().split(/\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch (_) {
    return [];
  }
}

function dayKeyFromTs(ts) {
  if (ts == null || ts === '') return '';
  const n = Number(ts);
  if (Number.isFinite(n) && n > 1e11) {
    return new Date(n).toISOString().slice(0, 10);
  }
  return String(ts).slice(0, 10);
}

function getClosedTrades(limit = 500, fileName) {
  const events = readAllEvents(fileName).slice(-limit * 2);
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
        side: ev.side || entry.side,
        openedAt: ev.openedAt,
        closedAt: ev.closedAt,
        entry: ev.entry ?? entry.entry,
        exit: ev.exit,
        exitReason: ev.exitReason,
        pips: ev.pips,
        pnlUsd: ev.pnlUsd,
        durationMs: (ev.closedAt || 0) - (ev.openedAt || 0),
        score: entry.score ?? ev.score,
      });
      openByKey.delete(key);
    }
  }
  return trades;
}

function getOpenEntries(fileName) {
  const events = readAllEvents(fileName);
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

function getTodayClosedPnl(dayKey = new Date().toISOString().slice(0, 10), fileName) {
  return getClosedTrades(500, fileName)
    .filter((t) => dayKeyFromTs(t.closedAt) === dayKey)
    .reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0);
}

function getTodayEntryCount(dayKey = new Date().toISOString().slice(0, 10), fileName) {
  return readAllEvents(fileName).filter((ev) => {
    if (ev.type !== 'entry') return false;
    return dayKeyFromTs(ev.ts || ev.openedAt) === dayKey;
  }).length;
}

function summarize(fileName) {
  const closed = getClosedTrades(500, fileName);
  const openEntries = getOpenEntries(fileName);
  const wins = closed.filter((t) => (t.pnlUsd ?? 0) > 0).length;
  const losses = closed.filter((t) => (t.pnlUsd ?? 0) <= 0).length;
  const pnl = closed.reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0);
  const dayKey = new Date().toISOString().slice(0, 10);
  return {
    totalClosed: closed.length,
    openCount: openEntries.length,
    wins,
    losses,
    totalPnlUsd: Math.round(pnl * 100) / 100,
    todayPnlUsd: Math.round(getTodayClosedPnl(dayKey, fileName) * 100) / 100,
    todayEntries: getTodayEntryCount(dayKey, fileName),
    lastEvents: readAllEvents(fileName).slice(-12),
  };
}

function clearTestbotJournal(fileName = 'testbot-trades.jsonl', { backup = true } = {}) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  let backupPath = null;
  const target = journalPath(fileName);
  if (backup && fs.existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(DATA_DIR, `testbot-trades-backup-${stamp}.jsonl`);
    fs.copyFileSync(target, backupPath);
  }
  fs.writeFileSync(target, '');
  return { backupPath, clearedAt: new Date().toISOString(), fileName };
}

module.exports = {
  appendTestbotEvent,
  readAllEvents,
  getClosedTrades,
  getOpenEntries,
  getTodayClosedPnl,
  getTodayEntryCount,
  summarize,
  clearTestbotJournal,
};
