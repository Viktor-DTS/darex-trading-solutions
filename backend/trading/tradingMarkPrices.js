const { fetchChart } = require('./tradingMarketData');

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

const OPEN_MARK_STATUSES = ['open', 'pending_sim', 'pending_ibkr'];

/**
 * Оновлює lastMarkPrice для відкритих/очікуваних угод після скану.
 */
async function refreshOpenTradeMarkPrices(models, scanId, settings = {}) {
  if (!models?.TradingTrade) {
    return { updated: 0, symbols: 0 };
  }

  const trades = await models.TradingTrade.find({
    status: { $in: OPEN_MARK_STATUSES },
  }).lean();

  if (!trades.length) {
    return { updated: 0, symbols: 0 };
  }

  const symbols = [...new Set(trades.map((t) => String(t.symbol || '').toUpperCase()).filter(Boolean))];
  const priceBySymbol = new Map();
  const markedAt = new Date();

  for (const symbol of symbols) {
    try {
      const isActive = settings?.strategyProfile === 'active';
      const chart = isActive
        ? await fetchChart(symbol, '5d', '1d', { minBars: 1 })
        : await fetchChart(symbol);
      priceBySymbol.set(symbol, {
        price: round2(chart.lastPrice),
        source: chart.source || 'yahoo',
      });
    } catch (e) {
      console.warn('[trading] mark price', symbol, e.message);
    }
  }

  let updated = 0;
  for (const trade of trades) {
    const sym = String(trade.symbol || '').toUpperCase();
    const hit = priceBySymbol.get(sym);
    if (hit?.price == null) continue;

    await models.TradingTrade.updateOne(
      { _id: trade._id },
      {
        $set: {
          lastMarkPrice: hit.price,
          lastMarkPriceAt: markedAt,
          lastMarkScanId: scanId || null,
          lastMarkSource: hit.source,
        },
      },
    );
    updated += 1;
  }

  return { updated, symbols: symbols.length };
}

module.exports = {
  refreshOpenTradeMarkPrices,
  OPEN_MARK_STATUSES,
};
