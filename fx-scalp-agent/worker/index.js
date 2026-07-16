require('dotenv').config();
const config = require('../config');
const { MarketDataHub } = require('../services/market-data');
const isCharlie = config.charlieMode === true;
const idealAnalyzer = require('../services/analyzer');
const charlieAnalyzer = require('../services/analyzer/charlie');
const { realizedRangePips } = require('../services/analyzer/charlie/pairRank');
const {
  buildActivePairPool,
  pruneSetupJournalIfNeeded,
} = require('../services/analyzer/charlie/activePool');
const { runCapitalMarketHunt } = require('../services/analyzer/charlie/marketHunt');
const { loadUniverseJournal, reconcileUniverseJournal } = require('../services/analyzer/charlie/universeJournal');
const { appendPairPulse, uniquePairsInPulse, prunePairPulse } = require('../services/analyzer/charlie/pairPulse');
const { getCapitalDataClient } = require('../services/market-data/capitalFx');
const { checkCharlieCorrelation } = require('../services/analyzer/charlie/correlation');
const { markSetupUsed } = require('../services/analyzer/charlie/setupJournal');
const analyzePairFn = isCharlie ? charlieAnalyzer.analyzePairCharlie : idealAnalyzer.analyzePair;
const { createRiskState, checkEntryAllowed } = require('../services/risk');
const { createPairCooldown } = require('../services/risk/pairCooldown');
const { checkCurrencyExposure } = require('../services/risk/currencyExposure');
const { createExecutor, resolveExecutorMode } = require('../services/executor');
const { isPairDailyLimitReached } = require('../services/risk/pairDailyLimit');
const { appendEvent, summarize, getOpenEntries, getTodayClosedPnl, getTodayEntryCount, dayKeyFromTs } = require('../services/journal');
const { writeState } = require('../services/state');
const { claimWorkerLock, releaseWorkerLock } = require('../services/stateCache');
const { runLearningCycle } = require('../services/learning');
const { round, normPair, pipSize, priceToPips } = require('../services/utils');
const { pipValueUsd, enrichTradeSizing } = require('../services/executor/pricing');
const { fetchMacroSnapshot } = require('../services/macro/snapshot');
const { isJpyCross } = require('../services/macro/jpyBias');
const { rankEntriesBalanced } = require('../services/analyzer/bidirectional');
const { trackWatchCycle, getWatchPromotions, clearWatch } = require('../services/analyzer/watchTracker');
const { checkPairAllowed } = require('../services/risk/pairFilter');
const { checkPairTierLiquidity, getMinScoreForPair, getPairTier } = require('../services/risk/pairTier');
const { getSessionProfile, applySessionToConfig } = require('../services/learning/sessionAdapt');
const { applyBreakevenIfNeeded } = require('../services/executor/breakeven');
const { evaluatePositionAction } = require('../services/executor/positionMonitor');
const { analyzeOpenPosition } = require('../services/analyzer/openPosition');
const { sendTradeAlert, isTelegramConfigured } = require('../services/notify/telegram');
const { formatWorkerOnline, formatEntryAlert, formatExitAlert } = require('../services/notify/messages');
const { createSimExecutor } = require('../services/executor/sim');
const {
  filterTestbotSignals,
  prepareTestbotAnalysis,
  buildTestbotTrade,
  evaluateTestbotExit,
  unrealizedPnlUsd,
  closeTestbotTrade,
  resolveTestbotCandidate,
} = require('../services/testbot/runner');
const {
  hydrateFromClosedTrades: hydrateTestbotPairCooldown,
  markPairExit: markTestbotPairExit,
  cooldownRemainingMs: testbotCooldownRemainingMs,
  hadPriorExit: testbotHadPriorExit,
} = require('../services/testbot/pairCooldown');
const {
  appendTestbotEvent,
  summarize: summarizeTestbot,
  getOpenEntries: getTestbotOpenEntries,
  getTodayClosedPnl: getTestbotTodayPnl,
  getTodayEntryCount: getTestbotTodayEntries,
  clearTestbotJournal,
  getClosedTrades: getTestbotClosedTrades,
} = require('../services/testbot/journal');
const { consumeTestbotClearRequest } = require('../services/testbot/clearRequest');
const { mergeTestbotConfig } = require('../services/testbot/runtimeSettings');
const {
  forecastOracle5m,
  oracleGateAllows,
  registerPendingForecast,
  loadPendingFromDisk,
  reconcileOracleActuals,
  summarizeOracleStats,
  getPendingCount,
  getPendingForecastsSnapshot,
  hasPendingForPair,
} = require('../services/oracle');

const tbBase = config.testbot || {};
function getTbCfg() {
  return mergeTestbotConfig(tbBase);
}
function getOracleCfg() {
  const o = config.oracle || {};
  const tbMicro = process.env.FX_TESTBOT_ORACLE_MICRO_BARS;
  const microMin = tbMicro != null && String(tbMicro).trim() !== ''
    ? Number(tbMicro)
    : 0;
  const tbMinP = process.env.FX_TESTBOT_ORACLE_MIN_P_UP;
  const minPUp = tbMinP != null && String(tbMinP).trim() !== ''
    ? Number(tbMinP)
    : 0.40;
  // 0 = вимкнути calibration block на sim (інакше spam-прогнози вбивають hit rate)
  const tbMinHit = process.env.FX_TESTBOT_ORACLE_MIN_DIRECTION_HIT;
  const minDirectionHitRate = tbMinHit != null && String(tbMinHit).trim() !== ''
    ? Number(tbMinHit)
    : 0;
  const tbMicroM1 = process.env.FX_TESTBOT_ORACLE_MICRO_M1;
  const microMinM1 = tbMicroM1 != null && String(tbMicroM1).trim() !== ''
    ? Number(tbMicroM1)
    : 1;
  // 0 = не блокувати по P(TP): при $3 SL і wide TP theta майже завжди <40%
  const tbMinPTp = process.env.FX_TESTBOT_ORACLE_MIN_P_TP;
  const minPTp = tbMinPTp != null && String(tbMinPTp).trim() !== ''
    ? Number(tbMinPTp)
    : 0;
  const tbMinKappa = process.env.FX_TESTBOT_ORACLE_MIN_KAPPA;
  const minKappa = tbMinKappa != null && String(tbMinKappa).trim() !== ''
    ? Number(tbMinKappa)
    : 0.30;
  return {
    ...o,
    microMinBarsInStop: Number.isFinite(microMin) ? microMin : 0,
    microMinM1: Number.isFinite(microMinM1) ? microMinM1 : 1,
    minPUp: Number.isFinite(minPUp) ? minPUp : 0.40,
    minKappa: Number.isFinite(minKappa) ? minKappa : 0.30,
    minPTp: Number.isFinite(minPTp) ? minPTp : 0,
    minDirectionHitRate: Number.isFinite(minDirectionHitRate) ? minDirectionHitRate : 0,
    skipDirectionMatch: process.env.FX_TESTBOT_ORACLE_SOFT_DIR === '1',
    testbotJournalFile: getTbCfg().journalFile || testbotJournalFile,
  };
}
const testbotEnabled = tbBase.enabled === true;
const testbotJournalFile = tbBase.journalFile || 'testbot-trades.jsonl';
const testbotExecutor = testbotEnabled
  ? createSimExecutor({
    ...config,
    ...tbBase,
    executor: 'sim',
    simulate: true,
    maxOpenPositions: tbBase.maxOpenPositions ?? 20,
    equityUsd: tbBase.equityUsd ?? 1000,
    riskPerTradePct: tbBase.riskPerTradePct ?? 0.35,
    stopPips: tbBase.stopPips ?? 3,
    breakevenEnabled: false,
    positionMgmt: false,
    simCommissionUsd: tbBase.simCommissionUsd ?? 0.05,
  })
  : null;
const testbotRisk = {
  dayKey: new Date().toISOString().slice(0, 10),
  dailyPnlUsd: 0,
  tradesToday: 0,
  equityUsd: tbBase.equityUsd ?? 1000,
};
let lastTestbotEntryAt = 0;

const hub = new MarketDataHub({ pairs: config.pairs, provider: config.dataProvider });
const risk = createRiskState();
const pairCooldown = createPairCooldown(config);
const executor = createExecutor();
const executorMode = resolveExecutorMode(config);
const brokerMode = executorMode === 'oanda' || executorMode === 'capital';
let tickCount = 0;
let lastAnalyses = [];
let lastAnalysis = null;
let lastAnalyzeAt = 0;

const ANALYZE_GAP_MS = config.analyzeGapMs > 0
  ? config.analyzeGapMs
  : (config.dataProvider === 'oanda'
    ? 2000
    : Math.max(config.tickMs * 5, config.pairs.length * 500, 10000));
const TICK_LOG_MS = Number(process.env.FX_TICK_LOG_MS) || 30000;
const VERBOSE_TICK = process.env.FX_VERBOSE_TICK === '1';
let lastTickLogAt = 0;
let lastStateWriteWarnAt = 0;
/** London session stop-loss counter for CHARLIE (reset each UTC day). */
let charlieSessionSl = { dayKey: '', count: 0, stopped: false };
let charlieFocusPairs = [];
let lastSetupPruneAt = 0;
let lastMarketHuntAt = 0;
let lastSoftRotateAt = 0;
let charlieUniversePairs = [];
/** Last universe ↑↓ for panel */
let charlieUniverseChurn = { replaced: [], demoted: [], core: [], rotating: [], updatedAt: null, source: null };
/** Last focus churn + pulse KPI */
let charliePulseMeta = { promoted: [], demoted: [], unique1h: 0, scan: [], updatedAt: null };
/** @type {Map<string, { rankIndex: number, rankScore: number, atrPips: number|null, rangePips: number|null, alive: boolean }>} */
let charlieRankByPair = new Map();
/** Cached macro for position mgmt between full analyze cycles. */
let cachedMacroForMgmt = null;
let openMonitorBusy = false;
let lastOpenBrokerSyncAt = 0;
let lastOpenMarkPublishAt = 0;
let lastTestbotPublishAt = 0;

const OPEN_MONITOR_MS = config.openMonitorMs > 0 ? config.openMonitorMs : config.tickMs;
const OPEN_BROKER_SYNC_MS = config.openBrokerSyncMs > 0 ? config.openBrokerSyncMs : 5000;

function syncTestbotDailyPnl() {
  const dayKey = new Date().toISOString().slice(0, 10);
  testbotRisk.dayKey = dayKey;
  testbotRisk.dailyPnlUsd = round(getTestbotTodayPnl(dayKey, testbotJournalFile), 2);
  testbotRisk.tradesToday = getTestbotTodayEntries(dayKey, testbotJournalFile);
}

function resetTestbotRuntime() {
  if (!testbotExecutor) return;
  if (typeof testbotExecutor.reset === 'function') {
    testbotExecutor.reset();
  }
  testbotRisk.dayKey = new Date().toISOString().slice(0, 10);
  testbotRisk.dailyPnlUsd = 0;
  testbotRisk.tradesToday = 0;
  testbotRisk.equityUsd = getTbCfg().equityUsd ?? 1000;
}

function applyTestbotClearIfRequested() {
  if (!testbotEnabled || !testbotExecutor) return false;
  const req = consumeTestbotClearRequest();
  if (!req) return false;
  resetTestbotRuntime();
  syncTestbotDailyPnl();
  console.log('[tb-reset] sim state cleared — journal wipe applied');
  publishState({}, true);
  return true;
}

function buildTestbotLivePositions() {
  if (!testbotExecutor) return [];
  const simCfg = { ...config, ...getTbCfg(), equityUsd: getTbCfg().equityUsd ?? 1000 };
  return testbotExecutor.getOpenTrades().map((t) => {
    const snap = hub.getPairSnapshot(t.pair);
    const enriched = enrichTradeSizing(t, simCfg);
    const mark = t.side === 'short'
      ? (t.lastAsk ?? snap?.ask ?? snap?.mid ?? null)
      : (t.lastBid ?? snap?.bid ?? snap?.mid ?? null);
    const quote = snap ? { bid: snap.bid, ask: snap.ask, mid: snap.mid } : null;
    const unrealized = quote ? unrealizedPnlUsd(t, quote, 0) : null;
    const ageSec = Math.round((Date.now() - (t.openedAt || 0)) / 1000);
    return {
      pair: t.pair,
      side: t.side,
      entry: t.entry,
      mark: mark != null ? round(mark, 5) : null,
      lots: enriched.lots,
      unrealizedPnlUsd: unrealized != null ? round(unrealized - (getTbCfg().simCommissionUsd ?? 0.05), 2) : null,
      targetUsd: t.targetUsd ?? getTbCfg().targetUsd ?? 1,
      partialUsd: t.partialUsd ?? getTbCfg().partialUsd ?? 0.5,
      ageSec,
      entryConviction: t.entryConviction ?? t.score,
    };
  });
}

async function analyzeTestbotPairFresh(pair) {
  const oracleMinM5 = Math.max(30, getOracleCfg().windowBars ?? 36);
  const snap = await hub.ensurePairHistory(pair, { minM5: oracleMinM5, minM1: 20 })
    .catch(() => hub.getPairSnapshot(pair));
  if (!snap) return null;

  const minBars = config.capitalMinBars ?? 15;
  const liveQuote = {
    bid: snap.bid,
    ask: snap.ask,
    mid: snap.mid,
    spreadPips: snap.spreadPips,
    source: snap.source,
  };
  const bars = snap.bars1m?.length >= minBars && snap.bars5m?.length >= minBars
    ? {
      m1: {
        bars: snap.bars1m,
        mid: snap.mid,
        bid: snap.bid,
        ask: snap.ask,
        spreadPips: snap.spreadPips,
        source: snap.source,
      },
      m5: { bars: snap.bars5m },
      h1: snap.bars1h?.length ? { bars: snap.bars1h } : undefined,
    }
    : null;

  return analyzePairFn(pair, { liveQuote, bars, macro: cachedMacroForMgmt });
}

async function processTestbotEntries(force = false) {
  if (!testbotExecutor || !lastAnalyses.length) return false;

  const now = Date.now();
  const entryGap = getTbCfg().entryIntervalMs ?? 2000;
  if (!force && now - lastTestbotEntryAt < entryGap) return false;

  syncTestbotDailyPnl();
  const maxOpen = getTbCfg().maxOpenPositions ?? 20;
  if (testbotExecutor.getOpenCount() >= maxOpen) return false;

  const maxDay = getTbCfg().maxTradesPerDay ?? 0;
  if (maxDay > 0 && testbotRisk.tradesToday >= maxDay) return false;

  const signals = filterTestbotSignals(lastAnalyses, getTbCfg());
  if (!signals.length) {
    if (force) console.log('[tb-skip] no eligible signals in lastAnalyses');
    return false;
  }

  let openedAny = false;
  let openedThisCycle = 0;
  const maxPerCycle = getTbCfg().maxEntriesPerCycle ?? 12;

  for (const raw of signals) {
    if (testbotExecutor.getOpenCount() >= maxOpen) break;
    if (openedThisCycle >= maxPerCycle) break;
    if (testbotExecutor.hasPair(raw.pair)) {
      console.log(`[tb-skip] ${raw.pair} sim already open`);
      continue;
    }
    if (!getTbCfg().allowCharlieOverlap && executor.hasPair(raw.pair)) {
      console.log(`[tb-skip] ${raw.pair} CHARLIE live position (overlap blocked)`);
      continue;
    }

    const cdMs = testbotCooldownRemainingMs(raw.pair, getTbCfg());
    if (cdMs > 0) {
      console.log(`[tb-skip] ${raw.pair} pair cooldown ${Math.round(cdMs / 1000)}s`);
      continue;
    }

    let candidate = raw;
    if (getTbCfg().reanalyzeAfterCooldown !== false && testbotHadPriorExit(raw.pair)) {
      try {
        const fresh = await analyzeTestbotPairFresh(raw.pair);
        if (!fresh) {
          console.log(`[tb-skip] ${raw.pair} re-analyze: no data`);
          continue;
        }
        const resolved = resolveTestbotCandidate(fresh, getTbCfg().minScore ?? 60);
        if (!resolved) {
          console.log(`[tb-skip] ${raw.pair} re-analyze: conv/action fail conv=${fresh.score ?? fresh.smart?.conviction ?? 0}`);
          continue;
        }
        candidate = resolved;
        const idx = lastAnalyses.findIndex((a) => a.pair === raw.pair);
        if (idx >= 0) lastAnalyses[idx] = fresh;
        console.log(`[tb-reanalyze] ${raw.pair} ${fresh.action}${fresh.setupDraft?.action ? ` draft=${fresh.setupDraft.action}` : ''} conv=${fresh.score ?? fresh.smart?.conviction ?? 0}`);
      } catch (e) {
        console.warn(`[tb-reanalyze] ${raw.pair}`, e.message);
        continue;
      }
    }

    let snap = hub.getPairSnapshot(raw.pair);
    const oracleCfg = getOracleCfg();
    const oracleMinM5 = Math.max(30, oracleCfg.windowBars ?? 36);
    if (oracleCfg.enabled) {
      try {
        snap = await hub.ensurePairHistory(raw.pair, { minM5: oracleMinM5, minM1: 20 }) || snap;
      } catch (e) {
        console.warn(`[tb-oracle] ${raw.pair} ensureBars`, e.message);
      }
    }

    const liveQuote = snap
      ? { bid: snap.bid, ask: snap.ask, mid: snap.mid, spreadPips: snap.spreadPips }
      : raw.quote;
    if (liveQuote?.mid == null && liveQuote?.bid == null && liveQuote?.ask == null) {
      console.log(`[tb-skip] ${raw.pair} no live quote`);
      continue;
    }

    const analysis = prepareTestbotAnalysis({ ...candidate, quote: liveQuote }, getTbCfg());
    if (!analysis) {
      console.log(`[tb-skip] ${raw.pair} prepare declined`);
      continue;
    }

    if (oracleCfg.enabled) {
      const m5n = snap?.bars5m?.length ?? 0;
      if (m5n < oracleMinM5) {
        console.log(`[tb-skip] ${raw.pair} oracle: need ≥${oracleMinM5} M5 bars (have ${m5n})`);
        continue;
      }
      // Не спамити jsonl кожні 2с — інакше hit rate падає до 0–2% і gate блокує все
      const alreadyPending = hasPendingForPair(raw.pair);
      const oracle = forecastOracle5m({
        pair: raw.pair,
        quote: liveQuote,
        barsM5: snap?.bars5m,
        barsM1: snap?.bars1m,
        analysis,
        cfg: { ...oracleCfg, logForecasts: !alreadyPending },
      });
      if (!oracle?.ok) {
        console.log(`[tb-skip] ${raw.pair} ${oracle.reason || 'oracle fail'}`);
        continue;
      }
      const gate = oracleGateAllows(oracle, analysis, oracleCfg);
      if (!gate.ok) {
        if (!alreadyPending) {
          registerPendingForecast({ ...oracle, linkedEntry: false });
        }
        console.log(`[tb-skip] ${raw.pair} ${gate.reason}`);
        continue;
      }
      registerPendingForecast({ ...oracle, linkedEntry: true });
      analysis.oracle5m = oracle;
    }

    const trade = buildTestbotTrade(analysis, getTbCfg());
    if (trade.units <= 0) {
      console.log(`[tb-skip] ${raw.pair} units=0`);
      continue;
    }

    const opened = testbotExecutor.tryOpen(analysis);
    if (!opened) {
      console.log(`[tb-skip] ${raw.pair} sim tryOpen declined open=${testbotExecutor.getOpenCount()}/${maxOpen}`);
      continue;
    }

    Object.assign(opened, {
      botKind: 'testbot',
      targetUsd: getTbCfg().targetUsd ?? 1,
      partialUsd: getTbCfg().partialUsd ?? 0.5,
      partialAfterMs: getTbCfg().partialAfterMs ?? 600000,
      maxHoldMs: getTbCfg().maxHoldMs ?? 900000,
      maxStopLossUsd: getTbCfg().maxStopLossUsd ?? 10,
      maxNetStopUsd: getTbCfg().maxStopLossUsd != null
        ? (getTbCfg().maxStopLossUsd + (getTbCfg().simCommissionUsd ?? 0.05))
        : 10.05,
      entryConviction: candidate._testbotConv ?? analysis.score,
      testbotSignalAction: analysis.testbotSignalAction,
      testbotInverted: analysis.testbotInverted,
    });

    testbotRisk.tradesToday += 1;
    appendTestbotEvent('entry', {
      ...opened,
      score: opened.entryConviction,
      oracle5m: analysis.oracle5m || null,
    }, testbotJournalFile);
    openedAny = true;
    openedThisCycle += 1;
    lastTestbotEntryAt = now;
    const sig = opened.testbotSignalAction || analysis.action;
    const inv = opened.testbotInverted ? ` signal=${sig}→${opened.side}` : '';
    const orc = analysis.oracle5m
      ? ` oracle=${analysis.oracle5m.direction} pUp=${(analysis.oracle5m.pUp * 100).toFixed(0)}% fc=${analysis.oracle5m.forecastMid_5m}`
      : '';
    console.log(`[tb-entry] ${opened.side} ${opened.pair} @ ${opened.entry} conv=${opened.entryConviction}${inv}${orc} SL≤$${opened.maxNetStopUsd ?? '1+comm'} target=$${opened.targetUsd} partial=$${opened.partialUsd}/${Math.round((opened.partialAfterMs || 600000) / 60000)}m`);
  }

  return openedAny;
}

async function monitorTestbotTrades() {
  if (!testbotExecutor) return false;
  const opens = testbotExecutor.getOpenTrades();
  if (!opens.length) return false;

  let closedAny = false;
  const simCfg = { ...config, ...getTbCfg(), simCommissionUsd: getTbCfg().simCommissionUsd ?? 0.05 };

  for (const t of testbotExecutor.getOpenTrades()) {
    try {
      const q = hub.getPairSnapshot(t.pair) || await hub.refreshPair(t.pair);
      if (!q) continue;

      if (q.bid != null) t.lastBid = q.bid;
      if (q.ask != null) t.lastAsk = q.ask;
      t.lastMark = t.side === 'short' ? q.ask ?? q.mid : q.bid ?? q.mid;
      t.lastMarkAt = Date.now();

      const decision = evaluateTestbotExit(t, q, simCfg);
      if (decision.action !== 'close') continue;

      const closed = closeTestbotTrade(testbotExecutor, t, decision.exitPrice, decision.reason, simCfg);
      if (!closed) continue;

      closedAny = true;
      markTestbotPairExit(closed.pair, closed.closedAt || Date.now());
      testbotRisk.dailyPnlUsd = round(testbotRisk.dailyPnlUsd + closed.pnlUsd, 2);
      appendTestbotEvent('exit', closed, testbotJournalFile);
      console.log(`[tb-exit] ${closed.side} ${closed.pair} ${closed.exitReason} pnl=$${closed.pnlUsd} day=$${testbotRisk.dailyPnlUsd}`);
    } catch (e) {
      console.warn(`[tb-monitor] ${t.pair}`, e.message);
    }
  }

  return closedAny;
}

function syncDailyPnlFromJournal() {
  const dayKey = new Date().toISOString().slice(0, 10);
  risk.dailyPnlUsd = round(getTodayClosedPnl(dayKey), 2);
  risk.tradesToday = getTodayEntryCount(dayKey);
}

function recordCharlieSessionExit(closed) {
  if (!isCharlie || !closed) return;
  const dayKey = new Date().toISOString().slice(0, 10);
  if (charlieSessionSl.dayKey !== dayKey) {
    charlieSessionSl = { dayKey, count: 0, stopped: false };
  }
  const reason = String(closed.exitReason || '').toLowerCase();
  if (reason.includes('stop') && !reason.includes('take')) {
    charlieSessionSl.count += 1;
    const maxSl = config.charlieSessionStopSl ?? 3;
    if (charlieSessionSl.count >= maxSl) {
      charlieSessionSl.stopped = true;
      console.log(`[fx-charlie] session stop after ${charlieSessionSl.count} SL — no more entries until next day`);
    }
  }
}

function skipHint(a) {
  if (a.action === 'BUY' || a.action === 'SELL') return '';

  if (a.pairStats?.paused) return 'pause';
  if (a.newsBlackout) return 'news';
  if (a.inSession === false) return 'session';

  const reason = String(a.reason || '').toLowerCase();

  if (reason.includes('spread') && reason.includes('max')) return 'spread';
  if (reason.includes('news blackout')) return 'news';
  if (reason.includes('outside session') || reason.includes('не торгуємо')) return 'session';
  if (reason.includes('regime gate')) return 'regime';

  const le = a.layerEval;
  if (le && le.pass === false) {
    return `layers ${le.alignedCount}/${le.minRequired}`;
  }

  const smart = a.smart;
  if (smart && smart.pass === false && smart.threshold != null) {
    return `conv<${smart.threshold}`;
  }

  if (reason.includes('conviction') && reason.includes('<')) {
    const m = reason.match(/conviction\s*(\d+)\s*<\s*(\d+)/);
    if (m) return `conv<${m[2]}`;
    return 'conv';
  }

  if (reason.includes('layers')) {
    const m = reason.match(/layers\s*(\d+\/\d+)/);
    if (m) return `layers ${m[1]}`;
    return 'layers';
  }

  if (a.regime === 'range' || reason.includes('range') || reason.includes('chop')) return 'range';
  if (a.action === 'WATCH') return 'near';

  return '';
}

function formatAnalysisBrief(a) {
  const conv = a.smart?.conviction ?? a.score ?? 0;
  const thr = a.smart?.threshold;
  const convStr = thr != null ? `${conv}/${thr}` : String(conv);
  const engineTag = a.signalEngine === 'charlie' ? ' [C]' : '';
  const alt = a.altSignal
    ? ` alt=${a.altSignal.action === 'SELL' ? 'S' : 'B'}${a.altSignal.score ?? '—'}`
    : '';
  const hint = skipHint(a);
  const tag = hint ? ` (${hint})` : '';
  return `${a.pair} ${a.action} c=${convStr}${engineTag}${alt}${tag}`;
}

function logScanSummary(analyses, entries) {
  const buys = analyses.filter((a) => a.action === 'BUY');
  const sells = analyses.filter((a) => a.action === 'SELL');
  const watches = analyses.filter((a) => a.action === 'WATCH');

  const ranked = analyses.slice().sort(
    (a, b) => (b.smart?.conviction ?? b.score ?? 0) - (a.smart?.conviction ?? a.score ?? 0),
  );
  const picked = new Map();
  for (const a of analyses) {
    if (a.action === 'BUY' || a.action === 'SELL' || a.action === 'WATCH') {
      picked.set(a.pair, a);
    }
  }
  for (const a of ranked) {
    if (picked.size >= 8) break;
    const conv = a.smart?.conviction ?? a.score ?? 0;
    if (conv <= 0 && a.action === 'SKIP') continue;
    if (!picked.has(a.pair)) picked.set(a.pair, a);
  }

  const header = `[fx-scan] BUY=${buys.length} SELL=${sells.length} WATCH=${watches.length} entries=${entries.length} dayPnl=$${risk.dailyPnlUsd}`;
  const interesting = [...picked.values()];
  if (!interesting.length) {
    console.log(header);
    return;
  }
  console.log(`${header} | ${interesting.map(formatAnalysisBrief).join(' · ')}`);
}

function maybeLogTick() {
  const now = Date.now();
  if (now - lastTickLogAt < TICK_LOG_MS) return;
  lastTickLogAt = now;

  const opens = executor.getOpenTrades();
  if (opens.length > 0) {
    const live = buildOpenPositionsLive();
    const summary = live.map((l) => {
      const pnl = l.unrealizedPips != null
        ? ` ${l.unrealizedPips >= 0 ? '+' : ''}${l.unrealizedPips}p $${l.unrealizedPnlUsd}`
        : '';
      const dist = l.pipsToTp != null && l.pipsToSl != null
        ? ` TP${l.pipsToTp}p SL${l.pipsToSl}p`
        : '';
      return `${l.pair} ${l.side}${pnl} @ ${l.mark ?? l.entry}${dist}`;
    }).join(' | ');
    console.log(`[fx-tick] ${summary}`);
    return;
  }

  if (VERBOSE_TICK && lastAnalyses.length > 0) {
    const summary = lastAnalyses
      .map((a) => `${a.pair} ${a.action} s=${a.score} ${a.regime}`)
      .join(' | ');
    console.log(`[fx-tick] ${summary}`);
    return;
  }

  if (lastAnalyses.length === 0) {
    console.log(`[fx-tick] ${config.pairs.join(',')} warming up ticks=${tickCount}`);
  }
}

function resetDayIfNeeded() {
  const key = new Date().toISOString().slice(0, 10);
  if (risk.dayKey !== key) {
    risk.dayKey = key;
    risk.dailyPnlUsd = 0;
    risk.tradesToday = 0;
    risk.tradingPaused = false;
    risk.pauseReason = '';
  }
  syncDailyPnlFromJournal();
  if (testbotEnabled) syncTestbotDailyPnl();
}

let lastStateWriteAt = 0;

function buildLiveForTrade(open, executorOpen) {
  const snap = hub.getPairSnapshot(open.pair);
  const t = enrichTradeSizing(executorOpen || open, config);
  const mark = t.side === 'short'
    ? (executorOpen?.lastAsk ?? executorOpen?.lastMark ?? snap?.ask ?? snap?.mid ?? null)
    : (executorOpen?.lastBid ?? executorOpen?.lastMark ?? snap?.bid ?? snap?.mid ?? null);
  if (mark == null) return { pair: open.pair, entry: open.entry, mark: null, lots: t.lots, side: t.side || 'long' };

  const pips = t.side === 'short'
    ? round(priceToPips(t.entry - mark, t.pair), 1)
    : round(priceToPips(mark - t.entry, t.pair), 1);
  const pipVal = t.pipValueUsd || pipValueUsd(t.units || 0, t.pair, mark);
  const unrealizedPnlUsd = round(pips * pipVal, 2);
  const ps = pipSize(t.pair);

  return {
    pair: t.pair,
    side: t.side || 'long',
    entry: t.entry,
    mark: round(mark, 5),
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    units: t.units,
    lots: t.lots,
    spreadPips: t.spreadPips,
    pipValueUsd: pipVal,
    unrealizedPips: pips,
    unrealizedPnlUsd,
    pipsToTp: t.takeProfit != null
      ? round((t.side === 'short' ? mark - t.takeProfit : t.takeProfit - mark) / ps, 1)
      : null,
    pipsToSl: t.stopLoss != null
      ? round((t.side === 'short' ? t.stopLoss - mark : mark - t.stopLoss) / ps, 1)
      : null,
    score: t.score,
    quoteUpdatedAt: snap?.updatedAt ? new Date(snap.updatedAt).toISOString() : null,
  };
}

function buildOpenPositionsLive() {
  const executorOpens = executor.getOpenTrades();
  // With a live broker, only trust executor state — journal can lag after manual closes
  if (brokerMode) {
    return executorOpens.map((t) => buildLiveForTrade(t, t));
  }

  const executorByPair = new Map(executorOpens.map((t) => [t.pair, t]));
  const journalOpens = getOpenEntries();
  const seen = new Set();
  const live = [];

  for (const t of executorOpens) {
    seen.add(t.pair);
    live.push(buildLiveForTrade(t, t));
  }
  for (const j of journalOpens) {
    if (seen.has(normPair(j.pair))) continue;
    live.push(buildLiveForTrade(j, null));
  }
  return live;
}

async function reconcileBrokerOpenState() {
  if (!brokerMode || typeof executor.syncFromBroker !== 'function') return [];

  let closed = [];
  try {
    closed = await executor.syncFromBroker();
  } catch (e) {
    console.warn('[fx-reconcile] sync', e.message);
    return [];
  }

  for (const c of closed) {
    pairCooldown.markExit(c.pair, c.exitReason);
    recordCharlieSessionExit(c);
    risk.dailyPnlUsd = round(risk.dailyPnlUsd + (c.pnlUsd ?? 0), 2);
    appendEvent('exit', c);
    console.log(`[fx-reconcile] ${c.pair} closed on broker (${c.exitReason}) pnl=$${c.pnlUsd}`);
  }

  // Journal still shows open after manual close on Capital — clear ghost entries
  for (const j of getOpenEntries()) {
    const pair = normPair(j.pair);
    if (executor.hasPair(pair)) continue;
    appendEvent('exit', {
      pair: j.pair,
      openedAt: j.openedAt,
      side: j.side,
      entry: j.entry,
      stopLoss: j.stopLoss,
      takeProfit: j.takeProfit,
      exit: j.lastMark ?? j.entry,
      exitReason: 'broker_reconcile',
      closedAt: Date.now(),
      pips: 0,
      pnlUsd: 0,
      score: j.score,
    });
    console.log(`[fx-reconcile] journal ghost cleared ${pair}`);
  }

  journalSyncOpenTradesFromExecutor();
  return closed;
}

/** Write journal entries for broker positions not yet logged locally. */
function journalSyncOpenTradesFromExecutor() {
  const journalKeys = new Set(
    getOpenEntries().map((j) => `${normPair(j.pair)}|${j.openedAt}`),
  );
  for (const t of executor.getOpenTrades()) {
    const key = `${normPair(t.pair)}|${t.openedAt}`;
    if (journalKeys.has(key)) continue;
    appendEvent('entry', {
      pair: t.pair,
      side: t.side,
      entry: t.entry,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      openedAt: t.openedAt,
      score: t.score ?? t.entryConviction ?? 0,
      regime: t.regime ?? (isCharlie ? 'liquidity_sweep' : null),
      signalEngine: t.signalEngine ?? (isCharlie ? 'charlie' : 'ideal'),
      broker: t.broker ?? executorMode,
    });
    console.log(`[fx-journal] entry synced from ${executorMode} ${t.pair}`);
  }
}

function compactAnalysis(a, { withMacro = false } = {}) {
  if (!a) return null;
  const out = {
    pair: a.pair,
    action: a.action,
    side: a.side,
    score: a.score,
    reason: a.reason,
    regime: a.regime,
    marketRegime: a.marketRegime,
    spreadPips: a.spreadPips,
    quote: a.quote,
    smart: a.smart,
    layerEval: a.layerEval,
    altSignal: a.altSignal,
    pairStats: a.pairStats ? {
      paused: a.pairStats.paused,
      pauseReason: a.pairStats.pauseReason,
    } : undefined,
    fundamental: a.fundamental,
    idealFormula: a.idealFormula,
    entry: a.entry,
    stopLoss: a.stopLoss,
    takeProfit: a.takeProfit,
    dataSource: a.dataSource,
    newsBlackout: a.newsBlackout,
    inSession: a.inSession,
    session: a.session,
    setupDraft: a.setupDraft,
  };
  if (isCharlie) {
    const rank = charlieRankByPair.get(a.pair);
    if (rank) {
      out.actRank = rank.rankIndex;
      out.actScore = rank.rankScore;
      out.atrPips = rank.atrPips;
      out.rangePips = rank.rangePips;
      out.actAlive = rank.alive;
    }
    const near = a.charlie?.nearLevel;
    if (near?.label) {
      out.nearLevel = near;
    }
  }
  if (withMacro && a.macro) out.macro = a.macro;
  return out;
}

function publishState(extra = {}, force = false) {
  if (!config.stateFileEnabled) return;
  const now = Date.now();
  if (!force && now - lastStateWriteAt < 2000) return;
  lastStateWriteAt = now;

  const openTrades = executor.getOpenTrades();
  const openPositionsLive = buildOpenPositionsLive();
  const hubStatus = hub.getHubStatus?.() || {};

  const payload = {
    pairs: config.pairs,
    pair: config.pair,
    maxOpenPositions: config.maxOpenPositions,
    provider: config.dataProvider,
    capitalWs: hubStatus.capitalWs,
    capitalReady: hubStatus.capitalReady,
    yahooFallback: hubStatus.yahooFallback,
    instance: process.env.FX_WORKER_INSTANCE || 'standalone',
    pid: process.pid,
    tickCount,
    risk,
    charlieFocus: isCharlie ? charlieFocusPairs : undefined,
    charlieUniverse: isCharlie ? charlieUniversePairs : undefined,
    charlieUniverseChurn: isCharlie ? charlieUniverseChurn : undefined,
    charliePulse: isCharlie ? charliePulseMeta : undefined,
    charlieAlwaysOn: isCharlie ? config.charlieAlwaysOn !== false : undefined,
    lastAnalyses: lastAnalyses.map((a) => compactAnalysis(a)),
    lastAnalysis: compactAnalysis(lastAnalysis, { withMacro: true }),
    openTrade: openTrades[0] ?? null,
    openTrades,
    openPositionLive: openPositionsLive[0] ?? null,
    openPositionsLive,
    journal: summarize(),
    testbot: testbotEnabled ? {
      enabled: true,
      risk: testbotRisk,
      maxOpenPositions: getTbCfg().maxOpenPositions ?? 20,
      minScore: getTbCfg().minScore ?? 60,
      pairCooldownMs: getTbCfg().pairCooldownMs ?? 300000,
      targetUsd: getTbCfg().targetUsd ?? 1,
      partialUsd: getTbCfg().partialUsd ?? 0.5,
      partialAfterMs: getTbCfg().partialAfterMs ?? 600000,
      maxStopLossUsd: getTbCfg().maxStopLossUsd ?? 10,
      invertDirection: getTbCfg().invertDirection === true,
      allowCharlieOverlap: getTbCfg().allowCharlieOverlap !== false,
      openTrades: testbotExecutor.getOpenTrades(),
      openPositionsLive: buildTestbotLivePositions(),
      journal: summarizeTestbot(testbotJournalFile),
      oracle: getOracleCfg().enabled ? {
        ...summarizeOracleStats(getOracleCfg()),
        pending: getPendingCount(),
        pendingForecasts: getPendingForecastsSnapshot(12),
      } : null,
    } : { enabled: false },
    ...extra,
  };

  if (!writeState(payload)) {
    const warnNow = Date.now();
    if (warnNow - lastStateWriteWarnAt > 60000) {
      lastStateWriteWarnAt = warnNow;
      console.warn('[fx-state] worker-state.json not saved — dashboard may lag');
    }
  }
}

function cooldownReasonForExit(exitReason, pnlUsd) {
  if (exitReason === 'profit_decay' || exitReason === 'good_enough') return exitReason;
  if (exitReason === 'time_profit' || exitReason === 'dynamic_tp') return 'take_profit';
  if (pnlUsd > 0) return 'take_profit';
  if (exitReason === 'conv_decay' || exitReason === 'time_scratch' || exitReason === 'time_exit') {
    return 'stop';
  }
  return exitReason;
}

const recentEntryTimes = [];

function isHourlyBurstLimited(maxPerHour) {
  const max = Number(maxPerHour);
  if (!Number.isFinite(max) || max <= 0) return { blocked: false };
  const hourAgo = Date.now() - 3600000;
  while (recentEntryTimes.length && recentEntryTimes[0] < hourAgo) {
    recentEntryTimes.shift();
  }
  if (recentEntryTimes.length >= max) {
    return { blocked: true, reason: `ліміт ${max} входів/год (зараз ${recentEntryTimes.length})` };
  }
  return { blocked: false };
}

function recordEntryOpen() {
  recentEntryTimes.push(Date.now());
}

async function applyPositionManagement(trade, quote, macro) {
  if (config.positionMgmt === false) return null;

  const snap = hub.getPairSnapshot(trade.pair);
  const minBars = config.capitalMinBars ?? 15;
  const bars = snap?.bars1m?.length >= minBars && snap?.bars5m?.length >= minBars
    ? {
      m1: {
        bars: snap.bars1m,
        mid: snap.mid,
        bid: snap.bid,
        ask: snap.ask,
        spreadPips: snap.spreadPips,
      },
      m5: { bars: snap.bars5m },
      h1: snap.bars1h?.length ? { bars: snap.bars1h } : undefined,
    }
    : null;

  const liveQuote = {
    bid: quote.bid ?? snap?.bid,
    ask: quote.ask ?? snap?.ask,
    mid: quote.mid ?? snap?.mid,
    spreadPips: quote.spreadPips ?? snap?.spreadPips,
  };

  // Prefer latest scan score (CHARLIE panel Conv) so management matches what you see
  const scanned = lastAnalyses.find((a) => a.pair === trade.pair);
  let liveAnalysis = scanned
    ? {
      conviction: scanned.smart?.conviction ?? scanned.score ?? 0,
      stillValid: scanned.action === 'BUY' || scanned.action === 'SELL',
      marketRegime: scanned.marketRegime || scanned.regime,
      reason: scanned.reason,
      fromScan: true,
    }
    : null;

  if (!liveAnalysis) {
    try {
      liveAnalysis = await analyzeOpenPosition(trade, { liveQuote, bars, macro });
    } catch (e) {
      console.warn(`[fx-mgmt] ${trade.pair} analyze`, e.message);
      return null;
    }
  }

  const decision = evaluatePositionAction(trade, liveAnalysis, liveQuote, config);
  if (decision.action === 'hold') return null;

  if (decision.action === 'lower_tp' && decision.newTakeProfit != null) {
    if (typeof executor.updateBrokerLevels === 'function') {
      const ok = await executor.updateBrokerLevels(trade, { takeProfit: decision.newTakeProfit });
      if (ok) {
        console.log(`[fx-mgmt] ${trade.pair} dynamic TP → ${decision.newTakeProfit} (${decision.detail})`);
      }
    } else {
      trade.takeProfit = decision.newTakeProfit;
      console.log(`[fx-mgmt] ${trade.pair} local TP → ${decision.newTakeProfit}`);
    }
    return null;
  }

  if (decision.action === 'close') {
    const closer = typeof executor.closeMarket === 'function'
      ? executor.closeMarket.bind(executor)
      : typeof executor.forceClose === 'function'
        ? (t, r) => executor.forceClose(t.pair, r)
        : null;
    if (!closer) return null;
    const closed = await closer(trade, decision.reason);
    if (closed) {
      console.log(`[fx-mgmt] ${closed.pair} ${decision.reason}: ${decision.detail}`);
    }
    return closed;
  }

  return null;
}

function rankLocalMovers(universe, snapMap) {
  return [...universe].map((pair) => {
    const snap = snapMap.get(pair);
    const barsM5 = snap?.bars5m || [];
    const rangeP = realizedRangePips(barsM5, pair, 12) || 0;
    const micro = realizedRangePips(barsM5, pair, 6) || 0;
    const spread = Number(snap?.spreadPips) || 0;
    return {
      pair,
      activityScore: Math.round(rangeP * 2 + micro * 3 - spread * 5),
      pct: 0,
      rangePct: rangeP,
      status: null,
    };
  }).sort((a, b) => b.activityScore - a.activityScore);
}

async function runAllAnalyses() {
  const macro = !isCharlie && config.macroFilter !== false
    ? await fetchMacroSnapshot().catch(() => null)
    : null;

  let pairsToScan = config.pairs;
  let charlieRank = null;
  if (isCharlie) {
    // REST discovery hunt (rarer) → refresh catalog / inject Capital movers
    const huntEvery = config.charlieHuntIntervalMs ?? 30 * 60 * 1000;
    if (config.charlieMarketHunt !== false && Date.now() - lastMarketHuntAt > huntEvery) {
      lastMarketHuntAt = Date.now();
      try {
        const client = getCapitalDataClient(config);
        const hunt = await runCapitalMarketHunt(client, config.pairs, config);
        if (!hunt.skipped && hunt.universe?.pairs?.length) {
          charlieUniversePairs = hunt.universe.pairs;
          charlieUniverseChurn = {
            replaced: hunt.universe.replaced || [],
            demoted: hunt.universe.demoted || [],
            core: hunt.universe.core || [],
            rotating: hunt.universe.rotating || [],
            updatedAt: hunt.universe.updatedAt || new Date().toISOString(),
            source: 'rest-hunt',
          };
          await hub.expandWatchPairs(hunt.universe.pairs);
          if (hunt.universe.replaced?.length || hunt.universe.demoted?.length) {
            console.log(
              `[fx-hunt] universe=${hunt.universe.pairs.length} `
              + `↑${(hunt.universe.replaced || []).map((r) => r.in || r).join(',') || '—'} `
              + `↓${(hunt.universe.demoted || []).join(',') || '—'} `
              + `catalog=${hunt.catalogSize}`,
            );
          } else {
            console.log(`[fx-hunt] universe=${hunt.universe.pairs.length}:${hunt.universe.pairs.join(',')} catalog=${hunt.catalogSize}`);
          }
          const outside = (hunt.outsideSeed || [])
            .map((r) => `${r.pair}(${r.activityScore})`)
            .join(',');
          if (outside) console.log(`[fx-hunt] capital movers outside seed: ${outside}`);
        } else if (hunt.reason) {
          console.log(`[fx-hunt] skip: ${hunt.reason}`);
        }
      } catch (e) {
        console.warn('[fx-hunt]', e.message);
      }
    }

    if (!charlieUniversePairs.length) {
      const uj = loadUniverseJournal();
      charlieUniversePairs = uj.pairs?.length ? uj.pairs : config.pairs;
      if (uj.pairs?.length) {
        charlieUniverseChurn = {
          replaced: uj.replaced || [],
          demoted: uj.demoted || [],
          core: uj.core || [],
          rotating: uj.rotating || [],
          updatedAt: uj.updatedAt,
          source: 'journal',
        };
      }
    }

    let universe = charlieUniversePairs.length ? charlieUniversePairs : config.pairs;
    const snapMap = new Map();
    for (const pair of universe) {
      const snap = hub.getPairSnapshot(pair);
      if (snap) snapMap.set(pair, snap);
    }

    // Soft rotate from local WS micro-heat (no REST) — keeps rotating slots dynamic
    const softEvery = config.charlieSoftRotateMs ?? 2 * 60 * 1000;
    if (Date.now() - lastSoftRotateAt > softEvery && snapMap.size) {
      lastSoftRotateAt = Date.now();
      try {
        const localRanked = rankLocalMovers(universe, snapMap);
        const soft = reconcileUniverseJournal(config.pairs, localRanked, config);
        if (soft.pairs?.length) {
          charlieUniversePairs = soft.pairs;
          universe = soft.pairs;
          charlieUniverseChurn = {
            replaced: soft.replaced || [],
            demoted: soft.demoted || [],
            core: soft.core || [],
            rotating: soft.rotating || [],
            updatedAt: soft.updatedAt,
            source: 'soft-ws',
          };
          await hub.expandWatchPairs(soft.pairs).catch(() => {});
          if (soft.replaced?.length || soft.demoted?.length) {
            console.log(
              `[fx-soft] universe ↑${(soft.replaced || []).map((r) => r.in || r).join(',') || '—'} `
              + `↓${(soft.demoted || []).join(',') || '—'}`,
            );
          }
          // refresh snapshots for possibly new pairs
          for (const pair of universe) {
            if (snapMap.has(pair)) continue;
            const snap = hub.getPairSnapshot(pair);
            if (snap) snapMap.set(pair, snap);
          }
        }
      } catch (e) {
        console.warn('[fx-soft]', e.message);
      }
    }

    const pool = buildActivePairPool(universe, snapMap, config);
    charlieRank = pool.ranked;
    charlieRankByPair = new Map(
      (pool.ranked || []).map((r, i) => [r.pair, {
        rankIndex: i + 1,
        rankScore: r.rankScore,
        atrPips: r.atrPips ?? null,
        rangePips: r.rangePips ?? null,
        alive: r.alive !== false,
        microHeat: r.microHeat ?? null,
        signalHeat: r.signalHeat ?? null,
      }]),
    );
    charlieFocusPairs = pool.top;
    pairsToScan = pool.scanPool?.length
      ? pool.scanPool
      : (pool.top.length ? pool.top : universe.slice(0, config.charlieMaxPairs ?? 4));

    if (config.charliePulseLog !== false) {
      try {
        appendPairPulse({
          focus: pool.top,
          scan: pairsToScan,
          promoted: pool.promoted || [],
          demoted: pool.demoted || [],
          universe: universe.slice(0, 24),
          replaced: (charlieUniverseChurn.replaced || []).map((r) => r.in || r),
          universeDemoted: charlieUniverseChurn.demoted || [],
          source: charlieUniverseChurn.source,
        });
        charliePulseMeta = {
          promoted: pool.promoted || [],
          demoted: pool.demoted || [],
          unique1h: uniquePairsInPulse(3600000).length,
          scan: pairsToScan.slice(0, 24),
          updatedAt: new Date().toISOString(),
        };
      } catch (e) {
        console.warn('[fx-pulse]', e.message);
      }
    }

    if (Date.now() - lastSetupPruneAt > 30 * 60 * 1000) {
      lastSetupPruneAt = Date.now();
      const pr = pruneSetupJournalIfNeeded(config);
      if (pr.pruned) {
        console.log(`[fx-charlie] pruned setups journal: -${pr.removed} lines (kept ${pr.lines})`);
      }
      const pp = prunePairPulse(1500);
      if (pp.pruned) console.log(`[fx-pulse] pruned -${pp.removed} lines`);
    }

    if (pool.promoted?.length || pool.demoted?.length) {
      console.log(`[fx-charlie] focus ↑${pool.promoted.join(',') || '—'} ↓${pool.demoted.join(',') || '—'}`);
    }
  }

  const results = [];
  const minBars = config.capitalMinBars ?? 15;
  for (const pair of pairsToScan) {
    const snap = hub.getPairSnapshot(pair);
    if (!snap) continue;
    const liveQuote = {
      bid: snap.bid,
      ask: snap.ask,
      mid: snap.mid,
      spreadPips: snap.spreadPips,
      source: snap.source,
    };
    const bars = snap.bars1m?.length >= minBars && snap.bars5m?.length >= minBars
      ? {
        m1: {
          bars: snap.bars1m,
          mid: snap.mid,
          bid: snap.bid,
          ask: snap.ask,
          spreadPips: snap.spreadPips,
          source: snap.source,
        },
        m5: { bars: snap.bars5m },
        h1: snap.bars1h?.length ? { bars: snap.bars1h } : undefined,
      }
      : null;
    try {
      const a = await analyzePairFn(pair, { liveQuote, bars, macro });
      results.push(a);
    } catch (e) {
      console.warn(`[fx-analyze] ${pair}`, e.message);
    }
  }

  if (isCharlie && charlieRank?.length) {
    const topLine = charlieRank.slice(0, config.charlieMaxPairs ?? 4)
      .map((r) => {
        const atr = r.atrPips != null ? ` atr=${r.atrPips}` : '';
        const rng = r.rangePips != null ? ` rng=${r.rangePips}` : '';
        const dead = r.alive === false ? '!' : '';
        return `${r.pair}(${r.rankScore}${atr}${rng}${dead})`;
      })
      .join(',');
    console.log(`[fx-charlie] top pairs: ${topLine}`);
  }

  lastAnalyses = results.length
    ? pairsToScan.map((pair) => {
      const fresh = results.find((a) => a.pair === pair);
      if (fresh) return fresh;
      return lastAnalyses.find((a) => a.pair === pair);
    }).filter(Boolean)
    : lastAnalyses;

  if (isCharlie) {
    const focusSet = new Set(charlieFocusPairs);
    const entries = results
      .filter((a) => a.action === 'BUY' || a.action === 'SELL')
      .sort((a, b) => {
        const fa = focusSet.has(a.pair) ? 1 : 0;
        const fb = focusSet.has(b.pair) ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return (b.score ?? 0) - (a.score ?? 0);
      })
      .slice(0, config.charlieMaxEntriesPerCycle ?? 2);
    lastAnalysis = entries[0] || results.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] || null;
    return { results, entries, buys: entries.filter((a) => a.action === 'BUY'), charlieRank };
  }

  for (const a of results) trackWatchCycle(a, config);

  const baseEntries = rankEntriesBalanced(
    results
      .filter((a) => a.action === 'BUY' || a.action === 'SELL')
      .sort((a, b) => {
        const ca = a.smart?.conviction ?? a.score;
        const cb = b.smart?.conviction ?? b.score;
        return cb - ca;
      }),
    config,
  );

  const promoted = getWatchPromotions(config).filter(
    (p) => !baseEntries.some((e) => e.pair === p.pair),
  );
  const entries = [...baseEntries, ...promoted];

  lastAnalysis = entries[0] || results.slice().sort((a, b) => {
    const ca = a.smart?.conviction ?? a.score ?? 0;
    const cb = b.smart?.conviction ?? b.score ?? 0;
    return cb - ca;
  })[0] || null;
  return { results, entries, buys: entries.filter((a) => a.action === 'BUY') };
}

async function onAnalyzeCycle() {
  resetDayIfNeeded();

  const now = Date.now();
  // Testbot entries between full analyze cycles (shared quotes, no Capital REST)
  if (testbotEnabled) {
    await processTestbotEntries(false);
  }

  if (now - lastAnalyzeAt < ANALYZE_GAP_MS) return;

  tickCount += 1;

  try {
    if (testbotEnabled) applyTestbotClearIfRequested();
    await reconcileBrokerOpenState();
    await refreshMacroForMgmt();

    const { entries, results } = await runAllAnalyses();
    lastAnalyzeAt = Date.now();
    logScanSummary(results, entries);
    const session = getSessionProfile();
    const cycleCfg = applySessionToConfig(config, session);
    const gateCfg = isCharlie
      ? { ...cycleCfg, maxTradesPerDay: cycleCfg.charlieMaxTradesPerDay ?? 6 }
      : cycleCfg;
    const gate = checkEntryAllowed(risk, gateCfg);
    let openedAny = false;

    if (gate.allowed && executor.isTradingEnabled()) {
      let openedThisCycle = 0;
      const maxPerCycle = isCharlie
        ? (cycleCfg.charlieMaxEntriesPerCycle ?? 2)
        : (cycleCfg.smartMode !== false
          ? (cycleCfg.smartMaxEntriesPerCycle ?? 3)
          : cycleCfg.maxOpenPositions);

      for (const candidate of entries) {
        if (executor.getOpenCount() >= cycleCfg.maxOpenPositions) break;
        if (openedThisCycle >= maxPerCycle) {
          console.log(`[fx-skip] ${candidate.pair} smart cycle limit (${maxPerCycle})`);
          break;
        }
        if (executor.hasPair(candidate.pair)) {
          console.log(`[fx-skip] ${candidate.pair} локальна позиція вже є (перевір sync з брокером)`);
          continue;
        }

        const pairGate = checkPairAllowed(candidate.pair, cycleCfg);
        if (!pairGate.ok) {
          console.log(`[fx-skip] ${candidate.pair} ${pairGate.reason}`);
          continue;
        }

        const tierGate = isCharlie
          ? { ok: true }
          : checkPairTierLiquidity(
            candidate.pair,
            candidate.spreadPips ?? candidate.effectiveSpreadPips,
            cycleCfg,
            session,
          );
        if (!tierGate.ok) {
          console.log(`[fx-skip] ${candidate.pair} ${tierGate.reason}`);
          continue;
        }

        if (!isCharlie && candidate.pairStats?.paused) {
          console.log(`[fx-skip] ${candidate.pair} ${candidate.pairStats.pauseReason}`);
          continue;
        }

        const pairLimitMax = cycleCfg.pairMaxTradesPerDay ?? 3;
        const pairLimit = isPairDailyLimitReached(
          candidate.pair,
          pairLimitMax,
        );
        if (pairLimit.blocked) {
          console.log(`[fx-skip] ${candidate.pair} ${pairLimit.reason}`);
          continue;
        }

        const cd = pairCooldown.isBlocked(candidate.pair);
        if (cd.blocked) {
          console.log(`[fx-skip] ${candidate.pair} ${cd.reason}`);
          continue;
        }

        const exp = checkCurrencyExposure(
          executor.getOpenTrades(),
          candidate.pair,
          cycleCfg.maxExposurePerCurrency,
        );
        if (exp.blocked) {
          console.log(`[fx-skip] ${candidate.pair} ${exp.reason}`);
          continue;
        }

        if (isCharlie) {
          const corr = checkCharlieCorrelation(
            executor.getOpenTrades(),
            candidate.pair,
            cycleCfg,
          );
          if (corr.blocked) {
            console.log(`[fx-skip] ${candidate.pair} ${corr.reason}`);
            continue;
          }
          const dayKey = new Date().toISOString().slice(0, 10);
          if (charlieSessionSl.dayKey !== dayKey) {
            charlieSessionSl = { dayKey, count: 0, stopped: false };
          }
          if (charlieSessionSl.stopped) {
            console.log(`[fx-skip] ${candidate.pair} CHARLIE session stop (${charlieSessionSl.count} SL)`);
            break;
          }
        }

        if (isJpyCross(candidate.pair)) {
          const jpyOpen = executor.getOpenTrades().filter((t) => isJpyCross(t.pair)).length;
          if (jpyOpen >= (cycleCfg.maxJpyCrossPositions ?? 1)) {
            console.log(`[fx-skip] ${candidate.pair} ліміт JPY-cross (${jpyOpen}/${cycleCfg.maxJpyCrossPositions})`);
            continue;
          }
        }

        if (!isCharlie && cycleCfg.scalpTier1Only && getPairTier(candidate.pair, cycleCfg) !== 1) {
          console.log(`[fx-skip] ${candidate.pair} scalp tier-1 only`);
          continue;
        }

        if (!isCharlie && cycleCfg.scalpMode && cycleCfg.scalpSessions?.length
          && !cycleCfg.scalpSessions.includes(session.name)) {
          console.log(`[fx-skip] ${candidate.pair} scalp session ${session.name}`);
          continue;
        }

        if (!isCharlie) {
          const hourBurst = isHourlyBurstLimited(cycleCfg.scalpMaxTradesPerHour);
          if (hourBurst.blocked) {
            console.log(`[fx-skip] ${candidate.pair} ${hourBurst.reason}`);
            break;
          }
        }

        if (!isCharlie) {
          const conv = candidate.smart?.conviction ?? candidate.score ?? 0;
          const scoreFloor = getMinScoreForPair(candidate.pair, cycleCfg, session);
          const threshold = candidate.smart?.threshold ?? (
            (candidate.side === 'short' || candidate.action === 'SELL')
              ? scoreFloor.minSellScore
              : scoreFloor.minBuyScore
          );
          const effectiveThreshold = Math.max(
            threshold,
            (candidate.side === 'short' || candidate.action === 'SELL')
              ? scoreFloor.minSellScore
              : scoreFloor.minBuyScore,
          );
          if (conv < effectiveThreshold) {
            const tag = candidate.promotedFromWatch ? ' watch-promote' : '';
            const tierTag = scoreFloor.tier === 2 ? ` tier2≥${scoreFloor.minBuyScore}` : '';
            console.log(`[fx-skip] ${candidate.pair} conviction ${conv} < ${effectiveThreshold}${tierTag}${tag}`);
            continue;
          }
        } else {
          const setupScore = candidate.score ?? 0;
          const minSetup = cycleCfg.charlieMinScore ?? 75;
          if (setupScore < minSetup) {
            console.log(`[fx-skip] ${candidate.pair} CHARLIE score ${setupScore} < ${minSetup}`);
            continue;
          }
        }

        const opened = await executor.tryOpen(candidate);
        if (!opened) {
          console.log(`[fx-skip] ${candidate.pair} executor declined (units/epic/order)`);
          continue;
        }
        if (isCharlie) {
          const sid = candidate.charlie?.setupId || candidate.setupId;
          if (sid) markSetupUsed(sid, cycleCfg.charlieSetupDedupMs ?? 45 * 60 * 1000);
        }
        if (candidate.promotedFromWatch) clearWatch(candidate.pair);
        risk.tradesToday += 1;
        recordEntryOpen();
        appendEvent('entry', {
          ...opened,
          signalEngine: candidate.signalEngine || opened.signalEngine,
          features: candidate.features || opened.features,
          charlie: candidate.charlie || opened.charlie,
        });
        openedAny = true;
        openedThisCycle += 1;
        const convLog = candidate.smart?.conviction ?? candidate.score ?? opened.score;
        const brokerTag = executorMode === 'oanda' ? ' [OANDA]' : '';
        const watchTag = candidate.promotedFromWatch ? ' [watch→entry]' : '';
        const charlieTag = isCharlie ? ' [CHARLIE]' : '';
        console.log(`[fx-entry]${brokerTag}${charlieTag}${watchTag} ${opened.side} ${opened.pair} @ ${opened.entry} SL ${opened.stopLoss} TP ${opened.takeProfit} score=${convLog}`);
        if (config.tradeTelegram) {
          sendTradeAlert(formatEntryAlert(opened, {
            watchTag: candidate.promotedFromWatch,
            conviction: convLog,
          })).catch(() => {});
        }
      }
    } else if (entries.length && !gate.allowed) {
      console.log(`[fx-skip] ${entries[0].pair} ${gate.reason}`);
    }

    if (openedAny) publishState({}, true);
    maybeLogTick();

    if (testbotEnabled) {
      const tbOpened = await processTestbotEntries(true);
      if (tbOpened) publishState({}, true);
    }
  } catch (e) {
    console.error('[fx-analyze]', e.message);
  }

  publishState({}, true);
}

async function refreshMacroForMgmt() {
  if (config.macroFilter !== false && config.positionMgmt !== false) {
    cachedMacroForMgmt = await fetchMacroSnapshot().catch(() => cachedMacroForMgmt);
  } else {
    cachedMacroForMgmt = null;
  }
}

async function processBrokerSyncClosures() {
  if (!brokerMode || typeof executor.syncFromBroker !== 'function') return false;
  let closedAny = false;
  try {
    const closedList = await executor.syncFromBroker();
    for (const closed of closedList) {
      closedAny = true;
      pairCooldown.markExit(closed.pair, closed.exitReason);
      recordCharlieSessionExit(closed);
      risk.dailyPnlUsd = round(risk.dailyPnlUsd + closed.pnlUsd, 2);
      appendEvent('exit', closed);
      console.log(`[fx-exit] [${executorMode.toUpperCase()}] ${closed.side} ${closed.pair} ${closed.exitReason} pips=${closed.pips} pnl=$${closed.pnlUsd} day=$${risk.dailyPnlUsd}`);
      if (config.tradeTelegram) {
        sendTradeAlert(formatExitAlert(closed, risk)).catch(() => {});
      }
    }
  } catch (e) {
    console.warn(`[fx-monitor] ${executorMode} sync`, e.message);
  }
  return closedAny;
}

async function monitorOpenTradesFast({ withBrokerSync = false } = {}) {
  const opens = executor.getOpenTrades();
  if (!opens.length) return;

  let closedAny = false;

  if (withBrokerSync) {
    closedAny = await processBrokerSyncClosures();
  }

  const macro = cachedMacroForMgmt;

  for (const t of executor.getOpenTrades()) {
    try {
      const q = hub.getPairSnapshot(t.pair) || await hub.refreshPair(t.pair);
      if (!q) continue;

      if (q.bid != null) t.lastBid = q.bid;
      if (q.ask != null) t.lastAsk = q.ask;
      t.lastMark = t.side === 'short' ? q.ask ?? q.mid : q.bid ?? q.mid;
      t.lastMarkAt = Date.now();

      if (applyBreakevenIfNeeded(t, q, config)) {
        if (!t.breakevenLogged) {
          t.breakevenLogged = true;
          console.log(`[fx-be] ${t.pair} SL→breakeven (+${t.breakevenAtPips}p)`);
        }
        if (config.breakevenBrokerSync && typeof executor.updateBrokerLevels === 'function') {
          await executor.updateBrokerLevels(t, { stopLoss: t.stopLoss });
        }
      }

      if (config.positionMgmt !== false) {
        const mgmtClosed = await applyPositionManagement(t, q, macro);
        if (mgmtClosed) {
          closedAny = true;
          const cdReason = cooldownReasonForExit(mgmtClosed.exitReason, mgmtClosed.pnlUsd);
          pairCooldown.markExit(mgmtClosed.pair, cdReason);
          recordCharlieSessionExit(mgmtClosed);
          risk.dailyPnlUsd = round(risk.dailyPnlUsd + mgmtClosed.pnlUsd, 2);
          appendEvent('exit', mgmtClosed);
          console.log(`[fx-exit] [MGMT] ${mgmtClosed.side} ${mgmtClosed.pair} ${mgmtClosed.exitReason} pips=${mgmtClosed.pips} pnl=$${mgmtClosed.pnlUsd} day=$${risk.dailyPnlUsd}`);
          if (config.tradeTelegram) {
            sendTradeAlert(formatExitAlert(mgmtClosed, risk)).catch(() => {});
          }
          continue;
        }
      }

      if (!brokerMode) {
        const closed = executor.onTick(t.pair, q);
        const openTrade = executor.getOpenTrades().find((x) => x.pair === t.pair);
        if (openTrade?.breakevenApplied && !openTrade.breakevenLogged) {
          openTrade.breakevenLogged = true;
          console.log(`[fx-be] ${openTrade.pair} SL→breakeven (+${openTrade.breakevenAtPips}p)`);
        }
        if (closed) {
          closedAny = true;
          pairCooldown.markExit(closed.pair, closed.exitReason);
          recordCharlieSessionExit(closed);
          risk.dailyPnlUsd = round(risk.dailyPnlUsd + closed.pnlUsd, 2);
          appendEvent('exit', closed);
          console.log(`[fx-exit] ${closed.side} ${closed.pair} ${closed.exitReason} pips=${closed.pips} pnl=$${closed.pnlUsd} day=$${risk.dailyPnlUsd}`);
          if (config.tradeTelegram) {
            sendTradeAlert(formatExitAlert(closed, risk)).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn(`[fx-monitor] ${t.pair}`, e.message);
    }
  }

  if (closedAny) {
    publishState({}, true);
    return;
  }

  const now = Date.now();
  if (now - lastOpenMarkPublishAt >= OPEN_MONITOR_MS) {
    lastOpenMarkPublishAt = now;
    publishState({}, true);
  } else {
    maybeLogTick();
  }
}

async function monitorOpenTrades() {
  return monitorOpenTradesFast({ withBrokerSync: true });
}

async function runOpenMonitor() {
  if (openMonitorBusy) return;
  const hasMain = executor.getOpenCount() > 0;
  const hasTestbot = testbotExecutor?.getOpenCount() > 0;
  if (!hasMain && !hasTestbot && !testbotEnabled) return;
  openMonitorBusy = true;
  try {
    if (testbotEnabled) applyTestbotClearIfRequested();
    let stateDirty = false;
    if (hasMain || brokerMode) {
      const needSync = Date.now() - lastOpenBrokerSyncAt >= OPEN_BROKER_SYNC_MS;
      await monitorOpenTradesFast({ withBrokerSync: needSync });
      if (needSync) lastOpenBrokerSyncAt = Date.now();
    }
    if (testbotEnabled) {
      const tbOpened = await processTestbotEntries(false);
      const tbClosed = await monitorTestbotTrades();
      if (tbOpened || tbClosed) stateDirty = true;
      if (testbotExecutor?.getOpenCount()) {
        const now = Date.now();
        if (now - lastTestbotPublishAt >= OPEN_MONITOR_MS) {
          lastTestbotPublishAt = now;
          publishState({}, true);
        }
      }
    }
    if (getOracleCfg().enabled) {
      const rec = await reconcileOracleActuals(hub, getOracleCfg());
      if (rec.reconciled > 0) stateDirty = true;
    }
    if (stateDirty) publishState({}, true);
  } finally {
    openMonitorBusy = false;
  }
}

async function main() {
  if (!claimWorkerLock()) {
    console.error('[fx-worker] інший worker вже працює — зупини його перед стартом');
    process.exit(1);
  }

  pairCooldown.hydrateFromJournal();
  syncDailyPnlFromJournal();

  if (brokerMode) {
    if (typeof executor.hydrateFromBroker === 'function') {
      try {
        const remote = await executor.hydrateFromBroker();
        if (remote > 0) {
          console.log(`[fx-worker] synced ${remote} open trade(s) from ${executorMode}`);
        }
      } catch (e) {
        console.warn(`[fx-worker] ${executorMode} hydrate failed:`, e.message);
      }
    }
    await reconcileBrokerOpenState();
    syncDailyPnlFromJournal();
    const liveOpens = executor.getOpenTrades();
    if (liveOpens.length) {
      console.log(`[fx-worker] broker open: ${liveOpens.map((t) => t.pair).join(', ')}`);
    }
  } else {
    const openEntries = getOpenEntries();
    if (openEntries.length > 0) {
      const n = executor.restoreAll(openEntries);
      syncDailyPnlFromJournal();
      console.log(`[fx-worker] recovered ${n} open position(s): ${executor.getOpenTrades().map((t) => t.pair).join(', ')}`);
    }
  }

  if (testbotEnabled && testbotExecutor) {
    syncTestbotDailyPnl();
    hydrateTestbotPairCooldown(getTestbotClosedTrades(500, testbotJournalFile));
    const tbOpens = getTestbotOpenEntries(testbotJournalFile);
    if (tbOpens.length) {
      const n = testbotExecutor.restoreAll(tbOpens);
      console.log(`[tb-worker] recovered ${n} testbot position(s): ${testbotExecutor.getOpenTrades().map((t) => t.pair).join(', ')}`);
    }
    console.log(`[tb-worker] enabled minScore=${getTbCfg().minScore ?? 60} pairCd=${Math.round((getTbCfg().pairCooldownMs ?? 300000) / 60000)}m invert=${getTbCfg().invertDirection === true} maxSL=$${getTbCfg().maxStopLossUsd ?? 10}+comm target=$${getTbCfg().targetUsd ?? 1} partial=$${getTbCfg().partialUsd ?? 0.5}@${Math.round((getTbCfg().partialAfterMs ?? 600000) / 60000)}m maxOpen=${getTbCfg().maxOpenPositions ?? 20} oracle=${getOracleCfg().enabled === true}`);
    if (getOracleCfg().enabled) {
      loadPendingFromDisk(getOracleCfg());
    }
  }

  // Seed dynamic universe from journal + optional first Capital hunt
  if (isCharlie) {
    const uj = loadUniverseJournal();
    charlieUniversePairs = uj.pairs?.length ? uj.pairs : [...config.pairs];
    if (charlieUniversePairs.length) {
      await hub.expandWatchPairs(charlieUniversePairs).catch((e) => {
        console.warn('[fx-hunt] seed expand', e.message);
      });
    }
    if (config.charlieMarketHunt !== false) {
      lastMarketHuntAt = 0; // force hunt on first analyze cycle
    }
  }

  console.log(`[fx-worker] pairs=${config.pairs.join(',')} maxOpen=${config.maxOpenPositions} mode=${config.mode} engine=${config.signalEngine} provider=${config.dataProvider} executor=${executorMode} tick=${config.tickMs}ms openMonitor=${OPEN_MONITOR_MS}ms analyzeGap=${ANALYZE_GAP_MS}ms scalp=${config.scalpMode !== false} posMgmt=${config.positionMgmt !== false} TP=${config.targetPips} SL=${config.stopPips}${isCharlie ? ` charlie=${config.charlieAlwaysOn !== false ? '24/5-activity' : 'timed'} hunt=${config.charlieMarketHunt !== false} universe≤${config.charlieUniverseMax} rot=${config.charlieUniverseRotate} focus=${config.charlieMaxPairs} minScore=${config.charlieMinScore} vol=1 math=${config.mathGate !== false}` : ` bidirectional=${config.bidirectional !== false}`}`);

  const capitalWsInterval = config.dataProvider === 'capital'
    && config.capitalUseWebSocket !== false;

  if (capitalWsInterval) {
    setInterval(() => {
      onAnalyzeCycle().catch((e) => console.error('[fx-cycle]', e.message));
    }, ANALYZE_GAP_MS);
    setInterval(() => publishState({}, true), 5000);
  } else {
    hub.on('tick', () => {
      onAnalyzeCycle().catch((e) => console.error('[fx-tick]', e));
    });
  }

  setInterval(() => {
    runOpenMonitor().catch((e) => console.error('[fx-open-monitor]', e.message));
  }, OPEN_MONITOR_MS);

  hub.on('error', (e) => console.error('[fx-stream]', e.message));

  await hub.start();

  if (config.dataProvider === 'yahoo') {

    setInterval(() => {
      hub.refreshAllPairs().catch((e) => console.error('[fx-refresh]', e.message));
    }, ANALYZE_GAP_MS);

    setInterval(() => publishState({}, true), 2000);
  }

  publishState({ startedAt: new Date().toISOString() }, true);

  if (executor.getOpenCount()) {
    refreshMacroForMgmt().catch(() => {});
  }

  if (isTelegramConfigured()) {
    sendTradeAlert(formatWorkerOnline(config, risk)).catch(() => {});
  }

  const learnIntervalMs = Number(process.env.FX_LEARN_INTERVAL_MS) || 86400000;
  setInterval(() => {
    runLearningCycle()
      .then((r) => console.log('[fx-learn]', r.applied ? 'params updated' : 'no change', r.notes.join('; ')))
      .catch((e) => console.error('[fx-learn]', e.message));
  }, learnIntervalMs);
}

process.on('SIGINT', () => {
  releaseWorkerLock();
  hub.stop();
  process.exit(0);
});

main().catch((e) => {
  console.error('[fx-worker] fatal', e);
  process.exit(1);
});
