const { fetchChart } = require('./tradingMarketData');
const { fetchMacroSnapshot } = require('./tradingExternal');
const { scoreSymbol } = require('./tradingAnalysis');
const { calcPositionSizeUsd } = require('./tradingRisk');

const SIM_SOURCE = 'simulation';
const ACTIVE_STATUSES = ['open', 'pending_sim'];

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

function isSimulationMode(settings) {
  return settings?.mode === 'simulate';
}

function simCommissionPerSide(settings) {
  const fromSettings = Number(settings?.simCommissionPerSideUsd);
  if (Number.isFinite(fromSettings) && fromSettings >= 0) return round2(fromSettings);
  const fromEnv = Number(process.env.TRADING_SIM_COMMISSION_USD);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return round2(fromEnv);
  return 1;
}

function calcClosedPnl(entryPrice, exitPrice, quantity, commissionUsd) {
  const qty = Number(quantity) || 0;
  const entry = Number(entryPrice) || 0;
  const exit = Number(exitPrice) || 0;
  if (qty <= 0 || entry <= 0 || exit <= 0) {
    return { pnlUsd: null, pnlPct: null };
  }
  const buyTotal = entry * qty;
  const sellTotal = exit * qty;
  const pnlUsd = round2(sellTotal - buyTotal - (commissionUsd || 0));
  const pnlPct = buyTotal > 0 ? round2((pnlUsd / buyTotal) * 100) : null;
  return { pnlUsd, pnlPct };
}

function detectSimExit(trade, price, barLow, barHigh) {
  const stop = Number(trade.stopLoss);
  const tp = Number(trade.takeProfit);
  if (!Number.isFinite(stop) || !Number.isFinite(tp)) return null;

  const low = Number.isFinite(barLow) ? barLow : price;
  const high = Number.isFinite(barHigh) ? barHigh : price;
  const stopHit = low <= stop || price <= stop;
  const tpHit = high >= tp || price >= tp;

  if (stopHit && tpHit) {
    return { exitPrice: round2(stop), exitReason: 'stop' };
  }
  if (stopHit) {
    return { exitPrice: round2(stop), exitReason: 'stop' };
  }
  if (tpHit) {
    return { exitPrice: round2(tp), exitReason: 'take_profit' };
  }
  return null;
}

async function getSymbolMarket(symbol) {
  const chart = await fetchChart(symbol);
  const lastBar = chart.bars?.[chart.bars.length - 1];
  return {
    chart,
    price: chart.lastPrice,
    low: lastBar?.low ?? chart.lastPrice,
    high: lastBar?.high ?? chart.lastPrice,
  };
}

async function simulatePendingEntries(models, settings) {
  const perSide = simCommissionPerSide(settings);
  const pending = await models.TradingTrade.find({
    status: 'pending_sim',
    source: SIM_SOURCE,
  });

  let filled = 0;
  for (const trade of pending) {
    try {
      const { price } = await getSymbolMarket(trade.symbol);
      if (price == null || price > trade.entryPrice) continue;

      await models.TradingTrade.updateOne(
        { _id: trade._id },
        {
          $set: {
            status: 'open',
            entryPrice: round2(Math.min(price, trade.entryPrice)),
            openedAt: new Date(),
            commissionUsd: perSide,
            notes: appendNote(trade.notes, `SIM fill LMT @ ${round2(trade.entryPrice)}`),
          },
        },
      );
      filled += 1;
    } catch (e) {
      console.warn('[sim] pending fill', trade.symbol, e.message);
    }
  }
  return filled;
}

async function simulateOpenExits(models, settings) {
  const perSide = simCommissionPerSide(settings);
  const open = await models.TradingTrade.find({
    status: 'open',
    source: SIM_SOURCE,
  });

  let closed = 0;
  for (const trade of open) {
    try {
      const { price, low, high } = await getSymbolMarket(trade.symbol);
      const exit = detectSimExit(trade, price, low, high);
      if (!exit) continue;

      const buyCommission = Number(trade.commissionUsd) || perSide;
      const totalCommission = round2(buyCommission + perSide);
      const { pnlUsd, pnlPct } = calcClosedPnl(
        trade.entryPrice,
        exit.exitPrice,
        trade.quantity,
        totalCommission,
      );

      await models.TradingTrade.updateOne(
        { _id: trade._id },
        {
          $set: {
            status: 'closed',
            exitPrice: exit.exitPrice,
            exitReason: exit.exitReason,
            closedAt: new Date(),
            commissionUsd: totalCommission,
            pnlUsd,
            pnlPct,
            notes: appendNote(
              trade.notes,
              `SIM close ${exit.exitReason} @ ${exit.exitPrice} · P/L ${pnlUsd ?? '—'}`,
            ),
          },
        },
      );
      closed += 1;
    } catch (e) {
      console.warn('[sim] exit check', trade.symbol, e.message);
    }
  }
  return closed;
}

async function processSimBuySignals(models, buySignals, settings) {
  const created = [];
  if (!buySignals?.length) return created;

  const perSide = simCommissionPerSide(settings);

  for (const sig of buySignals) {
    const symbol = String(sig.symbol || '').trim().toUpperCase();
    if (!symbol || sig.quantity <= 0) continue;

    const existing = await models.TradingTrade.findOne({
      symbol,
      source: SIM_SOURCE,
      status: { $in: ACTIVE_STATUSES },
    }).lean();
    if (existing) continue;

    let fillNow = true;
    let marketPrice = sig.entryPrice;
    try {
      const market = await getSymbolMarket(symbol);
      marketPrice = market.price ?? sig.entryPrice;
      fillNow = marketPrice != null && marketPrice <= sig.entryPrice;
    } catch (_) {
      fillNow = true;
    }

    const trade = await models.TradingTrade.create({
      symbol,
      side: 'long',
      status: fillNow ? 'open' : 'pending_sim',
      entryPrice: sig.entryPrice,
      quantity: sig.quantity,
      stopLoss: sig.stopLoss,
      takeProfit: sig.takeProfit,
      openedAt: fillNow ? new Date() : undefined,
      commissionUsd: fillNow ? perSide : 0,
      source: SIM_SOURCE,
      signalId: sig._id,
      notes: fillNow
        ? `[simulation] BUY filled @ ${sig.entryPrice} · SL ${sig.stopLoss} · TP ${sig.takeProfit}`
        : `[simulation] LMT pending @ ${sig.entryPrice} · market ${marketPrice ?? '—'}`,
    });

    created.push(trade.toObject());
  }

  return created;
}

async function runSimulationCycle(models, settings, options = {}) {
  const stats = {
    pendingFilled: 0,
    exitsClosed: 0,
    buysCreated: 0,
  };

  stats.pendingFilled = await simulatePendingEntries(models, settings);
  stats.exitsClosed = await simulateOpenExits(models, settings);

  const { buySignals = [], autoEnabled = false } = options;
  if (autoEnabled && buySignals.length) {
    const created = await processSimBuySignals(models, buySignals, settings);
    stats.buysCreated = created.length;
  }

  return stats;
}

async function createDemoSimulationTrade(models, settings, symbolInput) {
  if (!isSimulationMode(settings)) {
    const err = new Error('Увімкніть режим simulate в налаштуваннях');
    err.code = 'NOT_SIM_MODE';
    throw err;
  }

  const symbol = String(symbolInput || settings.watchlist?.[0] || 'SPY').trim().toUpperCase();
  if (!symbol) {
    throw new Error('Symbol required');
  }

  const existing = await models.TradingTrade.findOne({
    symbol,
    source: SIM_SOURCE,
    status: { $in: ACTIVE_STATUSES },
  }).lean();
  if (existing) {
    const err = new Error(`Вже є активна сим-угода по ${symbol}`);
    err.code = 'DUPLICATE';
    throw err;
  }

  const macro = await fetchMacroSnapshot();
  const chart = await fetchChart(symbol);
  const scored = scoreSymbol(chart, macro);
  const perSide = simCommissionPerSide(settings);
  const effectiveRiskPct = macro.regime === 'elevated'
    ? (settings.riskPerTradePct ?? 0.8) * 0.5
    : (settings.riskPerTradePct ?? 0.8);

  const sizing = calcPositionSizeUsd(
    settings.equityUsd ?? 1700,
    effectiveRiskPct,
    scored.entryPrice,
    scored.stopLoss,
  );

  if (sizing.quantity <= 0) {
    throw new Error('Розмір позиції 0 — перевір equity / stop');
  }

  const trade = await models.TradingTrade.create({
    symbol,
    side: 'long',
    status: 'open',
    entryPrice: scored.entryPrice,
    quantity: sizing.quantity,
    stopLoss: scored.stopLoss,
    takeProfit: scored.takeProfit,
    openedAt: new Date(),
    commissionUsd: perSide,
    source: SIM_SOURCE,
    notes: `[simulation demo] score ${scored.finalScore} · ${scored.reason}`,
  });

  return {
    trade: trade.toObject(),
    analysis: scored,
    commissionPerSide: perSide,
  };
}

function appendNote(existing, line) {
  const base = String(existing || '').trim();
  if (!base) return line;
  if (base.includes(line)) return base;
  return `${base} | ${line}`;
}

module.exports = {
  isSimulationMode,
  simCommissionPerSide,
  runSimulationCycle,
  processSimBuySignals,
  createDemoSimulationTrade,
  SIM_SOURCE,
  ACTIVE_STATUSES,
};
