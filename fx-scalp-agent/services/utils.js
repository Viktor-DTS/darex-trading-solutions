function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round(n, digits = 5) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function pipSize(pair) {
  const p = normPair(pair);
  if (p.includes('JPY')) return 0.01;
  const quote = p.slice(3, 6);
  if (['SEK', 'NOK', 'HUF', 'TRY', 'MXN', 'ZAR'].includes(quote)) return 0.01;
  return 0.0001;
}

function pipsToPrice(pips, pair) {
  return pips * pipSize(pair);
}

function priceToPips(diff, pair) {
  const ps = pipSize(pair);
  return ps > 0 ? diff / ps : 0;
}

function normPair(pair) {
  return String(pair || 'EURUSD').replace(/[^A-Z]/gi, '').toUpperCase();
}

function yahooFxSymbol(pair) {
  const p = normPair(pair);
  if (p.length !== 6) return `${p}=X`;
  return `${p}=X`;
}

function parseUtcHm(hm) {
  const [h, m] = String(hm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isInUtcSession(now = new Date(), startHm = '07:00', endHm = '20:00') {
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const start = parseUtcHm(startHm);
  const end = parseUtcHm(endHm);
  if (end >= start) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

module.exports = {
  clamp,
  round,
  pipSize,
  pipsToPrice,
  priceToPips,
  normPair,
  yahooFxSymbol,
  isInUtcSession,
};
