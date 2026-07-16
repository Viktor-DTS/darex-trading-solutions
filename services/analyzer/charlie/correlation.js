const { normPair } = require('../../utils');
const { parseCurrencies } = require('../../macro/dxy');

/** Currency clusters for CHARLIE correlation cap. */
const CLUSTERS = {
  EUR: ['EURUSD', 'EURGBP', 'EURJPY', 'EURAUD', 'EURCHF', 'EURCAD', 'EURNZD'],
  GBP: ['GBPUSD', 'EURGBP', 'GBPJPY', 'GBPAUD', 'GBPCHF', 'GBPCAD', 'GBPNZD'],
  JPY: ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY'],
  USD: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'],
};

function pairClusterKeys(pair) {
  const p = normPair(pair);
  const keys = [];
  for (const [cluster, members] of Object.entries(CLUSTERS)) {
    if (members.includes(p) || parseCurrencies(p).base === cluster || parseCurrencies(p).quote === cluster) {
      if (['EUR', 'GBP', 'JPY', 'USD'].includes(cluster)) keys.push(cluster);
    }
  }
  // Always include base/quote as soft clusters
  const { base, quote } = parseCurrencies(p);
  if (!keys.includes(base) && ['EUR', 'GBP', 'JPY', 'USD', 'AUD', 'CAD', 'CHF', 'NZD'].includes(base)) {
    keys.push(base);
  }
  if (!keys.includes(quote) && ['EUR', 'GBP', 'JPY', 'USD', 'AUD', 'CAD', 'CHF', 'NZD'].includes(quote)) {
    keys.push(quote);
  }
  return [...new Set(keys)];
}

/**
 * Max 1 open trade per hard cluster (EUR, GBP) by default.
 * USD can allow cfg.charlieMaxUsdCluster (default 2).
 */
function checkCharlieCorrelation(openTrades, candidatePair, cfg = {}) {
  const maxEur = cfg.charlieMaxClusterEur ?? 1;
  const maxGbp = cfg.charlieMaxClusterGbp ?? 1;
  const maxJpy = cfg.charlieMaxClusterJpy ?? 1;
  const maxUsd = cfg.charlieMaxClusterUsd ?? 2;
  const limits = { EUR: maxEur, GBP: maxGbp, JPY: maxJpy, USD: maxUsd };

  const candKeys = pairClusterKeys(candidatePair);
  const opens = openTrades || [];

  for (const key of candKeys) {
    const limit = limits[key];
    if (limit == null) continue;
    const count = opens.filter((t) => pairClusterKeys(t.pair).includes(key)).length;
    if (count >= limit) {
      return {
        blocked: true,
        reason: `CHARLIE cluster ${key} limit ${limit} (open ${count})`,
        cluster: key,
      };
    }
  }
  return { blocked: false, reason: '' };
}

module.exports = {
  CLUSTERS,
  pairClusterKeys,
  checkCharlieCorrelation,
};
