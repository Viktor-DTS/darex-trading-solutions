const { fetchDxySnapshot } = require('./dxy');
const { fetchJpyBiasSnapshot } = require('./jpyBias');
const { fetchSymbolBias } = require('./symbolBias');
const { fetchCalendar, getCalendarSync } = require('../calendar/calendarService');

let cache = { data: null, at: 0 };
const CACHE_MS = Number(process.env.FX_MACRO_CACHE_MS) || 120000;

async function attachCalendar(data) {
  if (process.env.FX_CALENDAR === '0') return data;
  try {
    const calendar = await fetchCalendar();
    return { ...data, calendar };
  } catch (_) {
    const cached = getCalendarSync();
    return cached ? { ...data, calendar: cached } : data;
  }
}

async function fetchMacroSnapshot(force = false) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_MS) {
    return cache.data;
  }

  const [dxy, jpy, yields, vix, oil, audnzd, gold, china, spy] = await Promise.all([
    fetchDxySnapshot().catch(() => ({ bias: 'neutral' })),
    fetchJpyBiasSnapshot().catch(() => ({ bias: 'neutral' })),
    fetchSymbolBias('^TNX', 'US10Y').catch(() => ({ bias: 'neutral' })),
    fetchSymbolBias('^VIX', 'VIX').catch(() => ({ bias: 'neutral' })),
    fetchSymbolBias('CL=F', 'OIL').catch(() => ({ bias: 'neutral' })),
    fetchSymbolBias('AUDNZD=X', 'AUDNZD').catch(() => ({ bias: 'neutral' })),
    fetchSymbolBias('GC=F', 'GOLD').catch(() => ({ bias: 'neutral' })),
    fetchSymbolBias('FXI', 'CHINA').catch(() => ({ bias: 'neutral' })),
    fetchSymbolBias('SPY', 'SPY').catch(() => ({ bias: 'neutral' })),
  ]);

  const risk = vix.bias === 'up' ? 'risk_off' : vix.bias === 'down' ? 'risk_on' : 'neutral';

  let data = {
    dxy,
    jpy,
    yields,
    vix,
    oil,
    audnzd,
    gold,
    china,
    spy,
    risk,
    fetchedAt: new Date().toISOString(),
  };

  data = await attachCalendar(data);

  cache = { data, at: now };
  return cache.data;
}

function clearMacroCache() {
  cache = { data: null, at: 0 };
}

module.exports = { fetchMacroSnapshot, clearMacroCache };
