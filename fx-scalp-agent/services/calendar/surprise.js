const { parseNumeric } = require('./parseValues');
const { round } = require('../utils');

const EVENT_RULES = [
  { re: /non.?farm|nfp|employment change/i, ccy: 'USD', direction: 1, kind: 'nfp' },
  { re: /unemployment rate/i, ccy: 'USD', direction: -1, kind: 'unemployment' },
  { re: /core?\s*cpi|consumer price index|cpi m\/m|cpi y\/y/i, ccy: 'USD', direction: 1, kind: 'cpi' },
  { re: /gdp/i, ccy: 'USD', direction: 1, kind: 'gdp' },
  { re: /retail sales/i, ccy: 'USD', direction: 1, kind: 'retail' },
  { re: /ism manufacturing|ism services/i, ccy: 'USD', direction: 1, kind: 'ism' },
  { re: /ecb.*rate|main refinancing/i, ccy: 'EUR', direction: 1, kind: 'ecb_rate' },
  { re: /boe.*rate|official bank rate/i, ccy: 'GBP', direction: 1, kind: 'boe_rate' },
  { re: /boj.*rate|policy rate/i, ccy: 'JPY', direction: 1, kind: 'boj_rate' },
  { re: /fomc|fed.*rate|federal funds/i, ccy: 'USD', direction: 1, kind: 'fed_rate' },
];

function classifyEvent(title, currency) {
  const t = String(title || '');
  for (const rule of EVENT_RULES) {
    if (rule.re.test(t)) {
      return { ...rule, currency: rule.ccy || currency };
    }
  }
  return { kind: 'other', currency, direction: 1 };
}

/**
 * Surprise = actual − forecast (numeric).
 * bias signed −1..+1 for currency strength after release.
 */
function computeEventSurprise(event) {
  const actual = parseNumeric(event.actual);
  const forecast = parseNumeric(event.forecast ?? event.estimate);
  const previous = parseNumeric(event.previous ?? event.prev);

  if (actual == null || forecast == null) {
    return {
      surprise: null,
      surprisePct: null,
      bias: 0,
      strong: false,
      actual,
      forecast,
      previous,
      kind: event.kind,
    };
  }

  const surprise = actual - forecast;
  const surprisePct = forecast !== 0
    ? round((surprise / Math.abs(forecast)) * 100, 1)
    : null;

  const cls = classifyEvent(event.title || event.event || event.name, event.currency);
  const dir = cls.direction ?? 1;
  let bias = 0;
  if (Math.abs(surprise) > 0) {
    bias = Math.sign(surprise * dir);
    if (surprisePct != null && Math.abs(surprisePct) >= 15) {
      bias = bias * 1.5;
    }
  }
  bias = Math.max(-1, Math.min(1, bias));

  const strong = surprisePct != null && Math.abs(surprisePct) >= 10;

  return {
    surprise: round(surprise, 4),
    surprisePct,
    bias: round(bias, 2),
    strong,
    actual,
    forecast,
    previous,
    kind: cls.kind,
    currency: cls.currency || event.currency,
  };
}

/**
 * Aggregate recent surprise bias per currency (decay by age).
 */
function aggregateCurrencyBias(events, now = Date.now()) {
  const byCcy = {};
  const halfLifeMs = Number(process.env.FX_CALENDAR_SURPRISE_HALFLIFE_MS) || 4 * 3600 * 1000;

  for (const ev of events) {
    if (!ev.released || ev.surprise?.bias == null || ev.surprise.bias === 0) continue;
    const ccy = ev.currency;
    if (!ccy) continue;
    const age = now - (ev.ts || 0);
    if (age < 0 || age > 24 * 3600 * 1000) continue;
    const decay = Math.exp(-age / halfLifeMs);
    const weight = (ev.impact === 'high' ? 1 : ev.impact === 'medium' ? 0.6 : 0.3) * decay;
    if (!byCcy[ccy]) byCcy[ccy] = { signed: 0, weight: 0, events: [] };
    byCcy[ccy].signed += ev.surprise.bias * weight;
    byCcy[ccy].weight += weight;
    byCcy[ccy].events.push({ title: ev.title, bias: ev.surprise.bias, surprisePct: ev.surprise.surprisePct });
  }

  const out = {};
  for (const [ccy, v] of Object.entries(byCcy)) {
    const signed = v.weight > 0 ? v.signed / v.weight : 0;
    out[ccy] = {
      signed: round(signed, 3),
      score: Math.round(50 + signed * 50),
      events: v.events.slice(0, 3),
    };
  }
  return out;
}

module.exports = {
  classifyEvent,
  computeEventSurprise,
  aggregateCurrencyBias,
  EVENT_RULES,
};
