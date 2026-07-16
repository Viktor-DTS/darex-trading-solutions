const config = require('../../config');
const { createSimExecutor } = require('./sim');
const { createOandaPaperExecutor } = require('./oandaPaper');
const { createCapitalPaperExecutor } = require('./capitalPaper');

function resolveExecutorMode(cfg = config) {
  const raw = (cfg.executor || 'auto').toLowerCase();
  if (raw === 'sim') return 'sim';
  if (raw === 'oanda') return 'oanda';
  if (raw === 'capital') return 'capital';
  if (raw === 'auto') {
    if (cfg.capital?.apiKey && cfg.capital?.identifier && cfg.capital?.password) {
      return 'capital';
    }
    if (cfg.oanda?.token && cfg.oanda?.accountId && cfg.simulate === false) {
      return 'oanda';
    }
  }
  return 'sim';
}

function createExecutor(options = {}) {
  const cfg = { ...config, ...options };
  const mode = resolveExecutorMode(cfg);
  if (mode === 'capital') {
    return createCapitalPaperExecutor(cfg);
  }
  if (mode === 'oanda') {
    return createOandaPaperExecutor(cfg);
  }
  return createSimExecutor(cfg);
}

module.exports = {
  createExecutor,
  resolveExecutorMode,
};
