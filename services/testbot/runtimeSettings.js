const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../state');

const FILE = 'testbot-runtime.json';

function runtimePath() {
  return path.join(DATA_DIR, FILE);
}

function readRuntimeSettings() {
  try {
    const raw = fs.readFileSync(runtimePath(), 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

/** Merge env/config testbot block with optional runtime overrides (disk). */
function mergeTestbotConfig(baseCfg = {}) {
  const over = readRuntimeSettings();
  const out = { ...baseCfg };
  if (over.invertDirection != null) out.invertDirection = Boolean(over.invertDirection);
  if (over.targetUsd != null && Number.isFinite(Number(over.targetUsd))) {
    out.targetUsd = Number(over.targetUsd);
  }
  if (over.partialUsd != null && Number.isFinite(Number(over.partialUsd))) {
    out.partialUsd = Number(over.partialUsd);
  }
  if (over.maxStopLossUsd != null && Number.isFinite(Number(over.maxStopLossUsd))) {
    out.maxStopLossUsd = Number(over.maxStopLossUsd);
  }
  if (over.minScore != null && Number.isFinite(Number(over.minScore))) {
    out.minScore = Number(over.minScore);
  }
  if (over.enabled != null) out.enabled = Boolean(over.enabled);

  // Quality lock: env TP/SL/score wins over stale Flip runtime ($3/$6 etc.)
  if (process.env.FX_TESTBOT_QUALITY_LOCK === '1') {
    if (baseCfg.minScore != null) out.minScore = baseCfg.minScore;
    if (baseCfg.targetUsd != null) out.targetUsd = baseCfg.targetUsd;
    if (baseCfg.maxStopLossUsd != null) out.maxStopLossUsd = baseCfg.maxStopLossUsd;
    if (baseCfg.partialUsd != null) out.partialUsd = baseCfg.partialUsd;
    if (baseCfg.allowSetupDraft != null) out.allowSetupDraft = baseCfg.allowSetupDraft;
  }
  return out;
}

function writeRuntimeSettings(patch = {}) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const prev = readRuntimeSettings();
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(runtimePath(), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function clearRuntimeSettings() {
  const p = runtimePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return { cleared: true };
}

module.exports = {
  readRuntimeSettings,
  writeRuntimeSettings,
  clearRuntimeSettings,
  mergeTestbotConfig,
};
