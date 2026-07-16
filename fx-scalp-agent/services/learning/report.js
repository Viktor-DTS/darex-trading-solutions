function buildReport(metrics, tuneResult, previous, next) {
  const lines = [
    '📊 Звіт навчання FX',
    `Угоди: ${metrics.count} | Вінрейт ${metrics.winRate}% | PF ${metrics.profitFactor}`,
    `P/L: $${metrics.totalPnlUsd} | Очікування: $${metrics.expectancyUsd}/угода`,
    `Сер. прибуток: $${metrics.avgWinUsd} (${metrics.avgPipsWin} pips) | Сер. збиток: $${metrics.avgLossUsd} (${metrics.avgPipsLoss} pips)`,
    '',
  ];

  if (tuneResult.notes.length) {
    lines.push('Зміни:');
    for (const n of tuneResult.notes) lines.push(`• ${n}`);
  } else {
    lines.push('Без змін параметрів у цьому циклі.');
  }

  lines.push('');
  lines.push('Параметри:');
  lines.push(`  minBuyScore: ${previous.minBuyScore} → ${next.minBuyScore}`);
  lines.push(`  minLayersAligned: ${previous.minLayersAligned ?? 3} → ${next.minLayersAligned ?? 3}`);
  lines.push(`  stopPips: ${previous.stopPips ?? '—'} → ${next.stopPips}`);
  lines.push(`  targetPips: ${previous.targetPips ?? '—'} → ${next.targetPips}`);
  if (next.tradingPaused) {
    lines.push(`  ⏸ ПАУЗА: ${next.pauseReason}`);
  }

  return lines.join('\n');
}

module.exports = { buildReport };
