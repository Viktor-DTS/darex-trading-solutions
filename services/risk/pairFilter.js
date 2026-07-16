const { normPair } = require('../utils');

function parsePairList(raw) {
  if (!raw) return [];
  const seen = new Set();
  const out = [];
  for (const part of String(raw).split(/[,;\s]+/)) {
    const p = normPair(part);
    if (p.length === 6 && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function filterPairs(pairs, blacklist, whitelist) {
  let out = pairs.map(normPair).filter((p) => p.length === 6);
  if (blacklist?.length) out = out.filter((p) => !blacklist.includes(p));
  if (whitelist?.length) out = out.filter((p) => whitelist.includes(p));
  return out.length ? out : ['EURUSD'];
}

function checkPairAllowed(pair, config) {
  const p = normPair(pair);
  const bl = config.pairBlacklist || [];
  if (bl.includes(p)) return { ok: false, reason: 'pair blacklist' };
  const wl = config.pairWhitelist || [];
  if (wl.length && !wl.includes(p)) return { ok: false, reason: 'not in whitelist' };
  return { ok: true };
}

module.exports = {
  parsePairList,
  filterPairs,
  checkPairAllowed,
};
