const { fetchYahooBars } = require('../market-data/yahooFx');
const { ema } = require('../analyzer/indicators');
const { normPair, round } = require('../utils');

function parseCurrencies(pair) {
  const p = normPair(pair);
  return { base: p.slice(0, 3), quote: p.slice(3, 6) };
}

function pairHasUsd(pair) {
  const { base, quote } = parseCurrencies(pair);
  return base === 'USD' || quote === 'USD';
}

function usdIsBase(pair) {
  return parseCurrencies(pair).base === 'USD';
}

async function fetchDxySnapshot() {
  try {
    const chart = await fetchYahooBars('DX-Y.NYB', '1h', '5d', 20);
    const closes = chart.bars.map((b) => b.close);
    const price = chart.mid ?? closes[closes.length - 1];
    const prev = closes.length > 2 ? closes[closes.length - 2] : price;
    const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    const ema20 = ema(closes, 20);

    let bias = 'neutral';
    if (ema20 != null) {
      if (price >= ema20) bias = 'usd_strong';
      else bias = 'usd_weak';
    } else if (changePct > 0.03) bias = 'usd_strong';
    else if (changePct < -0.03) bias = 'usd_weak';

    return {
      symbol: 'DXY',
      price: round(price, 3),
      ema20: ema20 != null ? round(ema20, 3) : null,
      changePct: round(changePct, 3),
      bias,
      source: chart.source,
    };
  } catch (e) {
    return { symbol: 'DXY', error: e.message, bias: 'neutral' };
  }
}

/** Block long when macro USD bias conflicts with pair structure. */
function dxyBlocksLong(dxy, pair) {
  if (!dxy || dxy.bias === 'neutral') return { blocked: false, reason: '' };
  if (!pairHasUsd(pair)) return { blocked: false, reason: '' };

  const p = normPair(pair);
  if (usdIsBase(p)) {
    if (dxy.bias === 'usd_weak') {
      return {
        blocked: true,
        reason: `DXY weak (${dxy.changePct}%, 1h) — ${p} long USD проти macro`,
      };
    }
  } else if (dxy.bias === 'usd_strong') {
    return {
      blocked: true,
      reason: `DXY strong (+${dxy.changePct}%, 1h) — ${p} long проти USD`,
    };
  }
  return { blocked: false, reason: '' };
}

/** Block short when macro USD bias conflicts with pair structure. */
function dxyBlocksShort(dxy, pair) {
  if (!dxy || dxy.bias === 'neutral') return { blocked: false, reason: '' };
  if (!pairHasUsd(pair)) return { blocked: false, reason: '' };

  const p = normPair(pair);
  if (usdIsBase(p)) {
    if (dxy.bias === 'usd_strong') {
      return {
        blocked: true,
        reason: `DXY strong (+${dxy.changePct}%, 1h) — ${p} short USD проти macro`,
      };
    }
  } else if (dxy.bias === 'usd_weak') {
    return {
      blocked: true,
      reason: `DXY weak (${dxy.changePct}%, 1h) — ${p} short проти USD`,
    };
  }
  return { blocked: false, reason: '' };
}

module.exports = {
  fetchDxySnapshot,
  dxyBlocksLong,
  dxyBlocksShort,
  parseCurrencies,
  pairHasUsd,
  usdIsBase,
};
