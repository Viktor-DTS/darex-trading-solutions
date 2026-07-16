const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../../state');

function setupsPath() {
  return path.join(DATA_DIR, 'charlie_setups.jsonl');
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Shadow log every CHARLIE analysis (BUY/SELL/SKIP/WATCH).
 * Enables missed-opportunity and filter calibration later.
 */
function appendCharlieSetup(payload) {
  ensureDir();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type: 'setup',
    ...payload,
  });
  fs.appendFileSync(setupsPath(), `${line}\n`);
}

function readCharlieSetups(limit = 200) {
  try {
    const raw = fs.readFileSync(setupsPath(), 'utf8');
    const all = raw.trim().split(/\n/).filter(Boolean).map((l) => JSON.parse(l));
    return all.slice(-limit);
  } catch (_) {
    return [];
  }
}

/**
 * Stable id for one concrete sweep (level + sweep bar), not the whole day on that level.
 * sweepKey: minute bucket of sweep bar ts, or absolute M5 index.
 */
function charlieSetupId(pair, levelPrice, dayKey, sweepKey = null) {
  const px = levelPrice != null ? Number(levelPrice).toFixed(5) : 'na';
  const sw = sweepKey != null && sweepKey !== '' ? String(sweepKey) : 'na';
  return `${pair}|${dayKey}|${px}|${sw}`;
}

function sweepKeyFromSignal(signal) {
  const ts = signal?.sweepBar?.ts;
  if (Number.isFinite(ts)) return Math.floor(ts / 60000);
  if (Number.isFinite(signal?.absoluteSweepIdx)) return `i${signal.absoluteSweepIdx}`;
  return null;
}

const recentSetupIds = new Map(); // id → ts

function isDuplicateSetup(setupId, ttlMs = 45 * 60 * 1000) {
  const prev = recentSetupIds.get(setupId);
  if (prev && Date.now() - prev < ttlMs) return true;
  return false;
}

/** Call only after executor actually opens — rejected opens must not burn the setup. */
function markSetupUsed(setupId, ttlMs = 45 * 60 * 1000) {
  if (!setupId) return;
  recentSetupIds.set(setupId, Date.now());
  if (recentSetupIds.size > 200) {
    const cutoff = Date.now() - ttlMs;
    for (const [k, v] of recentSetupIds) {
      if (v < cutoff) recentSetupIds.delete(k);
    }
  }
}

module.exports = {
  appendCharlieSetup,
  readCharlieSetups,
  charlieSetupId,
  sweepKeyFromSignal,
  isDuplicateSetup,
  markSetupUsed,
  setupsPath,
};
