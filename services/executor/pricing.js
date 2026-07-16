const { normPair, pipSize, pipsToPrice, priceToPips, round } = require('../utils');

/** Typical retail round-trip spread (pips) — OANDA-like majors & crosses */
const DEFAULT_SPREAD_PIPS = {
  EURUSD: 1.0,
  GBPUSD: 1.2,
  USDJPY: 0.9,
  AUDUSD: 1.1,
  USDCAD: 1.3,
  USDCHF: 1.2,
  NZDUSD: 1.3,
  EURGBP: 1.0,
  EURJPY: 1.2,
  GBPJPY: 1.8,
  AUDJPY: 1.5,
  EURCHF: 1.5,
  GBPAUD: 2.0,
  GBPCHF: 2.2,
  EURAUD: 1.8,
  EURNZD: 2.5,
  CADJPY: 1.5,
  AUDCAD: 1.8,
  NZDJPY: 1.6,
  CHFJPY: 1.8,
  AUDNZD: 2.0,
  EURCAD: 1.8,
  GBPCAD: 2.2,
  GBPNZD: 2.8,
  AUDCHF: 2.0,
  NZDCHF: 2.2,
  CADCHF: 2.0,
  NZDCAD: 2.0,
  EURSEK: 2.5,
  EURNOK: 2.8,
  USDSEK: 2.2,
  USDNOK: 2.5,
  USDSGD: 1.8,
  USDHKD: 1.5,
  USDPLN: 3.0,
  EURPLN: 3.2,
  USDMXN: 3.5,
  USDZAR: 4.0,
  GBPSEK: 3.0,
  GBPNOK: 3.2,
  USDCNH: 2.5,
  EURHUF: 4.5,
  EURTRY: 6.0,
};

const QUOTE_TO_USD = {
  GBP: 1.27,
  JPY: 1 / 150,
  CHF: 1.12,
  CAD: 0.72,
  AUD: 0.65,
  NZD: 0.60,
  EUR: 1.09,
  SEK: 0.095,
  NOK: 0.092,
  SGD: 0.74,
  HKD: 0.128,
  PLN: 0.25,
  MXN: 0.058,
  ZAR: 0.055,
};

function parseSpreadMap(raw) {
  const out = {};
  if (!raw) return out;
  for (const part of String(raw).split(/[,;\s]+/)) {
    const [pair, val] = part.split(':');
    const p = normPair(pair);
    const n = Number(val);
    if (p.length === 6 && Number.isFinite(n) && n > 0) out[p] = n;
  }
  return out;
}

function getSpreadPips(pair, cfg = {}) {
  const p = normPair(pair);
  if (cfg.simSpreads?.[p] != null) return cfg.simSpreads[p];
  if (DEFAULT_SPREAD_PIPS[p] != null) return DEFAULT_SPREAD_PIPS[p];
  return cfg.simSpreadPips ?? 1.2;
}

function pipValueUsd(units, pair, midPrice = null) {
  const p = normPair(pair);
  const ps = pipSize(p);
  const base = p.slice(0, 3);
  const quote = p.slice(3, 6);
  const price = midPrice || (p.includes('JPY') ? 150 : 1.1);

  if (quote === 'USD') return units * ps;
  if (base === 'USD') return (units * ps) / price;

  const fx = QUOTE_TO_USD[quote] ?? 1;
  return units * ps * fx;
}

function calcUnitsForRisk(equityUsd, riskPct, stopPips, pair, midPrice) {
  const riskUsd = equityUsd * (riskPct / 100);
  const perUnit = pipValueUsd(1, pair, midPrice);
  if (stopPips <= 0 || perUnit <= 0) return 0;
  return Math.max(0, Math.floor(riskUsd / (stopPips * perUnit)));
}

function fillLongEntry(midOrAsk, pair, spreadPips) {
  const half = pipsToPrice(spreadPips, pair) / 2;
  return round(midOrAsk + half, 5);
}

function fillShortEntry(midOrBid, pair, spreadPips) {
  const half = pipsToPrice(spreadPips, pair) / 2;
  return round(midOrBid - half, 5);
}

/** Market-order entry slippage — fills slightly worse than quoted (adverse). */
function applyEntrySlippage(price, side, pair, slipPips = 0) {
  if (!slipPips) return round(price, 5);
  const d = pipsToPrice(slipPips, pair);
  return round(side === 'short' ? price - d : price + d, 5);
}

/** Stop-loss slippage — stop orders fill at market, often worse than the level. */
function applyStopSlippage(stopPrice, side, pair, slipPips = 0) {
  if (!slipPips) return round(stopPrice, 5);
  const d = pipsToPrice(slipPips, pair);
  return round(side === 'short' ? stopPrice + d : stopPrice - d, 5);
}

/**
 * Session-aware spread widening for sim realism.
 * Peak (overlap/london) ≈ base; off-peak / late = wider.
 */
function widenSpreadForSim(baseSpread, cfg = {}, sessionName = null) {
  const mult = cfg.simSpreadSessionMult ?? 1;
  if (mult <= 1 || !sessionName) return baseSpread;
  const wide = new Set(['quiet', 'ny_close', 'extended', 'closed', 'overlap_late']);
  return wide.has(sessionName) ? round(baseSpread * mult, 2) : baseSpread;
}

function tradePnlUsd(trade, exitPrice, commissionUsd = 0) {
  const pipVal = trade.pipValueUsd ?? pipValueUsd(trade.units || 0, trade.pair, trade.entry);
  const pips = trade.side === 'short'
    ? priceToPips(trade.entry - exitPrice, trade.pair)
    : priceToPips(exitPrice - trade.entry, trade.pair);
  const gross = pips * pipVal;
  return {
    pips: round(pips, 1),
    grossUsd: round(gross, 2),
    pnlUsd: round(gross - commissionUsd, 2),
  };
}

function resolveTargetPips(pair, cfg, midPrice = null) {
  const p = normPair(pair);
  const spread = getSpreadPips(p, cfg);
  const stopPips = cfg.stopPips ?? 5;
  const marginPct = cfg.minProfitSlPct ?? 25;
  const units = calcUnitsForRisk(cfg.equityUsd, cfg.riskPerTradePct, stopPips, p, midPrice);
  const pipVal = pipValueUsd(units, p, midPrice) || 0.001;
  const commPips = (cfg.simCommissionUsd ?? 0) / pipVal;
  const breakEvenPips = spread + commPips;
  const minNetPips = stopPips * (marginPct / 100);
  const minTargetPips = round(breakEvenPips + minNetPips, 1);
  const baseTargetPips = cfg.targetPips ?? 4;
  const targetPips = Math.max(baseTargetPips, minTargetPips);
  return { targetPips, minTargetPips, baseTargetPips, breakEvenPips: round(breakEvenPips, 2) };
}

function enrichTradeSizing(trade, cfg) {
  const pair = normPair(trade.pair);
  const mid = trade.entry ?? 1.1;
  const stopPips = trade.stopPips ?? cfg.stopPips ?? 5;
  const spreadPips = trade.spreadPips ?? getSpreadPips(pair, cfg);
  const units = trade.units ?? calcUnitsForRisk(
    cfg.equityUsd,
    cfg.riskPerTradePct,
    stopPips,
    pair,
    mid,
  );
  const pipVal = trade.pipValueUsd ?? pipValueUsd(units, pair, mid);
  return {
    ...trade,
    units,
    spreadPips,
    pipValueUsd: round(pipVal, 4),
    lots: round(units / 100000, 4),
    riskUsd: round(cfg.equityUsd * cfg.riskPerTradePct / 100, 2),
  };
}

module.exports = {
  DEFAULT_SPREAD_PIPS,
  parseSpreadMap,
  getSpreadPips,
  pipValueUsd,
  calcUnitsForRisk,
  fillLongEntry,
  fillShortEntry,
  applyEntrySlippage,
  applyStopSlippage,
  widenSpreadForSim,
  tradePnlUsd,
  resolveTargetPips,
  enrichTradeSizing,
};
