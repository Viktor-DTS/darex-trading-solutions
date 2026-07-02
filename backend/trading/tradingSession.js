/**
 * US equity session helpers (America/New_York).
 */

function getEtParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
    weekday: get('weekday'),
  };
}

function etMinutesSinceMidnight(date = new Date()) {
  const p = getEtParts(date);
  return p.hour * 60 + p.minute;
}

function isUsWeekday(date = new Date()) {
  const wd = getEtParts(date).weekday;
  return wd !== 'Sat' && wd !== 'Sun';
}

/** Regular session roughly 9:30–16:00 ET. */
function isUsMarketOpen(date = new Date()) {
  if (!isUsWeekday(date)) return false;
  const mins = etMinutesSinceMidnight(date);
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

/** New entries: after opening volatility, before late session. */
function isActiveEntryWindow(date = new Date()) {
  if (!isUsWeekday(date)) return false;
  const mins = etMinutesSinceMidnight(date);
  return mins >= 9 * 60 + 45 && mins <= 15 * 60 + 30;
}

/** Flatten open day trades before close. */
function isEodFlattenTime(date = new Date()) {
  if (!isUsWeekday(date)) return false;
  const mins = etMinutesSinceMidnight(date);
  return mins >= 15 * 60 + 55;
}

function getEtDayKey(date = new Date()) {
  const p = getEtParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** UTC bounds for current ET calendar day (for Mongo queries). */
function getEtDayBounds(date = new Date()) {
  const dayKey = getEtDayKey(date);
  const anchor = new Date(date);
  anchor.setUTCMinutes(0, 0, 0);

  for (let i = 0; i <= 48; i += 1) {
    const test = new Date(anchor.getTime() - i * 3600000);
    const parts = getEtParts(test);
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    if (key === dayKey && parts.hour === 0) {
      const start = test;
      const end = new Date(start.getTime() + 24 * 3600000);
      return { start, end, dayKey };
    }
  }

  const end = date;
  const start = new Date(end.getTime() - 24 * 3600000);
  return { start, end, dayKey };
}

function getEtOffsetMs(date) {
  const utc = date.getTime();
  const etStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
  const [h, mi, s] = etStr.split(':').map(Number);
  const etAsUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    h,
    mi,
    s,
  );
  return utc - etAsUtc;
}

module.exports = {
  getEtParts,
  isUsMarketOpen,
  isActiveEntryWindow,
  isEodFlattenTime,
  getEtDayBounds,
  getEtDayKey,
};
