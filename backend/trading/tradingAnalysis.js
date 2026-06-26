const { fetchChart, sma, ema, rsi, atr } = require('./tradingMarketData');

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Swing score 0..100 для long-only стратегії.
 */
function scoreSymbol(chart, externalContext = {}) {
  const closes = chart.bars.map((b) => b.close);
  const price = chart.lastPrice;
  const ma200 = sma(closes, 200);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(chart.bars, 14);

  let technical = 50;
  const reasons = [];

  if (ma200 != null) {
    if (price > ma200) {
      technical += 15;
      reasons.push('ціна вище MA200');
    } else {
      technical -= 25;
      reasons.push('ціна нижче MA200 — long заборонено');
    }
  }

  if (ema20 != null && ema50 != null) {
    const dist20 = Math.abs(price - ema20) / price;
    const dist50 = Math.abs(price - ema50) / price;
    if (price > ema50 && dist20 < 0.025) {
      technical += 12;
      reasons.push('відкат до EMA20');
    } else if (price > ema50 && dist50 < 0.04) {
      technical += 8;
      reasons.push('відкат до EMA50');
    }
  }

  if (rsi14 != null) {
    if (rsi14 >= 45 && rsi14 <= 65) {
      technical += 8;
    } else if (rsi14 > 75) {
      technical -= 12;
      reasons.push('RSI перекупленість');
    } else if (rsi14 < 30) {
      technical -= 5;
    }
  }

  const external = externalContext.externalScore ?? 60;
  const sentiment = externalContext.sentimentScore ?? 55;

  let finalScore = technical * 0.45 + external * 0.35 + sentiment * 0.2;
  finalScore = clamp(finalScore, 0, 100);

  let action = 'SKIP';
  if (ma200 != null && price <= ma200) {
    action = 'SKIP';
    reasons.push('тренд down — лише cash/HOLD');
  } else if (finalScore >= 70 && external >= 40) {
    action = 'BUY';
  } else if (finalScore >= 55) {
    action = 'HOLD';
  } else {
    action = 'SKIP';
  }

  const stopLoss = atr14 != null ? price - atr14 * 1.5 : price * 0.97;
  const risk = price - stopLoss;
  const takeProfit = risk > 0 ? price + risk * 2 : price * 1.04;
  const rr = risk > 0 ? (takeProfit - price) / risk : 0;

  if (action === 'BUY' && rr < 1.8) {
    action = 'SKIP';
    reasons.push(`R:R ${rr.toFixed(2)} < 1.8`);
  }

  if (externalContext.blockNewEntries) {
    if (action === 'BUY') {
      action = 'SKIP';
      reasons.push(`блок входу: ${externalContext.blockReason || 'external'}`);
    }
  }

  return {
    symbol: chart.symbol,
    action,
    technicalScore: Math.round(technical),
    externalScore: Math.round(external),
    sentimentScore: Math.round(sentiment),
    finalScore: Math.round(finalScore),
    entryPrice: round2(price),
    stopLoss: round2(stopLoss),
    takeProfit: round2(takeProfit),
    riskReward: round2(rr),
    indicators: {
      ma200: ma200 != null ? round2(ma200) : null,
      ema20: ema20 != null ? round2(ema20) : null,
      ema50: ema50 != null ? round2(ema50) : null,
      rsi14: rsi14 != null ? round2(rsi14) : null,
      atr14: atr14 != null ? round2(atr14) : null,
    },
    reason: reasons.join('; ') || 'score rules',
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function analyzeWatchlist(symbols, externalContext) {
  const results = [];
  for (const symbol of symbols) {
    try {
      const chart = await fetchChart(symbol);
      const symExternal = {
        ...externalContext,
        externalScore: externalContext.symbolScores?.[symbol] ?? externalContext.externalScore,
        sentimentScore: externalContext.symbolSentiment?.[symbol] ?? externalContext.sentimentScore,
      };
      const scored = scoreSymbol(chart, symExternal);
      if (chart.source === 'stooq') {
        scored.reason = `${scored.reason}; data: stooq`;
      } else if (chart.fallbackFrom) {
        scored.reason = `${scored.reason}; data: stooq (yahoo blocked)`;
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
        reason: `data error: ${e.message}`,
        error: true,
      });
    }
  }
  return results;
}

module.exports = {
  analyzeWatchlist,
  scoreSymbol,
};
