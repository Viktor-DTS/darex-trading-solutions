const { fetchChart, ema, rsi, atr } = require('./tradingMarketData');

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sameEtDay(a, b) {
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return fmt(a) === fmt(b);
}

function calcSessionVwap(bars) {
  const now = new Date();
  const sessionBars = bars.filter((b) => sameEtDay(b.date, now));
  if (!sessionBars.length) return null;

  let sumPv = 0;
  let sumV = 0;
  for (const b of sessionBars) {
    const typical = (b.high + b.low + b.close) / 3;
    const vol = b.volume > 0 ? b.volume : 1;
    sumPv += typical * vol;
    sumV += vol;
  }
  return sumV > 0 ? sumPv / sumV : null;
}

/**
 * Intraday long-only scoring on 15m bars — ціль ~$5–15/день через фіксований $ TP/SL.
 */
function scoreActiveSymbol(chart, externalContext = {}, settings = {}) {
  const closes = chart.bars.map((b) => b.close);
  const price = chart.lastPrice;
  const vwap = calcSessionVwap(chart.bars);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(chart.bars, 14);

  let technical = 50;
  const reasons = [];

  if (vwap != null) {
    if (price > vwap) {
      technical += 18;
      reasons.push('ціна вище VWAP');
    } else {
      technical -= 20;
      reasons.push('ціна нижче VWAP — long слабкий');
    }
  }

  if (ema9 != null && ema21 != null) {
    if (ema9 > ema21) {
      technical += 14;
      reasons.push('EMA9 > EMA21 (intraday uptrend)');
    } else {
      technical -= 12;
      reasons.push('intraday downtrend');
    }

    if (price > ema9) {
      const dist = (price - ema9) / price;
      if (dist <= 0.004) {
        technical += 10;
        reasons.push('відкат до EMA9');
      }
    }
  }

  if (rsi14 != null) {
    if (rsi14 >= 42 && rsi14 <= 62) {
      technical += 8;
    } else if (rsi14 > 72) {
      technical -= 12;
      reasons.push('RSI перегрів');
    } else if (rsi14 < 35) {
      technical -= 6;
    }
  }

  const external = externalContext.externalScore ?? 60;
  const sentiment = externalContext.sentimentScore ?? 55;
  let finalScore = technical * 0.5 + external * 0.3 + sentiment * 0.2;
  finalScore = clamp(finalScore, 0, 100);

  const targetUsd = Number(settings.targetProfitPerTradeUsd) || 6;
  const riskUsd = Number(settings.targetRiskPerTradeUsd) || 4;

  let stopLoss = round2(price - riskUsd);
  let takeProfit = round2(price + targetUsd);

  if (atr14 != null) {
    const minStop = round2(price - atr14 * 0.6);
    const maxStop = round2(price - atr14 * 1.2);
    if (stopLoss > maxStop) stopLoss = maxStop;
    if (stopLoss < minStop) stopLoss = minStop;
    const risk = price - stopLoss;
    takeProfit = round2(price + Math.max(targetUsd, risk * 1.5));
  }

  const risk = price - stopLoss;
  const rr = risk > 0 ? (takeProfit - price) / risk : 0;

  let action = 'SKIP';
  const minScore = Number(settings.activeMinScore) || 68;
  const minExternal = Number(settings.activeMinExternal) || 40;

  if (vwap != null && price <= vwap) {
    action = 'SKIP';
    reasons.push('нижче VWAP');
  } else if (ema9 != null && ema21 != null && ema9 <= ema21) {
    action = 'SKIP';
  } else if (finalScore >= minScore && external >= minExternal) {
    action = 'BUY';
  } else if (finalScore >= minScore - 10) {
    action = 'HOLD';
  } else {
    action = 'SKIP';
  }

  if (action === 'BUY' && rr < 1.2) {
    action = 'SKIP';
    reasons.push(`R:R ${rr.toFixed(2)} < 1.2`);
  }

  if (externalContext.blockNewEntries && action === 'BUY') {
    action = 'SKIP';
    reasons.push(`блок: ${externalContext.blockReason || 'daily limit'}`);
  }

  return {
    symbol: chart.symbol,
    action,
    technicalScore: Math.round(technical),
    externalScore: Math.round(external),
    sentimentScore: Math.round(sentiment),
    finalScore: Math.round(finalScore),
    entryPrice: round2(price),
    stopLoss,
    takeProfit,
    riskReward: round2(rr),
    indicators: {
      vwap: vwap != null ? round2(vwap) : null,
      ema9: ema9 != null ? round2(ema9) : null,
      ema21: ema21 != null ? round2(ema21) : null,
      rsi14: rsi14 != null ? round2(rsi14) : null,
      atr14: atr14 != null ? round2(atr14) : null,
    },
    reason: reasons.join('; ') || 'active rules',
    strategyProfile: 'active',
  };
}

async function analyzeActiveWatchlist(symbols, externalContext, settings) {
  const results = [];
  const interval = settings.activeChartInterval || '15m';
  const range = settings.activeChartRange || '5d';
  const minBars = 20;

  for (const symbol of symbols) {
    try {
      const chart = await fetchChart(symbol, range, interval, { minBars });
      const symExternal = {
        ...externalContext,
        externalScore: externalContext.symbolScores?.[symbol] ?? externalContext.externalScore,
        sentimentScore: externalContext.symbolSentiment?.[symbol] ?? externalContext.sentimentScore,
      };
      const scored = scoreActiveSymbol(chart, symExternal, settings);
      scored.reason = `${scored.reason}; ${interval} chart (${chart.source})`;
      if (chart.fallbackFrom) {
        scored.reason = `${scored.reason}; yahoo blocked`;
      }
      results.push(scored);
    } catch (e) {
      results.push({
        symbol,
        action: 'SKIP',
        technicalScore: 0,
        externalScore: 0,
        sentimentScore: 0,
        finalScore: 0,
        reason: `active data error: ${e.message}`,
        error: true,
        strategyProfile: 'active',
      });
    }
  }
  return results;
}

module.exports = {
  scoreActiveSymbol,
  analyzeActiveWatchlist,
};
