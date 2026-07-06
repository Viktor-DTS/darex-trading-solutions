function buildReport(metrics, tuneResult, previous, next) {
  const lines = [
    '📊 FX Learning Report',
    `Trades: ${metrics.count} | Win ${metrics.winRate}% | PF ${metrics.profitFactor}`,
    `P/L: $${metrics.totalPnlUsd} | Expectancy: $${metrics.expectancyUsd}/trade`,
    `Avg win: $${metrics.avgWinUsd} (${metrics.avgPipsWin} pips) | Avg loss: $${metrics.avgLossUsd} (${metrics.avgPipsLoss} pips)`,
    '',
  ];

  if (tuneResult.notes.length) {
    lines.push('Adjustments:');
    for (const n of tuneResult.notes) lines.push(`• ${n}`);
  } else {
    lines.push('No parameter changes this cycle.');
  }

  lines.push('');
  lines.push('Params:');
  lines.push(`  minBuyScore: ${previous.minBuyScore} → ${next.minBuyScore}`);
  lines.push(`  minLayersAligned: ${previous.minLayersAligned ?? 3} → ${next.minLayersAligned ?? 3}`);
  lines.push(`  stopPips: ${previous.stopPips ?? '—'} → ${next.stopPips}`);
  lines.push(`  targetPips: ${previous.targetPips ?? '—'} → ${next.targetPips}`);
  if (next.tradingPaused) {
    lines.push(`  ⏸ PAUSED: ${next.pauseReason}`);
  }

  return lines.join('\n');
}

module.exports = { buildReport };
