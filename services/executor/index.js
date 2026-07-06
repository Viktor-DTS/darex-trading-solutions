const config = require('../../config');
const { createSimExecutor } = require('./sim');
const { createOandaPaperExecutor } = require('./oandaPaper');

function resolveExecutorMode(cfg = config) {
  const raw = (cfg.executor || 'auto').toLowerCase();
  if (raw === 'sim') return 'sim';
  if (raw === 'oanda') return 'oanda';
  if (cfg.oanda?.token && cfg.oanda?.accountId && cfg.simulate === false) {
    return 'oanda';
  }
  return 'sim';
}

function createExecutor(options = {}) {
  const cfg = { ...config, ...options };
  const mode = resolveExecutorMode(cfg);
  if (mode === 'oanda') {
    return createOandaPaperExecutor(cfg);
  }
  return createSimExecutor(cfg);
}

module.exports = {
  createExecutor,
  resolveExecutorMode,
};
