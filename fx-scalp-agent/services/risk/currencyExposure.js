const { normPair } = require('../utils');
const { parseCurrencies } = require('../macro/dxy');

function currenciesInPair(pair) {
  const { base, quote } = parseCurrencies(pair);
  return [base, quote];
}

function countTradesWithCurrency(openTrades, currency) {
  const ccy = String(currency || '').toUpperCase();
  return openTrades.filter((t) => currenciesInPair(t.pair).includes(ccy)).length;
}

function checkCurrencyExposure(openTrades, candidatePair, maxPerCurrency = 2) {
  const pair = normPair(candidatePair);
  for (const ccy of currenciesInPair(pair)) {
    const n = countTradesWithCurrency(openTrades, ccy);
    if (n >= maxPerCurrency) {
      return {
        blocked: true,
        reason: `ліміт ${maxPerCurrency} угод з валютою ${ccy} (зараз ${n})`,
        currency: ccy,
      };
    }
  }
  return { blocked: false, reason: '' };
}

module.exports = {
  currenciesInPair,
  countTradesWithCurrency,
  checkCurrencyExposure,
};
