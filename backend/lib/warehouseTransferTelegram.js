/**
 * Telegram-сповіщення по запитах на переміщення між складами (сервіс → завсклад).
 */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isValidTelegramChatId(chatId) {
  const s = String(chatId || '').trim();
  return /^-?\d+$/.test(s);
}

function formatTransferMessage(tr, event) {
  const rn = escapeHtml(tr?.requestNumber || '');
  const nom = escapeHtml(tr?.nomenclature || '—');
  const qty = escapeHtml(String(tr?.quantity ?? '—'));
  const fromWh = escapeHtml(tr?.fromWarehouseName || '—');
  const toWh = escapeHtml(tr?.toWarehouseName || '—');
  const who = escapeHtml(tr?.requesterName || tr?.requesterLogin || '—');
  const task = escapeHtml(tr?.taskNumber || '—');

  const headers = {
    requested: '📦 Новий запит на переміщення',
    approved: '✅ Запит на переміщення підтверджено',
    rejected: '❌ Запит на переміщення відхилено',
  };

  let body = `<b>${headers[event] || headers.requested}</b>\n\n`;
  body += `📋 <b>№:</b> ${rn}\n`;
  body += `📦 <b>Номенклатура:</b> ${nom}\n`;
  body += `🔢 <b>Кількість:</b> ${qty}\n`;
  body += `🏭 <b>Зі складу:</b> ${fromWh}\n`;
  body += `🏁 <b>На склад:</b> ${toWh}\n`;
  body += `👤 <b>Ініціатор:</b> ${who}\n`;
  if (tr?.taskNumber) body += `📝 <b>Заявка:</b> ${task}\n`;
  if (event === 'rejected' && tr?.sourceRejectReason) {
    body += `\n📝 <b>Причина:</b> ${escapeHtml(tr.sourceRejectReason)}`;
  }
  if (tr?.comment) {
    body += `\n💬 <b>Коментар:</b> ${escapeHtml(tr.comment)}`;
  }
  return body;
}

async function sendWarehouseTransferTelegram(deps, tr, event, recipientLogins) {
  const { telegramService, User, NotificationLog } = deps;
  if (!telegramService || !tr || !recipientLogins?.length) return { sent: 0 };

  const users = await User.find({
    dismissed: { $ne: true },
    login: { $in: recipientLogins },
    telegramChatId: { $exists: true, $ne: '' },
  })
    .select('login telegramChatId')
    .lean();

  const message = formatTransferMessage(tr, event);
  let sent = 0;
  for (const u of users) {
    const chatId = String(u.telegramChatId || '').trim();
    if (!isValidTelegramChatId(chatId)) continue;
    const success = await telegramService.sendMessage(chatId, message);
    if (success) sent += 1;
    if (NotificationLog) {
      try {
        await NotificationLog.create({
          type: `warehouse_transfer_${event}`,
          taskId: tr._id,
          userId: u.login,
          message,
          telegramChatId: chatId,
          status: success ? 'sent' : 'failed',
        });
      } catch {
        /* ignore */
      }
    }
  }
  return { sent };
}

module.exports = {
  formatTransferMessage,
  sendWarehouseTransferTelegram,
};
