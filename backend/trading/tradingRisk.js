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

/** Не більше акцій, ніж дозволяє капітал (long-only). */
function capQuantityByEquity(quantity, equityUsd, entryPrice, bufferPct = 0.98) {
  const qty = Number(quantity) || 0;
  const equity = Number(equityUsd) || 0;
  const entry = Number(entryPrice) || 0;
  if (qty <= 0 || entry <= 0 || equity <= 0) return 0;
  const maxQty = Math.floor((equity * bufferPct) / entry);
  if (maxQty < 1) return 0;
  return Math.min(qty, maxQty);
}

/** Active на малому рахунку: 1 акція; sizing за targetRiskPerTradeUsd. */
function calcActivePositionSize(settings, entry, stopLoss) {
  const equity = Number(settings?.equityUsd) || 1700;
  const entryPrice = Number(entry) || 0;
  const stop = Number(stopLoss) || 0;
  if (entryPrice <= 0) return { quantity: 0, positionSizeUsd: 0, riskUsd: 0 };

  const maxByEquity = capQuantityByEquity(Number.MAX_SAFE_INTEGER, equity, entryPrice);
  if (maxByEquity < 1) return { quantity: 0, positionSizeUsd: 0, riskUsd: 0 };

  if (equity < 10000) {
    return {
      quantity: 1,
      positionSizeUsd: round2(entryPrice),
      riskUsd: round2(Math.abs(entryPrice - stop)),
    };
  }

  const riskUsd = Number(settings?.targetRiskPerTradeUsd) || 4;
  const perShareRisk = Math.abs(entryPrice - stop);
  let quantity = perShareRisk > 0 ? Math.floor(riskUsd / perShareRisk) : 1;
  quantity = Math.max(1, quantity);
  quantity = capQuantityByEquity(quantity, equity, entryPrice);
  return {
    quantity,
    positionSizeUsd: round2(quantity * entryPrice),
    riskUsd: round2(riskUsd),
  };
}

function applyDailyEntryBlocks(signals, dailyLimits, sessionOpen) {
  if (!dailyLimits?.blockNewEntries && sessionOpen !== false) return signals;

  return signals.map((sig) => {
    if (sig.action !== 'BUY') return sig;
    const copy = { ...sig, action: 'SKIP' };
    if (dailyLimits?.blockNewEntries) {
      copy.reason = `${sig.reason}; ${dailyLimits.blockReason}`;
    } else if (sessionOpen === false) {
      copy.reason = `${sig.reason}; поза торговим вікном (active)`;
    }
    return copy;
  });
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
      const sizing = settings?.strategyProfile === 'active'
        ? calcActivePositionSize(settings, copy.entryPrice, copy.stopLoss)
        : calcPositionSizeUsd(
          settings.equityUsd ?? 1700,
          effectiveRiskPct,
          copy.entryPrice,
          copy.stopLoss,
        );
      if (settings?.strategyProfile !== 'active') {
        sizing.quantity = capQuantityByEquity(
          sizing.quantity,
          settings.equityUsd ?? 1700,
          copy.entryPrice,
        );
        sizing.positionSizeUsd = round2(sizing.quantity * copy.entryPrice);
      }
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
  capQuantityByEquity,
  calcActivePositionSize,
  applyRiskToSignals,
  applyDailyEntryBlocks,
  evaluateCircuitBreaker,
};
