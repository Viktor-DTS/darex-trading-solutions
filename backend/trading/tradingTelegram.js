async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TRADING_TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) {
    console.log('[trading-telegram] skip: token or chat id missing');
    return { ok: false, reason: 'missing token or chat id' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const json = await res.json();
    return { ok: json.ok === true, reason: json.description };
  } catch (e) {
    console.error('[trading-telegram]', e.message);
    return { ok: false, reason: e.message };
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function regimeLabel(regime) {
  const r = String(regime || '').toLowerCase().replace(/\s+/g, '_');
  if (r === 'risk_on') return 'ризик-on';
  if (r === 'risk_off') return 'ризик-off';
  if (r === 'elevated') return 'підвищений';
  return regime;
}

function modeLabel(mode) {
  const m = String(mode || '').toLowerCase();
  if (m === 'simulate' || m === 'sim') return 'симуляція';
  if (m === 'paper') return 'paper';
  if (m === 'live') return 'live';
  return mode;
}

function triggerLabel(triggeredBy) {
  const t = String(triggeredBy || '');
  if (t === 'interval') return 'інтервал';
  if (t === 'startup') return 'старт';
  if (t.includes('cron')) return 'cron';
  if (t.startsWith('manual:')) return `вручну (${t.slice(7)})`;
  return triggeredBy;
}

function autoLabel(on) {
  return on ? 'УВІМК' : 'ВИМК';
}

function pauseReasonLabel(reason) {
  const r = String(reason || '').toLowerCase();
  if (r === 'manual from dashboard') return 'вручну з панелі';
  return reason;
}

function isBuyOnlyTelegram() {
  return process.env.TRADING_TELEGRAM_BUY_ONLY !== '0';
}

function isTelegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
      (process.env.TRADING_TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID),
  );
}

/** Алерт лише при BUY (основний канал сповіщень). */
async function notifyBuySignals({ scanId, regime, vix, buys, mode, autoEnabled, triggeredBy }) {
  if (!buys.length) return { ok: false, skipped: true };

  const lines = [
    `<b>🟢 СИГНАЛ КУПІВЛІ</b> · скан <code>${escapeHtml(scanId)}</code>`,
    `Режим: <b>${escapeHtml(regimeLabel(regime))}</b> | VIX: <b>${vix ?? '—'}</b>`,
    `Торгівля: <b>${escapeHtml(modeLabel(mode))}</b> | Авто: <b>${autoLabel(autoEnabled)}</b>`,
    triggeredBy ? `Тригер: ${escapeHtml(triggerLabel(triggeredBy))}` : '',
    '',
  ].filter(Boolean);

  for (const s of buys) {
    const rank = s.meta?.buyRank ?? s.buyRank;
    const rankTxt = rank ? ` · топ #${rank}` : '';
    lines.push(`<b>${escapeHtml(s.symbol)}</b>${rankTxt} @ ${s.entryPrice}`);
    lines.push(`SL ${s.stopLoss} | TP ${s.takeProfit}`);
    lines.push(`Score ${s.finalScore} | ~$${s.positionSizeUsd ?? '?'} | qty ${s.quantity ?? '?'}`);
    lines.push(`<i>${escapeHtml(s.reason)}</i>`);
    lines.push('');
  }

  return sendTelegramMessage(lines.join('\n'));
}

/** Короткий звіт scan (cron / manual) — опційно. */
async function notifyTradingScan({ scanId, regime, vix, signals, mode, autoEnabled, triggeredBy }) {
  if (isBuyOnlyTelegram()) {
    const buys = signals.filter((s) => s.action === 'BUY');
    return notifyBuySignals({ scanId, regime, vix, buys, mode, autoEnabled, triggeredBy });
  }

  const buys = signals.filter((s) => s.action === 'BUY');
  const lines = [
    `<b>📊 Скан торгівлі</b> <code>${escapeHtml(scanId)}</code>`,
    `Торгівля: <b>${escapeHtml(modeLabel(mode))}</b> | Авто: <b>${autoLabel(autoEnabled)}</b>`,
    `Режим: <b>${escapeHtml(regimeLabel(regime))}</b> | VIX: <b>${vix ?? '—'}</b>`,
    triggeredBy ? `Запуск: <b>${escapeHtml(triggerLabel(triggeredBy))}</b>` : '',
    '',
  ].filter(Boolean);

  if (!buys.length) {
    lines.push('Сигналів BUY немає.');
    const top = signals
      .filter((s) => !s.error)
      .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
      .slice(0, 3);
    for (const s of top) {
      lines.push(`${escapeHtml(s.symbol)}: ${s.action} (${s.finalScore})`);
    }
  } else {
    lines.push(`<b>BUY (${buys.length}):</b>`);
    for (const s of buys) {
      lines.push(`• ${escapeHtml(s.symbol)} @ ${s.entryPrice} | SL ${s.stopLoss} | TP ${s.takeProfit}`);
    }
  }

  return sendTelegramMessage(lines.join('\n'));
}

async function notifyTradingAlert(message) {
  return sendTelegramMessage(`<b>⚠️ Торгівля</b>\n${escapeHtml(message)}`);
}

async function notifyTradingPaused(reason, login) {
  const who = login ? ` (${login})` : '';
  return notifyTradingAlert(`Торгівлю ПАУЗУ: ${pauseReasonLabel(reason)}${who}`);
}

async function sendTelegramTest() {
  return sendTelegramMessage(
    '<b>✅ Тест Telegram торгівлі</b>\nЗв\'язок працює. Сигнали BUY надходитимуть сюди.',
  );
}

module.exports = {
  sendTelegramMessage,
  isTelegramConfigured,
  isBuyOnlyTelegram,
  notifyBuySignals,
  notifyTradingScan,
  notifyTradingAlert,
  notifyTradingPaused,
  sendTelegramTest,
  regimeLabel,
  modeLabel,
  triggerLabel,
  pauseReasonLabel,
};
