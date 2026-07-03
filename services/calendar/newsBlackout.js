/**
 * High-impact news blackout windows (UTC).
 * Phase 2: replace with ForexFactory / Investing.com API.
 */

function utcDateParts(d = new Date()) {
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    dow: d.getUTCDay(),
    mins: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

function isFirstFriday(d = new Date()) {
  const p = utcDateParts(d);
  return p.dow === 5 && p.day <= 7;
}

function inWindow(mins, start, end) {
  return mins >= start && mins <= end;
}

function getActiveBlackouts(now = new Date()) {
  const p = utcDateParts(now);
  const events = [];

  if (p.dow >= 1 && p.dow <= 5) {
    events.push({
      id: 'london_open',
      label: 'London open volatility',
      start: 7 * 60,
      end: 7 * 60 + 15,
    });
    events.push({
      id: 'ny_open',
      label: 'NY open volatility',
      start: 13 * 60 + 30,
      end: 13 * 60 + 45,
    });
  }

  if (isFirstFriday(now)) {
    events.push({
      id: 'nfp',
      label: 'US NFP release window',
      start: 12 * 60 + 25,
      end: 13 * 60 + 15,
    });
  }

  events.push({
    id: 'fomc_placeholder',
    label: 'FOMC week caution (Wed 18:00-19:30 UTC)',
    start: 18 * 60,
    end: 19 * 60 + 30,
    active: p.dow === 3,
  });

  return events.filter((e) => e.active !== false);
}

function isNewsBlackout(now = new Date(), bufferMin = 0) {
  const p = utcDateParts(now);
  const active = getActiveBlackouts(now);
  for (const ev of active) {
    const start = ev.start - bufferMin;
    const end = ev.end + bufferMin;
    if (inWindow(p.mins, start, end)) {
      return { blocked: true, reason: ev.label, event: ev.id };
    }
  }
  return { blocked: false, reason: '' };
}

module.exports = {
  isNewsBlackout,
  getActiveBlackouts,
};
