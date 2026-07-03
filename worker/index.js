require('dotenv').config();
const config = require('../config');
const { MarketDataHub } = require('../services/market-data');
const { analyzePair } = require('../services/analyzer');
const { createRiskState, checkEntryAllowed } = require('../services/risk');
const { createSimExecutor } = require('../services/executor/sim');
const { appendEvent, summarize } = require('../services/journal');
const { writeState } = require('../services/state');
const { round } = require('../services/utils');

const hub = new MarketDataHub({ pair: config.pair, provider: config.dataProvider });
const risk = createRiskState();
const sim = createSimExecutor();
let tickCount = 0;
let lastAnalysis = null;
let lastAnalyzeAt = 0;

const ANALYZE_GAP_MS = config.dataProvider === 'oanda' ? 2000 : config.tickMs * 5;

function resetDayIfNeeded() {
  const key = new Date().toISOString().slice(0, 10);
  if (risk.dayKey !== key) {
    risk.dayKey = key;
    risk.dailyPnlUsd = 0;
    risk.tradesToday = 0;
    risk.tradingPaused = false;
    risk.pauseReason = '';
  }
}

function publishState(extra = {}) {
  if (!config.stateFileEnabled) return;
  writeState({
    pair: config.pair,
    provider: config.dataProvider,
    tickCount,
    risk,
    lastAnalysis,
    openTrade: sim.getOpenTrade(),
    journal: summarize(),
    ...extra,
  });
}

async function runAnalysis(snapshot) {
  const liveQuote = snapshot?.bid != null ? {
    bid: snapshot.bid,
    ask: snapshot.ask,
    mid: snapshot.mid,
    spreadPips: snapshot.spreadPips,
    source: snapshot.source,
  } : null;

  lastAnalysis = await analyzePair(config.pair, { liveQuote });
  lastAnalyzeAt = Date.now();
  return lastAnalysis;
}

async function onTick(snapshot) {
  resetDayIfNeeded();
  tickCount += 1;

  if (sim.getOpenTrade()) {
    const closed = sim.onTick(snapshot);
    if (closed) {
      risk.dailyPnlUsd = round(risk.dailyPnlUsd + closed.pnlUsd, 2);
      appendEvent('exit', closed);
      console.log(`[fx-exit] ${closed.pair} ${closed.exitReason} pips=${closed.pips} pnl=$${closed.pnlUsd}`);
    }
    publishState();
    return;
  }

  const now = Date.now();
  if (now - lastAnalyzeAt < ANALYZE_GAP_MS) {
    if (tickCount % 10 === 0) publishState();
    return;
  }

  try {
    const analysis = await runAnalysis(snapshot);
    const gate = checkEntryAllowed(risk);

    if (analysis.action === 'BUY' && gate.allowed && config.simulate) {
      const opened = sim.tryOpen(analysis);
      if (opened) {
        risk.tradesToday += 1;
        appendEvent('entry', opened);
        console.log(`[fx-entry] ${opened.pair} @ ${opened.entry} SL ${opened.stopLoss} TP ${opened.takeProfit} score=${opened.score}`);
      }
    } else if (analysis.action === 'BUY' && !gate.allowed) {
      console.log(`[fx-skip] ${gate.reason}`);
    } else if (tickCount % 30 === 0) {
      console.log(`[fx-tick] ${analysis.pair} ${analysis.action} score=${analysis.score} regime=${analysis.regime}`);
    }
  } catch (e) {
    console.error('[fx-analyze]', e.message);
  }

  publishState();
}

async function main() {
  console.log(`[fx-worker] pair=${config.pair} mode=${config.mode} provider=${config.dataProvider} tick=${config.tickMs}ms analyzeGap=${ANALYZE_GAP_MS}ms`);

  hub.on('tick', (snap) => {
    onTick(snap).catch((e) => console.error('[fx-tick]', e));
  });
  hub.on('error', (e) => console.error('[fx-stream]', e.message));

  await hub.start();

  if (config.dataProvider === 'yahoo') {
    setInterval(() => {
      hub.refreshBars().catch((e) => console.error('[fx-refresh]', e.message));
    }, config.tickMs);
  }

  publishState({ startedAt: new Date().toISOString() });
}

process.on('SIGINT', () => {
  hub.stop();
  process.exit(0);
});

main().catch((e) => {
  console.error('[fx-worker] fatal', e);
  process.exit(1);
});
