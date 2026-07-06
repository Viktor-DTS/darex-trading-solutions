const { normPair, round } = require('../utils');
const { parseCurrencies, pairHasUsd, usdIsBase } = require('./dxy');
const { isJpyCross } = require('./jpyBias');
const { CURRENCY_FACTOR_WEIGHTS, FACTOR_LABELS } = require('./factorWeights');

/** Map Yahoo bias strings to directional strength −1..+1 (positive = bullish that asset). */
function biasSigned(bias) {
  if (!bias) return 0;
  const b = String(bias).toLowerCase();
  if (b === 'up' || b === 'usd_strong' || b === 'jpy_weak' || b === 'risk_on') return 1;
  if (b === 'down' || b === 'usd_weak' || b === 'jpy_strong' || b === 'risk_off') return -1;
  return 0;
}

function factorFromMacro(macro, key) {
  if (!macro) return { signed: 0, label: key, detail: 'n/a' };
  switch (key) {
    case 'dxy':
      return { signed: biasSigned(macro.dxy?.bias === 'usd_strong' ? 'up' : macro.dxy?.bias === 'usd_weak' ? 'down' : 'neutral'), label: 'DXY', detail: macro.dxy?.bias || 'neutral' };
    case 'dxyInverse':
      return { signed: -biasSigned(macro.dxy?.bias === 'usd_strong' ? 'up' : macro.dxy?.bias === 'usd_weak' ? 'down' : 'neutral'), label: 'Anti-USD', detail: macro.dxy?.bias || 'neutral' };
    case 'yields':
      return { signed: biasSigned(macro.yields?.bias), label: 'US10Y', detail: macro.yields?.bias || 'neutral' };
    case 'yieldsInverse':
      return { signed: -biasSigned(macro.yields?.bias), label: 'US10Y→EUR', detail: macro.yields?.bias || 'neutral' };
    case 'risk':
      return { signed: macro.risk === 'risk_on' ? 1 : macro.risk === 'risk_off' ? -1 : 0, label: 'Risk', detail: macro.risk || 'neutral' };
    case 'riskOff':
      return { signed: macro.risk === 'risk_off' ? 1 : macro.risk === 'risk_on' ? -1 : 0, label: 'Haven', detail: macro.risk || 'neutral' };
    case 'gold':
      return { signed: biasSigned(macro.gold?.bias), label: 'Gold', detail: macro.gold?.bias || 'neutral' };
    case 'spy':
      return { signed: biasSigned(macro.spy?.bias), label: 'SPY', detail: macro.spy?.bias || 'neutral' };
    case 'vix':
      return { signed: biasSigned(macro.vix?.bias), label: 'VIX', detail: macro.vix?.bias || 'neutral' };
    case 'usdjpy':
      return { signed: macro.jpy?.bias === 'jpy_weak' ? -1 : macro.jpy?.bias === 'jpy_strong' ? 1 : 0, label: 'JPY', detail: macro.jpy?.bias || 'neutral' };
    case 'china':
      return { signed: biasSigned(macro.china?.bias), label: 'China', detail: macro.china?.bias || 'neutral' };
    case 'audnzd':
      return { signed: biasSigned(macro.audnzd?.bias), label: 'AUDNZD', detail: macro.audnzd?.bias || 'neutral' };
    case 'audnzdInverse':
      return { signed: -biasSigned(macro.audnzd?.bias), label: 'NZD vs AUD', detail: macro.audnzd?.bias || 'neutral' };
    case 'oil':
      return { signed: biasSigned(macro.oil?.bias), label: 'Oil', detail: macro.oil?.bias || 'neutral' };
    default:
      return { signed: 0, label: key, detail: 'unknown' };
  }
}

/** Currency strength 0..100 (50 = neutral). */
function computeCurrencyStrength(ccy, macro) {
  const weights = CURRENCY_FACTOR_WEIGHTS[ccy];
  if (!weights || !macro) {
    return { ccy, score: 50, signed: 0, factors: [] };
  }

  let weighted = 0;
  let totalW = 0;
  const factors = [];

  for (const [key, w] of Object.entries(weights)) {
    const f = factorFromMacro(macro, key);
    weighted += f.signed * w;
    totalW += w;
    factors.push({
      key,
      label: FACTOR_LABELS[key] || key,
      weight: w,
      signed: f.signed,
      detail: f.detail,
      contribution: round(f.signed * w * 50, 1),
    });
  }

  const signed = totalW > 0 ? weighted / totalW : 0;
  let score = Math.round(50 + signed * 50);

  const calBias = macro.calendar?.currencyBias?.[ccy];
  if (calBias && calBias.signed !== 0) {
    const calW = 0.22;
    const calSigned = calBias.signed;
    const calContribution = calSigned * calW * 50;
    factors.push({
      key: 'calendar',
      label: 'CPI/NFP surprise',
      weight: calW,
      signed: calSigned,
      detail: calBias.events?.map((e) => e.title).join(', ') || 'news',
      contribution: round(calContribution, 1),
    });
    score = Math.round(Math.max(0, Math.min(100, score + calContribution)));
  }

  return { ccy, score, signed: round(signed, 3), factors };
}

function hardBlock(pair, side, macro) {
  if (!macro) return null;

  const p = normPair(pair);
  const { base, quote } = parseCurrencies(p);

  if (side === 'long' && pairHasUsd(p)) {
    if (usdIsBase(p) && macro.dxy?.bias === 'usd_weak') {
      return `DXY weak — long ${p} (USD base)`;
    }
    if (!usdIsBase(p) && macro.dxy?.bias === 'usd_strong') {
      return `DXY strong — long ${p} проти USD`;
    }
  }
  if (side === 'short' && pairHasUsd(p)) {
    if (usdIsBase(p) && macro.dxy?.bias === 'usd_strong') {
      return `DXY strong — short ${p} (USD base)`;
    }
    if (!usdIsBase(p) && macro.dxy?.bias === 'usd_weak') {
      return `DXY weak — short ${p} проти USD`;
    }
  }

  if (isJpyCross(p)) {
    if (side === 'long' && macro.jpy?.bias === 'jpy_weak') {
      return `USDJPY↑ — long ${p} проти JPY`;
    }
    if (side === 'short' && macro.jpy?.bias === 'jpy_strong') {
      return `USDJPY↓ — short ${p} проти JPY`;
    }
  }

  if (side === 'long' && (base === 'AUD' || base === 'NZD') && macro.risk === 'risk_off') {
    return 'VIX↑ risk-off — long AUD/NZD';
  }
  if (side === 'short' && (base === 'AUD' || base === 'NZD') && macro.risk === 'risk_on') {
    return 'risk-on — short AUD/NZD';
  }
  if (side === 'long' && base === 'CAD' && macro.oil?.bias === 'down') {
    return 'Oil↓ — long CAD';
  }
  if (side === 'short' && base === 'CAD' && macro.oil?.bias === 'up') {
    return 'Oil↑ — short CAD';
  }

  if (side === 'long' && base === 'CHF' && macro.risk === 'risk_on' && macro.gold?.bias === 'down') {
    return 'risk-on + gold↓ — weak CHF long';
  }
  if (side === 'short' && quote === 'CHF' && macro.risk === 'risk_off' && macro.gold?.bias === 'up') {
    return 'haven + gold↑ — short проти CHF';
  }

  return null;
}

/**
 * Pair fundamental edge for a side.
 * Long = base should be stronger than quote; short = opposite.
 */
function evaluatePairFundamentals(pairInput, side, macro) {
  const pair = normPair(pairInput);
  const { base, quote } = parseCurrencies(pair);

  const blockReason = hardBlock(pair, side, macro);
  if (blockReason) {
    return {
      aligned: false,
      score: 0,
      reason: blockReason,
      edge: 0,
      baseStrength: null,
      quoteStrength: null,
      factors: [],
      blocked: true,
    };
  }

  const baseS = computeCurrencyStrength(base, macro);
  const quoteS = computeCurrencyStrength(quote, macro);
  const edgeSigned = side === 'long'
    ? baseS.signed - quoteS.signed
    : quoteS.signed - baseS.signed;

  const edgeScore = Math.round(50 + edgeSigned * 50);
  const aligned = edgeSigned >= -0.05;
  const minEdge = 0.08;
  const strong = edgeSigned >= minEdge;

  const topFactors = [
    ...baseS.factors.map((f) => ({ ...f, ccy: base, role: 'base' })),
    ...quoteS.factors.map((f) => ({ ...f, ccy: quote, role: 'quote', signed: -f.signed, contribution: -f.contribution })),
  ].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 8);

  const reasons = [];
  if (strong) reasons.push(`${base} ${baseS.score} vs ${quote} ${quoteS.score}`);
  else if (edgeSigned >= 0) reasons.push(`edge слабкий ${round(edgeSigned, 2)}`);
  else reasons.push(`${base} слабший vs ${quote}`);

  const score = Math.max(0, Math.min(100, edgeScore + (strong ? 10 : 0)));

  return {
    aligned: aligned && edgeSigned >= -0.15,
    score,
    reason: reasons.join('; ') || 'fundamental neutral',
    edge: round(edgeSigned, 3),
    edgeScore,
    baseStrength: baseS,
    quoteStrength: quoteS,
    factors: topFactors,
    blocked: false,
  };
}

module.exports = {
  biasSigned,
  computeCurrencyStrength,
  evaluatePairFundamentals,
  hardBlock,
};
