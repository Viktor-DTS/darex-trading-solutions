const crypto = require('crypto');
const {
  initTradingModels,
  ensureDefaultSettings,
  ensureRiskState,
} = require('./tradingModels');
const { analyzeWatchlist } = require('./tradingAnalysis');
const { fetchMacroSnapshot } = require('./tradingExternal');
const { applyRiskToSignals, evaluateCircuitBreaker } = require('./tradingRisk');
const { notifyTradingScan, notifyBuySignals, isTelegramConfigured, isBuyOnlyTelegram } = require('./tradingTelegram');
const { processBuySignals } = require('./ibkrOrders');
const { syncTradesFromIbkr } = require('./ibkrTradeSync');
const { isIbkrFullyConfigured } = require('./ibkrApi');
const { isSimulationMode, runSimulationCycle, applySimulationSizingToSignals } = require('./tradeSimulator');

const ACTIVE_TRADE_STATUSES = ['open', 'pending_ibkr', 'pending_sim'];

let scanRunning = false;

function newScanId() {
  return crypto.randomBytes(8).toString('hex');
}

function isCronTrigger(triggeredBy) {
  return String(triggeredBy || '').includes('cron');
}

async function runTradingScan(getAssistantConnection, options = {}) {
  if (scanRunning) {
    return { ok: false, skipped: true, reason: 'scan already running' };
  }

  const models = initTradingModels(getAssistantConnection);
  if (!models.conn) {
    return { ok: false, error: 'Assistant MongoDB unavailable' };
  }

  scanRunning = true;
  const scanId = newScanId();
  const startedAt = Date.now();
  const triggeredBy = options.triggeredBy || 'manual';

  try {
    const settings = await ensureDefaultSettings(models);
    const riskState = await ensureRiskState(models);
    const macro = await fetchMacroSnapshot();

    await models.TradingExternalSnapshot.create({
      vix: macro.vix,
      regime: macro.regime,
      us10y: macro.us10y,
      macroNotes: macro.macroNotes,
      scanId,
    });

    const watchlist = Array.isArray(settings.watchlist) ? settings.watchlist : [];
    let signals = await analyzeWatchlist(watchlist, macro);

    const openCount = await models.TradingTrade.countDocuments({
      status: { $in: ACTIVE_TRADE_STATUSES },
    });
    signals = applyRiskToSignals(signals, settings, { ...riskState, regime: macro.regime }, openCount);
    if (isSimulationMode(settings)) {
      signals = applySimulationSizingToSignals(signals, settings, { regime: macro.regime });
    }

    const savedSignals = [];
    for (const sig of signals) {
      const doc = await models.TradingSignal.create({
        ...sig,
        scanId,
        meta: { indicators: sig.indicators, riskReward: sig.riskReward, quantity: sig.quantity },
      });
      savedSignals.push(doc.toObject());
    }

    const buySignals = savedSignals.filter((s) => s.action === 'BUY');
    let tradesCreatedCount = 0;
    let simulation = null;
    let ibkrSync = null;

    if (isSimulationMode(settings)) {
      simulation = await runSimulationCycle(models, settings, {
        buySignals,
        autoEnabled: settings.autoEnabled && !riskState.tradingPaused,
      });
      tradesCreatedCount = simulation.buysCreated;
    } else if (buySignals.length && settings.autoEnabled && !riskState.tradingPaused) {
      const tradesCreated = await processBuySignals(models, buySignals, settings);
      tradesCreatedCount = tradesCreated.length;
    }

    if (!isSimulationMode(settings) && isIbkrFullyConfigured()) {
      ibkrSync = await syncTradesFromIbkr(models, { triggeredBy });
    }

    const openCountAfter = await models.TradingTrade.countDocuments({
      status: { $in: ACTIVE_TRADE_STATUSES },
    });

    const riskUpdates = evaluateCircuitBreaker(riskState, settings, settings.equityUsd ?? 1700);
    const riskSet = {
      ...riskUpdates,
      vix: macro.vix,
      regime: macro.regime,
      openPositionsCount: openCountAfter,
      lastScanAt: new Date(),
      lastScanStatus: 'ok',
      lastTriggeredBy: triggeredBy,
    };
    if (isCronTrigger(triggeredBy)) {
      riskSet.lastCronAt = new Date();
    }

    await models.TradingRiskState.updateOne({ key: 'global' }, { $set: riskSet }, { upsert: true });

    if (process.env.TRADING_TELEGRAM_NOTIFY !== '0') {
      if (buySignals.length) {
        await notifyBuySignals({
          scanId,
          regime: macro.regime,
          vix: macro.vix,
          buys: buySignals,
          mode: settings.mode,
          autoEnabled: settings.autoEnabled,
          triggeredBy,
        });
      } else if (!isBuyOnlyTelegram()) {
        await notifyTradingScan({
          scanId,
          regime: macro.regime,
          vix: macro.vix,
          signals: savedSignals,
          mode: settings.mode,
          autoEnabled: settings.autoEnabled,
          triggeredBy,
        });
      }
    }

    return {
      ok: true,
      scanId,
      durationMs: Date.now() - startedAt,
      regime: macro.regime,
      vix: macro.vix,
      signalCount: savedSignals.length,
      buyCount: buySignals.length,
      tradesCreated: tradesCreatedCount,
      simulation,
      ibkrSync,
      signals: savedSignals,
      triggeredBy,
    };
  } catch (e) {
    console.error('[trading-scan]', e);
    try {
      await models.TradingRiskState.updateOne(
        { key: 'global' },
        {
          $set: {
            lastScanAt: new Date(),
            lastScanStatus: `error: ${e.message}`,
            lastTriggeredBy: triggeredBy,
          },
        },
        { upsert: true },
      );
    } catch (_) {
      /* ignore */
    }
    return { ok: false, error: e.message };
  } finally {
    scanRunning = false;
  }
}

const SCAN_INTERVAL_MS = parseInt(process.env.TRADING_SCAN_INTERVAL_MS || String(60 * 60 * 1000), 10);

function scheduleTradingScanJob(getAssistantConnection) {
  if (process.env.TRADING_SCAN_ENABLED !== '1') {
    console.log('[trading] Scheduled scan disabled (TRADING_SCAN_ENABLED != 1)');
    return;
  }

  console.log(`[trading] Scheduled scan every ${SCAN_INTERVAL_MS}ms`);

  setInterval(() => {
    runTradingScan(getAssistantConnection, { triggeredBy: 'interval' })
      .then((r) => {
        if (r.ok) {
          console.log(`[trading] scan ok ${r.scanId} buys=${r.buyCount}`);
        } else if (!r.skipped) {
          console.warn('[trading] scan failed', r.error || r.reason);
        }
      })
      .catch((e) => console.error('[trading] interval', e));
  }, SCAN_INTERVAL_MS);

  setTimeout(() => {
    runTradingScan(getAssistantConnection, { triggeredBy: 'startup' }).catch((e) =>
      console.error('[trading] startup scan', e),
    );
  }, 60000);
}

module.exports = {
  runTradingScan,
  scheduleTradingScanJob,
};
