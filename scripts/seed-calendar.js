require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../services/state');
const { normalizeFfEvent } = require('../services/calendar/providers/forexfactory');
const { enrichCalendar } = require('../services/calendar/calendarService');

/** Demo / offline seed when FF API unreachable. Edit dates for your week. */
const RAW = [
  {
    title: 'Non-Farm Employment Change',
    country: 'USD',
    date: '2026-07-06T08:30:00.000Z',
    impact: 'High',
    actual: '210K',
    forecast: '180K',
    previous: '165K',
  },
  {
    title: 'Unemployment Rate',
    country: 'USD',
    date: '2026-07-06T08:30:00.000Z',
    impact: 'High',
    actual: '4.0%',
    forecast: '4.1%',
    previous: '4.2%',
  },
  {
    title: 'Non-Farm Employment Change',
    country: 'USD',
    date: '2026-07-03T12:30:00.000Z',
    impact: 'High',
    actual: '272K',
    forecast: '190K',
    previous: '165K',
  },
  {
    title: 'Core CPI m/m',
    country: 'USD',
    date: '2026-07-15T12:30:00.000Z',
    impact: 'High',
    forecast: '0.2%',
    previous: '0.1%',
  },
  {
    title: 'CPI y/y',
    country: 'USD',
    date: '2026-07-15T12:30:00.000Z',
    impact: 'High',
    forecast: '2.6%',
    previous: '2.7%',
  },
  {
    title: 'Retail Sales m/m',
    country: 'USD',
    date: '2026-07-17T12:30:00.000Z',
    impact: 'High',
    forecast: '0.4%',
    previous: '0.1%',
  },
];

const events = RAW.map(normalizeFfEvent);
const doc = enrichCalendar(events);
doc.provider = 'seed';
doc.stale = false;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const out = path.join(DATA_DIR, 'calendar-cache.json');
fs.writeFileSync(out, JSON.stringify({ ...doc, events }, null, 2));
console.log(`[seed-calendar] wrote ${events.length} events → ${out}`);
console.log('USD surprise bias:', doc.usdSurprise);
