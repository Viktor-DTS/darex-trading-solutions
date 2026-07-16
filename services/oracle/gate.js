const { getClosedTrades } = require('../testbot/journal');
const { summarizeOracleStats } = require('./stats');

function pairToxicity(pair, cfg = {}) {
  const journalFile = cfg.testbotJournalFile || 'testbot-trades.jsonl';
  const minTrades = cfg.toxicMinTrades ?? 10;
  const maxWr = cfg.toxicWr ?? 0.4;

  const closed = getClosedTrades(500, journalFile).filter((t) => t.pair === pair);
  if (closed.length < minTrades) {
    return { toxic: false, trades: closed.length, wr: null };
  }
  const wins = closed.filter((t) => (t.pnlUsd ?? 0) > 0).length;
  const wr = wins / closed.length;
  const instantStops = closed.filter((t) => t.durationMs != null && t.durationMs < 3000 && (t.pnlUsd ?? 0) <= 0).length;
  const instantRate = instantStops / closed.length;

  const toxic = wr < maxWr || instantRate > 0.5;
  return {
    toxic,
    trades: closed.length,
    wr: Math.round(wr * 1000) / 10,
    instantRate: Math.round(instantRate * 1000) / 10,
    reason: toxic
      ? (wr < maxWr ? `pair WR ${(wr * 100).toFixed(0)}%` : `instant stop ${(instantRate * 100).toFixed(0)}%`)
      : null,
  };
}

/**
 * Hard gate: no entry without passing oracle checks.
 */
function oracleGateAllows(oracle, analysis, cfg = {}) {
  if (cfg.enabled === false) {
    return { ok: true, reason: 'oracle disabled' };
  }

  if (!oracle?.ok) {
    return { ok: false, reason: oracle?.reason || 'oracle fail' };
  }

  if (cfg.tradeEnabled === false) {
    return { ok: false, reason: 'oracle trade disabled (calibration)' };
  }

  const stats = summarizeOracleStats(cfg, cfg.statsWindow ?? 200);
  if (!stats.calibrationOk && stats.samples >= (cfg.minStatsSamples ?? 30)) {
    return {
      ok: false,
      reason: `oracle calibration fail hit=${stats.directionHitPct}%`,
      stats,
    };
  }

  const minP = cfg.minPUp ?? 0.55;
  const minKappa = cfg.minKappa ?? 0.55;
  const minPTp = cfg.minPTp ?? 0.52;
  const side = analysis?.side;

  if (oracle.kappa < minKappa) {
    return { ok: false, reason: `oracle κ=${oracle.kappa.toFixed(2)} < ${minKappa}`, stats };
  }

  const microMin = cfg.microMinBarsInStop ?? 1.5;
  if (microMin > 0 && !oracle.microOk) {
    return { ok: false, reason: oracle.microReason || 'oracle micro fail', stats };
  }
  if (side === 'long' && oracle.pUp < minP) {
    return { ok: false, reason: `oracle pUp=${(oracle.pUp * 100).toFixed(1)}% < ${(minP * 100).toFixed(0)}% (long)`, stats };
  }
  if (side === 'short' && oracle.pUp > (1 - minP)) {
    return { ok: false, reason: `oracle pUp=${(oracle.pUp * 100).toFixed(1)}% > ${((1 - minP) * 100).toFixed(0)}% (short)`, stats };
  }

  if (oracle.pHitTpBeforeSl != null && minPTp > 0 && oracle.pHitTpBeforeSl < minPTp) {
    return {
      ok: false,
      reason: `oracle P(TP)=${(oracle.pHitTpBeforeSl * 100).toFixed(1)}% < ${(minPTp * 100).toFixed(0)}%`,
      stats,
    };
  }

  const execSide = side === 'short' ? 'short' : side === 'long' ? 'long' : null;
  const oracleSide = oracle.direction === 'up' ? 'long' : 'short';
  if (!cfg.skipDirectionMatch && execSide && execSide !== oracleSide) {
    return {
      ok: false,
      reason: `oracle ${oracle.direction} vs exec ${execSide}`,
      stats,
    };
  }

  if (cfg.respectInvert !== false && !cfg.skipDirectionMatch && analysis?.testbotInverted) {
    const signalSide = analysis.testbotSignalAction === 'BUY' ? 'long'
      : analysis.testbotSignalAction === 'SELL' ? 'short' : null;
    if (signalSide && signalSide === oracleSide && execSide !== oracleSide) {
      return {
        ok: false,
        reason: 'invert opposes oracle direction',
        stats,
      };
    }
  }

  const tox = pairToxicity(analysis?.pair || oracle.pair, cfg);
  if (tox.toxic) {
    return { ok: false, reason: `toxic pair: ${tox.reason}`, stats, tox };
  }

  const pairStats = stats.byPair?.[oracle.pair];
  if (pairStats && pairStats.total >= (cfg.toxicMinTrades ?? 10) && pairStats.hitRate < (cfg.minPairHitRate ?? 0.5)) {
    return {
      ok: false,
      reason: `oracle pair hit ${Math.round(pairStats.hitRate * 100)}%`,
      stats,
    };
  }

  return { ok: true, reason: oracle.reason, stats, tox };
}

module.exports = {
  oracleGateAllows,
  pairToxicity,
};
