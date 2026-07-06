const { classifyEvent, computeEventSurprise } = require('../surprise');

function normalizeFinnhubEvent(row) {
  const title = row.event || row.title || '';
  const currency = String(row.country || row.currency || '').toUpperCase();
  const ccyMap = { US: 'USD', EU: 'EUR', GB: 'GBP', UK: 'GBP', JP: 'JPY', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF' };
  const currency3 = ccyMap[currency] || currency.slice(0, 3);
  const ts = (row.time || row.timestamp) * (row.time < 1e12 ? 1000 : 1);
  const impactRaw = String(row.impact || '').toLowerCase();
  const impact = impactRaw.includes('high') || row.impact === 3 ? 'high'
    : impactRaw.includes('medium') || row.impact === 2 ? 'medium' : 'low';

  const actual = row.actual != null ? String(row.actual) : null;
  const forecast = row.estimate != null ? String(row.estimate) : row.forecast;
  const previous = row.prev != null ? String(row.prev) : row.previous;
  const released = actual != null && actual !== '';

  const cls = classifyEvent(title, currency3);
  const surprise = computeEventSurprise({
    title, currency: currency3, actual, forecast, previous, kind: cls.kind,
  });

  return {
    id: `fh-${title}-${ts}`,
    source: 'finnhub',
    title,
    currency: currency3,
    country: row.country,
    ts: Number.isFinite(ts) ? ts : null,
    impact,
    actual,
    forecast,
    previous,
    released,
    surprise,
    kind: cls.kind,
  };
}

async function fetchFinnhubCalendar(options = {}) {
  const token = options.token || process.env.FX_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY;
  if (!token) throw new Error('Finnhub API key missing (FX_FINNHUB_API_KEY)');

  const now = options.now || new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 7);

  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/calendar/economic?from=${fmt(from)}&to=${fmt(to)}&token=${token}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub calendar HTTP ${res.status}`);
  const json = await res.json();
  const rows = json.economicCalendar || json.result || [];
  return rows.map(normalizeFinnhubEvent).filter((e) => e.ts != null);
}

module.exports = { fetchFinnhubCalendar, normalizeFinnhubEvent };
