/**
 * Session-aware thresholds (UTC).
 * London/NY overlap = normal; quiet hours = stricter.
 */
function getSessionProfile(now = new Date()) {
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();

  const londonStart = 7 * 60;
  const londonEnd = 11 * 60;
  const overlapEnd = 16 * 60;
  const nyStart = 12 * 60;

  if (mins >= londonStart && mins < londonEnd) {
    return { name: 'london', minLayersAligned: 3, scoreBoost: 0, tradeAllowed: true };
  }
  if (mins >= nyStart && mins < overlapEnd) {
    return { name: 'ny', minLayersAligned: 3, scoreBoost: 0, tradeAllowed: true };
  }
  if (mins >= londonEnd && mins < nyStart) {
    return { name: 'quiet', minLayersAligned: 3, scoreBoost: 0, tradeAllowed: true };
  }
  if (mins >= 5 * 60 && mins < 20 * 60) {
    return { name: 'extended', minLayersAligned: 3, scoreBoost: 0, tradeAllowed: true };
  }
  return { name: 'closed', minLayersAligned: 4, scoreBoost: 10, tradeAllowed: false };
}

function applySessionToConfig(cfg, session) {
  return {
    ...cfg,
    minLayersAligned: Math.max(cfg.minLayersAligned ?? 3, session.minLayersAligned),
    minBuyScore: (cfg.minBuyScore ?? 85) + (session.scoreBoost ?? 0),
    sessionProfile: session.name,
  };
}

module.exports = { getSessionProfile, applySessionToConfig };
