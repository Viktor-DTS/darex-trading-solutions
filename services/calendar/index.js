/**
 * Combined news blackout: static windows + live calendar high-impact events.
 */
const { isNewsBlackout: isStaticBlackout, getActiveBlackouts } = require('./newsBlackout');
const { isCalendarBlackout, getCalendarSync, getUpcomingHighImpact } = require('./calendarService');

function isNewsBlackout(now = new Date(), bufferMin = 0) {
  const cal = isCalendarBlackout(now, bufferMin);
  if (cal.blocked) {
    return { blocked: true, reason: cal.reason, event: cal.event?.id, source: 'calendar' };
  }
  const stat = isStaticBlackout(now, bufferMin);
  if (stat.blocked) {
    return { ...stat, source: 'static' };
  }
  return { blocked: false, reason: '' };
}

function getCalendarStatus(now = new Date()) {
  const cal = getCalendarSync();
  return {
    blackouts: getActiveBlackouts(now),
    active: isNewsBlackout(now),
    calendar: cal ? {
      provider: cal.provider,
      stale: cal.stale,
      error: cal.error,
      fetchedAt: cal.fetchedAt,
      upcoming: cal.upcoming,
      recent: cal.recent,
      currencyBias: cal.currencyBias,
      usdSurprise: cal.usdSurprise,
      eurSurprise: cal.eurSurprise,
    } : null,
    upcomingHighImpact: getUpcomingHighImpact(24),
  };
}

module.exports = {
  isNewsBlackout,
  getActiveBlackouts,
  getCalendarStatus,
  isCalendarBlackout,
};
