function calcPositionSizeUsd(equityUsd, riskPerTradePct, entry, stopLoss) {
  const riskUsd = equityUsd * (riskPerTradePct / 100);
  const perShareRisk = Math.abs(entry - stopLoss);
  if (perShareRisk <= 0) return { riskUsd, positionSizeUsd: 0, quantity: 0 };
  const quantity = Math.floor(riskUsd / perShareRisk);
  const positionSizeUsd = quantity * entry;
  return {
    riskUsd: round2(riskUsd),
    positionSizeUsd: round2(positionSizeUsd),
    quantity,
  };
}

function applyRiskToSignals(signals, settings, riskState, openTradesCount) {
  const paused = riskState?.tradingPaused === true;
  const maxOpen = settings.maxOpenPositions ?? 2;
  const riskMultiplier = riskState?.regime === 'elevated' ? 0.5 : 1;
  const effectiveRiskPct = (settings.riskPerTradePct ?? 0.8) * riskMultiplier;

  return signals.map((sig) => {
    const copy = { ...sig };
    if (paused && copy.action === 'BUY') {
      copy.action = 'SKIP';
      copy.reason = `${copy.reason}; trading paused: ${riskState.pauseReason || 'limit'}`;
      return copy;
    }
    if (copy.action === 'BUY' && copy.entryPrice && copy.stopLoss) {
      const sizing = calcPositionSizeUsd(
        settings.equityUsd ?? 1700,
        effectiveRiskPct,
        copy.entryPrice,
        copy.stopLoss,
      );
      copy.riskPct = round2(effectiveRiskPct);
      copy.positionSizeUsd = sizing.positionSizeUsd;
      copy.quantity = sizing.quantity;
      if (sizing.quantity <= 0) {
        copy.action = 'SKIP';
        copy.reason = `${copy.reason}; position size 0`;
      }
    }
    return copy;
  });
}

function evaluateCircuitBreaker(riskState, settings, equityUsd) {
  const updates = {};
  let paused = riskState.tradingPaused === true;
  let reason = riskState.pauseReason || '';

  const high = riskState.equityHighUsd ?? equityUsd;
  const drawdown = high > 0 ? ((high - equityUsd) / high) * 100 : 0;
  updates.currentDrawdownPct = round2(drawdown);
  updates.equityHighUsd = Math.max(high, equityUsd);

  if (drawdown >= (settings.maxDrawdownPct ?? 15)) {
    paused = true;
    reason = `max drawdown ${drawdown.toFixed(1)}%`;
  }

  updates.tradingPaused = paused;
  updates.pauseReason = paused ? reason : '';
  return updates;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  calcPositionSizeUsd,
  applyRiskToSignals,
  evaluateCircuitBreaker,
};
