const { normPair } = require('../../utils');
const { fetchDxySnapshot, usdIsBase, pairHasUsd } = require('../../macro/dxy');
const { prevDayHighLow, asianSessionHighLow } = require('./levels');

/**
 * Daily bias for CHARLIE:
 * - bullish: expect SSL sweep (below level) → long
 * - bearish: expect BSL sweep (above level) → long
 * - neutral: allow both (size may be reduced elsewhere)
 */
function computeDailyBias(pair, barsH1, barsM5, mid, dxy, cfg = {}) {
  const p = normPair(pair);
  let score = 0;
  const reasons = [];

  const pd = prevDayHighLow(barsH1);
  if (pd && Number.isFinite(mid)) {
    const eq = (pd.pdh + pd.pdl) / 2;
    if (mid < eq) {
      score += 1; // discount → bullish bias (expect bounce from SSL)
      reasons.push('PD discount');
    } else if (mid > eq) {
      score -= 1;
      reasons.push('PD premium');
    }
  }

  const asian = asianSessionHighLow(barsM5?.length ? barsM5 : barsH1);
  if (asian && Number.isFinite(mid)) {
    const aEq = (asian.asianHigh + asian.asianLow) / 2;
    if (mid < aEq) {
      score += 1;
      reasons.push('Asian discount');
    } else if (mid > aEq) {
      score -= 1;
      reasons.push('Asian premium');
    }
  }

  if (dxy?.bias && pairHasUsd(p)) {
    const usdBase = usdIsBase(p);
    if (dxy.bias === 'usd_strong') {
      // USD strong → prefer long USD pairs (USD***), short ***USD
      if (usdBase) {
        score += 2;
        reasons.push(`DXY strong → long ${p}`);
      } else {
        score -= 2;
        reasons.push(`DXY strong → short ${p}`);
      }
    } else if (dxy.bias === 'usd_weak') {
      if (usdBase) {
        score -= 2;
        reasons.push(`DXY weak → short ${p}`);
      } else {
        score += 2;
        reasons.push(`DXY weak → long ${p}`);
      }
    }
  }

  let bias = 'neutral';
  if (score >= 2) bias = 'bullish';
  else if (score <= -2) bias = 'bearish';

  return {
    bias,
    score,
    reason: reasons.join('; ') || 'neutral',
    dxyBias: dxy?.bias ?? 'neutral',
  };
}

/**
 * ICT rule: sweep must be opposite to bias.
 * Bullish bias → only long (SSL sweep). Bearish → only short (BSL sweep).
 * Neutral → allow both unless cfg.charlieNeutralSkip.
 */
function biasAllowsSide(dailyBias, side, cfg = {}) {
  if (!dailyBias || dailyBias.bias === 'neutral') {
    if (cfg.charlieNeutralSkip) {
      return { ok: false, reason: 'neutral bias — skip' };
    }
    return { ok: true, reason: 'neutral bias — both sides' };
  }
  if (dailyBias.bias === 'bullish' && side === 'long') {
    return { ok: true, reason: 'bullish bias → SSL long' };
  }
  if (dailyBias.bias === 'bearish' && side === 'short') {
    return { ok: true, reason: 'bearish bias → BSL short' };
  }
  return {
    ok: false,
    reason: `bias ${dailyBias.bias} blocks ${side}`,
  };
}

async function loadDxyCached(cache = { at: 0, data: null }, ttlMs = 300000) {
  if (cache.data && Date.now() - cache.at < ttlMs) return cache.data;
  const data = await fetchDxySnapshot();
  cache.at = Date.now();
  cache.data = data;
  return data;
}

module.exports = {
  computeDailyBias,
  biasAllowsSide,
  loadDxyCached,
};
