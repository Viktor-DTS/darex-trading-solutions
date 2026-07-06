const { classifyEvent, computeEventSurprise } = require('../surprise');

const DEFAULT_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

function parseImpact(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('high') || s === '3') return 'high';
  if (s.includes('medium') || s === '2') return 'medium';
  if (s.includes('low') || s === '1') return 'low';
  return 'low';
}

function normalizeFfEvent(row) {
  const title = row.title || row.name || '';
  const currency = String(row.country || row.currency || '').toUpperCase().slice(0, 3);
  const ts = Date.parse(row.date || row.timestamp || '');
  const impact = parseImpact(row.impact);
  const actual = row.actual ?? null;
  const forecast = row.forecast ?? row.estimate ?? null;
  const previous = row.previous ?? row.prev ?? null;
  const released = actual != null && String(actual).trim() !== '' && String(actual).trim() !== '—';

  const cls = classifyEvent(title, currency);
  const surprise = computeEventSurprise({
    title, currency, actual, forecast, previous, kind: cls.kind,
  });

  return {
    id: `ff-${title}-${ts}`,
    source: 'forexfactory',
    title,
    currency,
    country: row.country || currency,
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

async function fetchForexFactoryCalendar(options = {}) {
  const url = options.url || process.env.FX_CALENDAR_FF_URL || DEFAULT_URL;
  const fetchOpts = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; fx-scalp-agent/1.0)',
      Accept: 'application/json',
    },
  };
  if (process.env.FX_TLS_INSECURE === '1') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const res = await fetch(url, fetchOpts);
  if (!res.ok) {
    throw new Error(`ForexFactory calendar HTTP ${res.status}`);
  }
  const raw = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error('ForexFactory calendar: expected array');
  }
  return raw.map(normalizeFfEvent).filter((e) => e.ts != null);
}

module.exports = { fetchForexFactoryCalendar, normalizeFfEvent, DEFAULT_URL };
