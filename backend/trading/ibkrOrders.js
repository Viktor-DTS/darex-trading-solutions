const { submitBracketOrder } = require('./ibkrClient');

/**
 * Обробка BUY-сигналів: черга pending_ibkr або open після IBKR.
 */
async function processBuySignals(models, buySignals, settings) {
  const created = [];
  if (!buySignals.length) return created;

  for (const sig of buySignals) {
    const symbol = String(sig.symbol || '').toUpperCase();
    if (!symbol) continue;

    const existing = await models.TradingTrade.findOne({
      symbol,
      status: { $in: ['open', 'pending_ibkr'] },
    }).lean();
    if (existing) continue;

    const ibkrResult = await submitBracketOrder(sig, settings);
    const quantity =
      sig.quantity ||
      Math.max(1, Math.floor((sig.positionSizeUsd || 0) / (sig.entryPrice || 1)));

    const trade = await models.TradingTrade.create({
      symbol,
      side: 'long',
      status: ibkrResult.ok ? 'open' : 'pending_ibkr',
      entryPrice: sig.entryPrice,
      quantity,
      stopLoss: sig.stopLoss,
      takeProfit: sig.takeProfit,
      openedAt: new Date(),
      source: 'scan',
      signalId: sig._id,
      notes: `[${ibkrResult.mode}] ${ibkrResult.message}${ibkrResult.orderPreview ? ` | preview: ${JSON.stringify(ibkrResult.orderPreview)}` : ''}`,
    });

    created.push({ trade: trade.toObject(), ibkr: ibkrResult });
  }

  return created;
}

module.exports = { processBuySignals };
