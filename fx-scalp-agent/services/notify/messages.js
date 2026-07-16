function sideLabel(side) {
  const s = String(side || '').toLowerCase();
  if (s === 'long') return 'ЛОНГ';
  if (s === 'short') return 'ШОРТ';
  return String(side || '').toUpperCase();
}

function exitReasonLabel(reason) {
  const map = {
    stop: 'стоп',
    take_profit: 'тейк-профіт',
    manual: 'вручну',
    breakeven: 'безбиток',
    conv_decay: 'conv↓',
    profit_decay: 'фіксація +',
    good_enough: 'достатньо +',
    time_scratch: 'time scratch',
    time_profit: 'time +',
    time_exit: 'time вихід',
    dynamic_tp: 'TP↓',
  };
  return map[reason] || reason;
}

function modeLabel(simulate) {
  return simulate ? 'сим' : 'live';
}

function formatWorkerOnline(config, risk) {
  const pairPreview = config.pairs.slice(0, 5).join(', ');
  const pairSuffix = config.pairs.length > 5 ? '…' : '';
  return (
    '🤖 FX Scalp — воркер онлайн\n'
    + `Пари: ${config.pairs.length} (${pairPreview}${pairSuffix})\n`
    + `Режим: ${modeLabel(config.simulate)} · TP ${config.targetPips}p · SL ${config.stopPips}p\n`
    + `P/L за день: $${risk.dailyPnlUsd}`
  );
}

function formatEntryAlert(opened, { watchTag = false, conviction } = {}) {
  const watchNote = watchTag ? ' (з WATCH)' : '';
  const conv = conviction ?? opened.score;
  return (
    `📈 Вхід · ${sideLabel(opened.side)} ${opened.pair}\n`
    + `Ціна ${opened.entry} · SL ${opened.stopLoss} · TP ${opened.takeProfit}\n`
    + `Впевненість: ${conv}${watchNote}`
  );
}

function formatExitAlert(closed, risk) {
  return (
    `📉 Вихід · ${sideLabel(closed.side)} ${closed.pair} (${exitReasonLabel(closed.exitReason)})\n`
    + `Pips: ${closed.pips} · P/L: $${closed.pnlUsd} · за день: $${risk.dailyPnlUsd}`
  );
}

module.exports = {
  sideLabel,
  exitReasonLabel,
  formatWorkerOnline,
  formatEntryAlert,
  formatExitAlert,
};
