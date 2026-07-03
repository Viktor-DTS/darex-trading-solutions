require('dotenv').config();
const config = require('../config');
const { MarketDataHub } = require('../services/market-data');
const { analyzePair } = require('../services/analyzer');
const { createRiskState, checkEntryAllowed } = require('../services/risk');
const { createSimExecutor } = require('../services/executor/sim');
const { round } = require('../services/utils');

const hub = new MarketDataHub({ pair: config.pair, provider: config.dataProvider });
const risk = createRiskState();
const sim = createSimExecutor();
let tickCount = 0;
let lastAnalysis = null;

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

async function onTick(snapshot) {
  resetDayIfNeeded();
  tickCount += 1;

  if (sim.getOpenTrade()) {
    const closed = sim.onTick(snapshot);
    if (closed) {
      risk.dailyPnlUsd = round(risk.dailyPnlUsd + closed.pnlUsd, 2);
      console.log(`[fx-exit] ${closed.pair} ${closed.exitReason} pips=${closed.pips} pnl=$${closed.pnlUsd}`);
    }
    return;
  }

  if (tickCount % 5 !== 0 && config.dataProvider === 'yahoo') {
    return;
  }

  try {
    lastAnalysis = await analyzePair(config.pair);
    const gate = checkEntryAllowed(risk);

    if (lastAnalysis.action === 'BUY' && gate.allowed && config.simulate) {
      const opened = sim.tryOpen(lastAnalysis);
      if (opened) {
        risk.tradesToday += 1;
        console.log(`[fx-entry] ${opened.pair} @ ${opened.entry} SL ${opened.stopLoss} TP ${opened.takeProfit} score=${opened.score}`);
      }
    } else if (lastAnalysis.action === 'BUY' && !gate.allowed) {
      console.log(`[fx-skip] ${gate.reason}`);
    } else if (tickCount % 30 === 0) {
      console.log(`[fx-tick] ${lastAnalysis.pair} ${lastAnalysis.action} score=${lastAnalysis.score} regime=${lastAnalysis.regime}`);
    }
  } catch (e) {
    console.error('[fx-analyze]', e.message);
  }
}

async function main() {
  console.log(`[fx-worker] pair=${config.pair} mode=${config.mode} provider=${config.dataProvider} tick=${config.tickMs}ms`);

  hub.on('tick', (snap) => {
    onTick(snap).catch((e) => console.error('[fx-tick]', e));
  });

  await hub.start();

  if (config.dataProvider === 'yahoo') {
    setInterval(() => {
      hub.refreshBars().catch((e) => console.error('[fx-refresh]', e.message));
    }, config.tickMs);
  }

  setInterval(() => {
    if (!lastAnalysis) return;
    const open = sim.getOpenTrade();
    if (open) {
      console.log(`[fx-open] ${open.pair} bid=${open.lastBid ?? '—'} entry=${open.entry}`);
    }
  }, 30000);
}

process.on('SIGINT', () => {
  hub.stop();
  process.exit(0);
});

main().catch((e) => {
  console.error('[fx-worker] fatal', e);
  process.exit(1);
});
