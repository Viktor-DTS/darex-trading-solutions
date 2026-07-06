require('dotenv').config();
const config = require('../config');
const { MarketDataHub } = require('../services/market-data');
const { analyzePair } = require('../services/analyzer');
const { createRiskState, checkEntryAllowed } = require('../services/risk');
const { createPairCooldown } = require('../services/risk/pairCooldown');
const { checkCurrencyExposure } = require('../services/risk/currencyExposure');
const { createExecutor, resolveExecutorMode } = require('../services/executor');
const { isPairDailyLimitReached } = require('../services/risk/pairDailyLimit');
const { appendEvent, summarize, getOpenEntries, getTodayClosedPnl, dayKeyFromTs } = require('../services/journal');
const { writeState } = require('../services/state');
const { claimWorkerLock, releaseWorkerLock } = require('../services/stateCache');
const { runLearningCycle } = require('../services/learning');
const { round, normPair, pipSize, priceToPips } = require('../services/utils');
const { pipValueUsd, enrichTradeSizing } = require('../services/executor/pricing');
const { fetchMacroSnapshot } = require('../services/macro/snapshot');
const { rankEntriesBalanced } = require('../services/analyzer/bidirectional');

const hub = new MarketDataHub({ pairs: config.pairs, provider: config.dataProvider });
const risk = createRiskState();
const pairCooldown = createPairCooldown(config);
const executor = createExecutor();
const executorMode = resolveExecutorMode(config);
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

function syncDailyPnlFromJournal() {
  const dayKey = new Date().toISOString().slice(0, 10);
  risk.dailyPnlUsd = round(getTodayClosedPnl(dayKey), 2);
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
  const alt = a.altSignal
    ? ` alt=${a.altSignal.action === 'SELL' ? 'S' : 'B'}${a.altSignal.score ?? '—'}`
    : '';
  const hint = skipHint(a);
  const tag = hint ? ` (${hint})` : '';
  return `${a.pair} ${a.action} c=${convStr}${alt}${tag}`;
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

function publishState(extra = {}, force = false) {
  if (!config.stateFileEnabled) return;
  const now = Date.now();
  if (!force && now - lastStateWriteAt < 2000) return;
  lastStateWriteAt = now;

  const openTrades = executor.getOpenTrades();
  const openPositionsLive = buildOpenPositionsLive();

  const payload = {
    pairs: config.pairs,
    pair: config.pair,
    maxOpenPositions: config.maxOpenPositions,
    provider: config.dataProvider,
    instance: process.env.FX_WORKER_INSTANCE || 'standalone',
    pid: process.pid,
    tickCount,
    risk,
    lastAnalyses,
    lastAnalysis,
    openTrade: openTrades[0] ?? null,
    openTrades,
    openPositionLive: openPositionsLive[0] ?? null,
    openPositionsLive,
    journal: summarize(),
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

async function runAllAnalyses() {
  const macro = config.macroFilter !== false
    ? await fetchMacroSnapshot().catch(() => null)
    : null;
  const results = [];
  for (const pair of config.pairs) {
    const snap = hub.getPairSnapshot(pair);
    if (!snap) continue;
    const liveQuote = {
      bid: snap.bid,
      ask: snap.ask,
      mid: snap.mid,
      spreadPips: snap.spreadPips,
      source: snap.source,
    };
    const bars = snap.bars1m?.length >= 20 && snap.bars5m?.length >= 20
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
      const a = await analyzePair(pair, { liveQuote, bars, macro });
      results.push(a);
    } catch (e) {
      console.warn(`[fx-analyze] ${pair}`, e.message);
    }
  }
  lastAnalyses = results.length
    ? config.pairs.map((pair) => {
      const fresh = results.find((a) => a.pair === pair);
      if (fresh) return fresh;
      return lastAnalyses.find((a) => a.pair === pair);
    }).filter(Boolean)
    : lastAnalyses;
  const entries = rankEntriesBalanced(
    results
      .filter((a) => a.action === 'BUY' || a.action === 'SELL')
      .sort((a, b) => {
        const ca = a.smart?.conviction ?? a.score;
        const cb = b.smart?.conviction ?? b.score;
        return cb - ca;
      }),
    config,
  );
  lastAnalysis = entries[0] || results.slice().sort((a, b) => {
    const ca = a.smart?.conviction ?? a.score ?? 0;
    const cb = b.smart?.conviction ?? b.score ?? 0;
    return cb - ca;
  })[0] || null;
  return { results, entries, buys: entries.filter((a) => a.action === 'BUY') };
}

async function onAnalyzeCycle() {
  resetDayIfNeeded();
  tickCount += 1;

  const now = Date.now();
  if (now - lastAnalyzeAt < ANALYZE_GAP_MS) {
    maybeLogTick();
    return;
  }

  try {
    const { entries, results } = await runAllAnalyses();
    lastAnalyzeAt = Date.now();
    logScanSummary(results, entries);
    const gate = checkEntryAllowed(risk);
    let openedAny = false;

    if (gate.allowed && executor.isTradingEnabled()) {
      let openedThisCycle = 0;
      const maxPerCycle = config.smartMode !== false
        ? (config.smartMaxEntriesPerCycle ?? 2)
        : config.maxOpenPositions;

      for (const candidate of entries) {
        if (executor.getOpenCount() >= config.maxOpenPositions) break;
        if (openedThisCycle >= maxPerCycle) {
          console.log(`[fx-skip] ${candidate.pair} smart cycle limit (${maxPerCycle})`);
          break;
        }
        if (executor.hasPair(candidate.pair)) continue;

        if (candidate.pairStats?.paused) {
          console.log(`[fx-skip] ${candidate.pair} ${candidate.pairStats.pauseReason}`);
          continue;
        }

        const pairLimit = isPairDailyLimitReached(
          candidate.pair,
          config.pairMaxTradesPerDay,
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

        if ((candidate.spreadPips ?? 0) > config.maxSpreadPips) {
          console.log(`[fx-skip] ${candidate.pair} spread ${candidate.spreadPips} > max ${config.maxSpreadPips}`);
          continue;
        }

        const exp = checkCurrencyExposure(
          executor.getOpenTrades(),
          candidate.pair,
          config.maxExposurePerCurrency,
        );
        if (exp.blocked) {
          console.log(`[fx-skip] ${candidate.pair} ${exp.reason}`);
          continue;
        }

        if (isJpyCross(candidate.pair)) {
          const jpyOpen = executor.getOpenTrades().filter((t) => isJpyCross(t.pair)).length;
          if (jpyOpen >= (config.maxJpyCrossPositions ?? 1)) {
            console.log(`[fx-skip] ${candidate.pair} ліміт JPY-cross (${jpyOpen}/${config.maxJpyCrossPositions})`);
            continue;
          }
        }

        const opened = await executor.tryOpen(candidate);
        if (opened) {
          risk.tradesToday += 1;
          appendEvent('entry', opened);
          openedAny = true;
          openedThisCycle += 1;
          const conv = candidate.smart?.conviction ?? opened.score;
          const brokerTag = executorMode === 'oanda' ? ' [OANDA]' : '';
          console.log(`[fx-entry]${brokerTag} ${opened.side} ${opened.pair} @ ${opened.entry} SL ${opened.stopLoss} TP ${opened.takeProfit} conviction=${conv}`);
        }
      }
    } else if (entries.length && !gate.allowed) {
      console.log(`[fx-skip] ${entries[0].pair} ${gate.reason}`);
    }

    if (openedAny) publishState({}, true);
    maybeLogTick();
  } catch (e) {
    console.error('[fx-analyze]', e.message);
  }

  publishState({}, true);
}

async function monitorOpenTrades() {
  const opens = executor.getOpenTrades();
  if (!opens.length) return;

  let closedAny = false;

  if (executorMode === 'oanda' && typeof executor.syncFromBroker === 'function') {
    try {
      const closedList = await executor.syncFromBroker();
      for (const closed of closedList) {
        closedAny = true;
        pairCooldown.markExit(closed.pair, closed.exitReason);
        risk.dailyPnlUsd = round(risk.dailyPnlUsd + closed.pnlUsd, 2);
        appendEvent('exit', closed);
        console.log(`[fx-exit] [OANDA] ${closed.side} ${closed.pair} ${closed.exitReason} pips=${closed.pips} pnl=$${closed.pnlUsd} day=$${risk.dailyPnlUsd}`);
      }
    } catch (e) {
      console.warn('[fx-monitor] oanda sync', e.message);
    }
  }

  for (const t of opens) {
    try {
      await hub.refreshPair(t.pair);
      const q = hub.getPairSnapshot(t.pair);
      if (!q) continue;

      if (executorMode === 'oanda') {
        if (q.bid != null) t.lastBid = q.bid;
        if (q.ask != null) t.lastAsk = q.ask;
        t.lastMark = t.side === 'short' ? q.ask ?? q.mid : q.bid ?? q.mid;
        t.lastMarkAt = Date.now();
        continue;
      }

      const closed = executor.onTick(t.pair, q);
      if (closed) {
        closedAny = true;
        pairCooldown.markExit(closed.pair, closed.exitReason);
        risk.dailyPnlUsd = round(risk.dailyPnlUsd + closed.pnlUsd, 2);
        appendEvent('exit', closed);
        console.log(`[fx-exit] ${closed.side} ${closed.pair} ${closed.exitReason} pips=${closed.pips} pnl=$${closed.pnlUsd} day=$${risk.dailyPnlUsd}`);
      }
    } catch (e) {
      console.warn(`[fx-monitor] ${t.pair}`, e.message);
    }
  }

  if (closedAny) publishState({}, true);
  else maybeLogTick();
}

async function main() {
  if (!claimWorkerLock()) {
    console.error('[fx-worker] інший worker вже працює — зупини його перед стартом');
    process.exit(1);
  }

  pairCooldown.hydrateFromJournal();
  syncDailyPnlFromJournal();

  const openEntries = getOpenEntries();
  if (openEntries.length > 0) {
    const n = executor.restoreAll(openEntries);
    const today = new Date().toISOString().slice(0, 10);
    risk.tradesToday = openEntries.filter((e) => dayKeyFromTs(e.ts || e.openedAt) === today).length;
    console.log(`[fx-worker] recovered ${n} open position(s): ${executor.getOpenTrades().map((t) => t.pair).join(', ')}`);
  }

  if (executorMode === 'oanda' && typeof executor.hydrateFromBroker === 'function') {
    try {
      const remote = await executor.hydrateFromBroker();
      if (remote > 0) {
        console.log(`[fx-worker] synced ${remote} open trade(s) from OANDA`);
      }
    } catch (e) {
      console.warn('[fx-worker] OANDA hydrate failed:', e.message);
    }
  }

  console.log(`[fx-worker] pairs=${config.pairs.join(',')} maxOpen=${config.maxOpenPositions} mode=${config.mode} provider=${config.dataProvider} executor=${executorMode} tick=${config.tickMs}ms analyzeGap=${ANALYZE_GAP_MS}ms profitBoost=${config.profitBoost !== false} TP=${config.targetPips} SL=${config.stopPips} bidirectional=${config.bidirectional !== false}`);

  hub.on('tick', () => {
    onAnalyzeCycle().catch((e) => console.error('[fx-tick]', e));
  });
  hub.on('error', (e) => console.error('[fx-stream]', e.message));

  await hub.start();

  if (config.dataProvider === 'yahoo') {
    setInterval(() => {
      monitorOpenTrades().catch((e) => console.error('[fx-monitor]', e.message));
    }, config.tickMs);

    setInterval(() => {
      hub.refreshAllPairs().catch((e) => console.error('[fx-refresh]', e.message));
    }, ANALYZE_GAP_MS);

    setInterval(() => publishState({}, true), 2000);
  }

  publishState({ startedAt: new Date().toISOString() }, true);

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
