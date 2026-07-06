require('dotenv').config();
const { fetchCalendar } = require('../services/calendar/calendarService');

(async () => {
  try {
    const cal = await fetchCalendar({ force: true });
    console.log(JSON.stringify({
      ok: true,
      provider: cal.provider,
      events: cal.events?.length,
      usdSurprise: cal.usdSurprise,
      upcoming: cal.upcoming?.map((e) => ({ t: e.title, c: e.currency, at: new Date(e.ts).toISOString() })),
      recent: cal.recent?.map((e) => ({
        t: e.title,
        surprise: e.surprise?.surprisePct,
        bias: e.surprise?.bias,
      })),
    }, null, 2));
  } catch (e) {
    console.error('[refresh-calendar]', e.message);
    process.exit(1);
  }
})();
