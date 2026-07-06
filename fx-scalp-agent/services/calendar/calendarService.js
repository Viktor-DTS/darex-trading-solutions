const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../state');
const { aggregateCurrencyBias } = require('./surprise');
const { fetchForexFactoryCalendar } = require('./providers/forexfactory');
const { fetchFinnhubCalendar } = require('./providers/finnhub');

const CACHE_PATH = path.join(DATA_DIR, 'calendar-cache.json');
const CACHE_MS = Number(process.env.FX_CALENDAR_CACHE_MS) || 900000;
const BLACKOUT_BEFORE_MIN = Number(process.env.FX_CALENDAR_BLACKOUT_BEFORE_MIN) || 5;
const BLACKOUT_AFTER_MIN = Number(process.env.FX_CALENDAR_BLACKOUT_AFTER_MIN) || 15;

let memoryCache = { data: null, at: 0 };

function readFileCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeFileCache(doc) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(doc, null, 2));
}

async function fetchFromProvider(provider) {
  if (provider === 'finnhub') {
    return fetchFinnhubCalendar();
  }
  return fetchForexFactoryCalendar();
}

function enrichCalendar(events, now = Date.now()) {
  const currencyBias = aggregateCurrencyBias(events, now);
  const upcoming = events
    .filter((e) => !e.released && e.ts > now && e.ts < now + 48 * 3600 * 1000)
    .sort((a, b) => a.ts - b.ts);
  const recent = events
    .filter((e) => e.released && e.ts <= now && e.ts > now - 24 * 3600 * 1000)
    .sort((a, b) => b.ts - a.ts);

  const highImpact = events.filter((e) => e.impact === 'high');

  return {
    events,
    upcoming: upcoming.slice(0, 12),
    recent: recent.slice(0, 8),
    highImpact: highImpact.slice(0, 20),
    currencyBias,
    usdSurprise: currencyBias.USD || { signed: 0, score: 50, events: [] },
    eurSurprise: currencyBias.EUR || { signed: 0, score: 50, events: [] },
    fetchedAt: new Date(now).toISOString(),
    provider: null,
    stale: false,
  };
}

/**
 * Fetch economic calendar with cache (memory + file fallback).
 */
async function fetchCalendar(options = {}) {
  const force = options.force === true;
  const now = Date.now();
  const provider = options.provider || process.env.FX_CALENDAR_PROVIDER || 'forexfactory';

  if (!force && memoryCache.data && now - memoryCache.at < CACHE_MS) {
    return memoryCache.data;
  }

  const fileCached = readFileCache();
  if (!force && fileCached?.fetchedAt) {
    const age = now - Date.parse(fileCached.fetchedAt);
    if (age < CACHE_MS && fileCached.events?.length) {
      const enriched = enrichCalendar(fileCached.events, now);
      memoryCache = { data: { ...fileCached, ...enriched, stale: age > CACHE_MS * 0.8 }, at: now };
      return memoryCache.data;
    }
  }

  try {
    const events = await fetchFromProvider(provider);
    const doc = enrichCalendar(events, now);
    doc.provider = provider;
    writeFileCache({ ...doc, events });
    memoryCache = { data: doc, at: now };
    return doc;
  } catch (err) {
    if (fileCached?.events?.length) {
      const enriched = enrichCalendar(fileCached.events, now);
      const doc = {
        ...enriched,
        provider: fileCached.provider || provider,
        stale: true,
        error: err.message,
      };
      memoryCache = { data: doc, at: now };
      return doc;
    }
    throw err;
  }
}

function getCalendarSync() {
  if (memoryCache.data) return memoryCache.data;
  const fileCached = readFileCache();
  if (fileCached?.events?.length) {
    return enrichCalendar(fileCached.events, Date.now());
  }
  return null;
}

/** Blackout around high-impact releases from live calendar. */
function isCalendarBlackout(now = new Date(), bufferMin = 0) {
  const cal = getCalendarSync();
  if (!cal?.events?.length) return { blocked: false, reason: '' };

  const t = now.getTime();
  const beforeMs = (BLACKOUT_BEFORE_MIN + bufferMin) * 60000;
  const afterMs = (BLACKOUT_AFTER_MIN + bufferMin) * 60000;

  for (const ev of cal.events) {
    if (ev.impact !== 'high' || !ev.ts) continue;
    if (ev.released && t > ev.ts + afterMs) continue;
    if (t >= ev.ts - beforeMs && t <= ev.ts + afterMs) {
      const phase = t < ev.ts ? 'до' : ev.released ? 'після' : 'під час';
      return {
        blocked: true,
        reason: `${phase} ${ev.title} (${ev.currency})`,
        event: ev,
      };
    }
  }
  return { blocked: false, reason: '' };
}

function getUpcomingHighImpact(hours = 24) {
  const cal = getCalendarSync();
  if (!cal) return [];
  const now = Date.now();
  const until = now + hours * 3600 * 1000;
  return (cal.events || [])
    .filter((e) => e.impact === 'high' && e.ts >= now && e.ts <= until && !e.released)
    .sort((a, b) => a.ts - b.ts);
}

module.exports = {
  fetchCalendar,
  getCalendarSync,
  isCalendarBlackout,
  getUpcomingHighImpact,
  enrichCalendar,
  CACHE_PATH,
  BLACKOUT_BEFORE_MIN,
  BLACKOUT_AFTER_MIN,
};
