/**
 * Session-aware thresholds (UTC).
 * London / NY overlap = more dynamic; quiet hours = stricter; tier2 uses FX_PAIR_TIER2_MIN_BUY_SCORE.
 */
function getSessionProfile(now = new Date()) {
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();

  const londonStart = 7 * 60;
  const londonEnd = 11 * 60;
  const overlapStart = 12 * 60;
  const overlapEnd = 16 * 60;
  const activeEnd = 17 * 60;

  if (mins >= overlapStart && mins < overlapEnd) {
    const overlapLateStart = 15 * 60;
    const lateOverlap = mins >= overlapLateStart;
    return {
      name: lateOverlap ? 'overlap_late' : 'overlap',
      minLayersAligned: 3,
      scoreBoost: lateOverlap ? -1 : -3,
      tradeAllowed: true,
      maxSpreadPips: lateOverlap ? 1.8 : 1.8,
      maxEntriesPerCycle: lateOverlap ? 2 : 3,
      pairMaxTradesPerDay: lateOverlap ? 2 : 3,
      tier2Allowed: true,
    };
  }
  if (mins >= londonStart && mins < londonEnd) {
    return {
      name: 'london',
      minLayersAligned: 3,
      scoreBoost: -2,
      tradeAllowed: true,
      maxSpreadPips: 2.0,
      maxEntriesPerCycle: 3,
      pairMaxTradesPerDay: 3,
      tier2Allowed: true,
    };
  }
  if (mins >= londonEnd && mins < overlapStart) {
    return {
      name: 'quiet',
      minLayersAligned: 3,
      scoreBoost: 3,
      tradeAllowed: true,
      maxSpreadPips: 2.0,
      maxEntriesPerCycle: 2,
      pairMaxTradesPerDay: 2,
      tier2Allowed: true,
    };
  }
  if (mins >= overlapEnd && mins < activeEnd) {
    return {
      name: 'ny_close',
      minLayersAligned: 3,
      scoreBoost: 2,
      tradeAllowed: true,
      maxSpreadPips: 2.0,
      maxEntriesPerCycle: 2,
      pairMaxTradesPerDay: 2,
      tier2Allowed: true,
    };
  }
  if (mins >= 5 * 60 && mins < 20 * 60) {
    return {
      name: 'extended',
      minLayersAligned: 4,
      scoreBoost: 8,
      tradeAllowed: false,
      maxSpreadPips: 2.0,
      maxEntriesPerCycle: 1,
      pairMaxTradesPerDay: 1,
      tier2Allowed: false,
    };
  }
  return {
    name: 'closed',
    minLayersAligned: 4,
    scoreBoost: 10,
    tradeAllowed: false,
    maxSpreadPips: 2.0,
    maxEntriesPerCycle: 0,
    pairMaxTradesPerDay: 0,
    tier2Allowed: false,
  };
}

function applySessionToConfig(cfg, session) {
  const boost = session.scoreBoost ?? 0;
  return {
    ...cfg,
    minLayersAligned: Math.max(cfg.minLayersAligned ?? 3, session.minLayersAligned ?? 3),
    minBuyScore: (cfg.minBuyScore ?? 80) + boost,
    minSellScore: (cfg.minSellScore ?? 80) + Math.max(0, boost),
    maxSpreadPips: session.maxSpreadPips ?? cfg.maxSpreadPips,
    smartMaxEntriesPerCycle: session.maxEntriesPerCycle ?? cfg.smartMaxEntriesPerCycle,
    pairMaxTradesPerDay: session.pairMaxTradesPerDay ?? cfg.pairMaxTradesPerDay,
    pairTier2MinBuyScore: session.tier2MinBuyScore ?? cfg.pairTier2MinBuyScore,
    sessionProfile: session,
  };
}

module.exports = { getSessionProfile, applySessionToConfig };
