const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../../state');
const { normPair } = require('../../utils');

function pulsePath() {
  return path.join(DATA_DIR, 'pair_pulse.jsonl');
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * One line per analyze cycle — universe/focus dynamics for panel + KPIs.
 */
function appendPairPulse(payload) {
  ensureDir();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type: 'pulse',
    ...payload,
  });
  fs.appendFileSync(pulsePath(), `${line}\n`);
}

function readPairPulses(limit = 120) {
  try {
    const raw = fs.readFileSync(pulsePath(), 'utf8');
    return raw.trim().split(/\n/).filter(Boolean).map((l) => JSON.parse(l)).slice(-limit);
  } catch (_) {
    return [];
  }
}

/** Unique pairs seen in pulse scan/focus over lookback. */
function uniquePairsInPulse(lookbackMs = 3600000, limit = 200) {
  const cutoff = Date.now() - lookbackMs;
  const set = new Set();
  for (const p of readPairPulses(limit)) {
    const ts = Date.parse(p.ts || 0);
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    for (const pair of p.scan || []) set.add(normPair(pair));
    for (const pair of p.focus || []) set.add(normPair(pair));
    for (const pair of p.promoted || []) set.add(normPair(pair));
  }
  return [...set].filter(Boolean);
}

function prunePairPulse(maxLines = 1500) {
  try {
    if (!fs.existsSync(pulsePath())) return { pruned: false };
    const lines = fs.readFileSync(pulsePath(), 'utf8').trim().split(/\n/).filter(Boolean);
    if (lines.length <= maxLines) return { pruned: false, lines: lines.length };
    const kept = lines.slice(-maxLines);
    fs.writeFileSync(pulsePath(), `${kept.join('\n')}\n`);
    return { pruned: true, removed: lines.length - kept.length, lines: kept.length };
  } catch (e) {
    return { pruned: false, error: e.message };
  }
}

module.exports = {
  appendPairPulse,
  readPairPulses,
  uniquePairsInPulse,
  prunePairPulse,
  pulsePath,
};
