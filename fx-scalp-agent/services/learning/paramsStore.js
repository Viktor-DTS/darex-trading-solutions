const path = require('path');
const { DATA_DIR } = require('../state');
const LEARNED_PATH = path.join(DATA_DIR, 'learned-params.json');

const DEFAULTS = {
  minBuyScore: 72,
  stopPips: 5,
  targetPips: 8,
  tradingPaused: false,
  pauseReason: '',
  version: 0,
  updatedAt: null,
  lastReport: null,
};

function readLearnedParams() {
  try {
    const raw = require('fs').readFileSync(LEARNED_PATH, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function writeLearnedParams(params) {
  const fs = require('fs');
  const dir = require('path').dirname(LEARNED_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const prev = readLearnedParams();
  const doc = {
    ...prev,
    ...params,
    updatedAt: new Date().toISOString(),
    version: (prev.version || 0) + 1,
  };
  fs.writeFileSync(LEARNED_PATH, JSON.stringify(doc, null, 2));
  return doc;
}

/** Merge base config with learned overrides for analyzer/worker. */
function getEffectiveConfig(baseConfig) {
  const learned = readLearnedParams();
  return {
    ...baseConfig,
    stopPips: learned.stopPips ?? baseConfig.stopPips,
    targetPips: learned.targetPips ?? baseConfig.targetPips,
    minBuyScore: learned.minBuyScore ?? 72,
    learned,
  };
}

module.exports = {
  readLearnedParams,
  writeLearnedParams,
  getEffectiveConfig,
  LEARNED_PATH,
  DEFAULTS,
};
