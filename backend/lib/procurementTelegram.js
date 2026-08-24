/**
 * Telegram-сповіщення по заявках закупівель (VZ) — форматування та розсилка за notificationSettings.
 */

const { decodeMultipartFilename } = require('./multipartFilename');

const PRIORITY_LABELS = {
  '1_workday': 'На протязі 1 робочого дня',
  '5_workdays': 'На протязі 5 робочих днів',
  '7_workdays': 'На протязі 7 робочих днів',
  more_than_7_workdays: 'Більше 7 робочих днів',
};

const PAYER_LABELS = {
  dts: 'ДТС',
  dareks_energo: 'Дарекс Енерго',
};

const APPLICATION_KIND_LABELS = {
  purchase: 'Закупівля',
  price_determination: 'Визначення ціни',
};

const EXECUTOR_DOC_LABELS = {
  invoice: 'Рахунок',
  delivery_note: 'Видаткова накладна',
  other: 'Інше',
};

/** event: created | executor_completed | warehouse_confirmed | rejected */
const EVENT_SETTING_FIELD = {
  created: 'procurementRequestCreated',
  executor_completed: 'procurementExecutorCompleted',
  warehouse_confirmed: 'procurementWarehouseConfirmed',
  rejected: 'procurementRequestRejected',
};

const EVENT_HEADERS = {
  created: '🆕 Нова заявка на закупівлю',
  executor_completed: '✅ Заявку виконано відділом закупівель',
  warehouse_confirmed: '📦 Надходження на склад підтверджено',
  rejected: '❌ Заявку на закупівлю відхилено',
};

function extractProcurementBlockReason(pr) {
  const notes = String(pr?.notes || '').trim();
  const match = notes.match(/^Заблоковано:\s*(.+?)(?:\n|$)/u);
  return match ? match[1].trim() : '';
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDateTimeUk(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function labelPriority(v) {
  return PRIORITY_LABELS[String(v || '')] || String(v || '—');
}

function labelPayer(v) {
  return PAYER_LABELS[String(v || '')] || String(v || '—');
}

function labelApplicationKind(v) {
  return APPLICATION_KIND_LABELS[String(v || '')] || String(v || '—');
}

function lineExpectedQty(line) {
  if (!line || line.rejected) return null;
  let main = 0;
  if (line.quantity != null && Number.isFinite(Number(line.quantity))) {
    main = Math.max(0, Number(line.quantity));
  }
  let analog = 0;
  if (
    line.analogShipped &&
    String(line.analogName || '').trim() &&
    line.analogQuantity != null &&
    Number.isFinite(Number(line.analogQuantity))
  ) {
    analog = Math.max(0, Number(line.analogQuantity));
  }
  const sum = main + analog;
  return sum > 0 ? sum : null;
}

function formatMaterialsBlock(pr, { includeExecutorFields = false } = {}) {
  const lines = [];
  (pr.materials || []).forEach((m, i) => {
    const parts = [`${i + 1}. ${escapeHtml(m.name || '—')}`];
    if (m.rejected) {
      parts.push('   ❌ Відхилено виконавцем');
      lines.push(parts.join('\n'));
      return;
    }
    const qty = lineExpectedQty(m);
    const uom = String(m.unitOfMeasure || 'шт.').trim() || 'шт.';
    if (qty != null) parts.push(`   Кількість: ${qty} ${escapeHtml(uom)}`);
    if (includeExecutorFields) {
      const wh = String(m.actualWarehouse || '').trim();
      if (wh) parts.push(`   Фактичний склад: ${escapeHtml(wh)}`);
      const sup = String(m.supplierName || '').trim();
      if (sup) parts.push(`   Постачальник: ${escapeHtml(sup)}`);
      const edrpou = String(m.supplierEdrpou || '').trim();
      if (edrpou) parts.push(`   ЄДРПОУ: ${escapeHtml(edrpou)}`);
      if (m.price != null && Number.isFinite(Number(m.price))) {
        parts.push(`   Ціна за од. з ПДВ: ${Number(m.price)}`);
      }
      if (m.analogShipped && String(m.analogName || '').trim()) {
        parts.push(`   Аналог: ${escapeHtml(m.analogName)}`);
        if (m.analogQuantity != null && Number.isFinite(Number(m.analogQuantity))) {
          parts.push(`   К-сть аналогу: ${Number(m.analogQuantity)}`);
        }
      }
      const comment = String(m.executorComment || '').trim();
      if (comment) parts.push(`   Коментар: ${escapeHtml(comment)}`);
    }
    lines.push(parts.join('\n'));
  });
  return lines.length ? lines.join('\n') : '—';
}

function formatAttachmentsBlock(attachments, title) {
  const names = (attachments || [])
    .map((a) => decodeMultipartFilename(a?.originalName || '').trim())
    .filter(Boolean);
  if (!names.length) return '';
  return `\n📎 <b>${escapeHtml(title)}:</b>\n${names.map((n) => `• ${escapeHtml(n)}`).join('\n')}`;
}

function formatExecutorAttachmentsBlock(attachments) {
  const rows = (attachments || [])
    .map((a) => {
      const name = decodeMultipartFilename(a?.originalName || '').trim();
      if (!name) return '';
      const kind = EXECUTOR_DOC_LABELS[String(a?.docKind || '')] || '';
      return kind ? `• ${escapeHtml(name)} (${escapeHtml(kind)})` : `• ${escapeHtml(name)}`;
    })
    .filter(Boolean);
  if (!rows.length) return '';
  return `\n📎 <b>Файли виконавця:</b>\n${rows.join('\n')}`;
}

function formatProcurementTelegramMessage(pr, event) {
  const rn = escapeHtml(pr.requestNumber || String(pr._id || ''));
  const header = EVENT_HEADERS[event] || 'Заявка закупівель';
  const createdAt = formatDateTimeUk(pr.createdAt);
  const requester = escapeHtml(pr.requesterName || pr.requesterLogin || '—');
  const includeExecutor = event === 'executor_completed' || event === 'warehouse_confirmed';

  let body = `<b>${header}</b>\n\n`;
  body += `📋 <b>Номер:</b> ${rn}\n`;
  body += `📅 <b>Створено:</b> ${createdAt}\n`;
  body += `👤 <b>Хто створив:</b> ${requester}\n`;
  body += `📂 <b>Тип заявки:</b> ${escapeHtml(labelApplicationKind(pr.applicationKind))}\n`;

  if (pr.payerCompany) {
    body += `🏢 <b>Компанія платник:</b> ${escapeHtml(labelPayer(pr.payerCompany))}\n`;
  }
  body += `⚡ <b>Пріоритет:</b> ${escapeHtml(labelPriority(pr.priority))}\n`;
  if (pr.desiredWarehouse) {
    body += `🏭 <b>Бажаний склад відвантаження:</b> ${escapeHtml(pr.desiredWarehouse)}\n`;
  }
  const projectObject = String(pr.projectObject || '').trim();
  if (projectObject) {
    body += `🏗 <b>Під який проект/об'єкт:</b> ${escapeHtml(projectObject)}\n`;
  }
  if (includeExecutor && pr.actualWarehouse) {
    body += `🏭 <b>Фактичні склади (загалом):</b> ${escapeHtml(pr.actualWarehouse)}\n`;
  }

  body += `\n<b>Товари:</b>\n${formatMaterialsBlock(pr, { includeExecutorFields: includeExecutor })}`;

  body += formatAttachmentsBlock(pr.attachments, 'Файли заявника');
  if (includeExecutor) {
    body += formatExecutorAttachmentsBlock(pr.executorAttachments);
  }

  const notes = String(pr.notes || '').trim();
  if (notes) {
    body += `\n\n📝 <b>Примітки:</b>\n${escapeHtml(notes)}`;
  }

  if (event === 'executor_completed') {
    const execName = escapeHtml(pr.executorName || pr.executorLogin || '—');
    const execAt = formatDateTimeUk(pr.executorCompletedAt);
    body += `\n\n👷 <b>Виконавець:</b> ${execName}`;
    body += `\n🕐 <b>Дата та час виконання:</b> ${execAt}`;
    body += '\n\n<b>⚠️ ЗАЯВКА ВИКОНАНА, АЛЕ ЧЕКАЄМО НАДХОДЖЕННЯ НА СКЛАД</b>';
  }

  if (event === 'warehouse_confirmed') {
    const execName = escapeHtml(pr.executorName || pr.executorLogin || '—');
    const execAt = formatDateTimeUk(pr.executorCompletedAt);
    body += `\n\n👷 <b>Виконавець:</b> ${execName}`;
    body += `\n🕐 <b>Дата та час виконання:</b> ${execAt}`;

    const whName = escapeHtml(pr.warehouseConfirmerName || pr.warehouseConfirmerLogin || '—');
    const whAt = formatDateTimeUk(pr.warehouseReceivedAt);
    body += `\n\n✅ <b>П.І.Б. завскладу (підтвердження надходження):</b> ${whName}`;
    body += `\n📅 <b>Дата відвантаження на склад (затвердження завскладу):</b> ${whAt}`;
  }

  if (event === 'rejected') {
    const blockedBy = escapeHtml(pr.blockedByName || pr.blockedByLogin || '—');
    const blockedAt = formatDateTimeUk(pr.blockedAt);
    const blockReason = extractProcurementBlockReason(pr);
    body += `\n\n🚫 <b>Відхилив:</b> ${blockedBy}`;
    body += `\n🕐 <b>Дата відхилення:</b> ${blockedAt}`;
    if (blockReason) {
      body += `\n📝 <b>Причина:</b> ${escapeHtml(blockReason)}`;
    }
  }

  return body;
}

function isValidTelegramChatId(chatId) {
  const s = String(chatId || '').trim();
  return s && s !== 'Chat ID' && /^\d+$/.test(s);
}

async function collectProcurementRejectedChatIds(deps, pr) {
  const { User } = deps;
  const settingField = EVENT_SETTING_FIELD.rejected;
  const chatIds = new Set();

  const usersWithSetting = await User.find({
    dismissed: { $ne: true },
    telegramChatId: { $exists: true, $ne: '' },
    [`notificationSettings.${settingField}`]: true,
  })
    .select('login role telegramChatId')
    .lean();

  usersWithSetting.forEach((u) => {
    const cid = String(u.telegramChatId || '').trim();
    if (isValidTelegramChatId(cid)) chatIds.add(cid);
  });

  const admins = await User.find({
    dismissed: { $ne: true },
    role: { $in: ['admin', 'administrator'] },
    telegramChatId: { $exists: true, $ne: '' },
  })
    .select('telegramChatId')
    .lean();

  admins.forEach((u) => {
    const cid = String(u.telegramChatId || '').trim();
    if (isValidTelegramChatId(cid)) chatIds.add(cid);
  });

  if (process.env.TELEGRAM_ADMIN_CHAT_ID) {
    const adminId = String(process.env.TELEGRAM_ADMIN_CHAT_ID).trim();
    if (isValidTelegramChatId(adminId)) chatIds.add(adminId);
  }

  return [...chatIds];
}

async function sendProcurementTelegramNotifications(deps, event, pr) {
  const { telegramService, User, NotificationLog } = deps;
  if (!telegramService || !pr) return { sent: 0 };

  const settingField = EVENT_SETTING_FIELD[event];
  if (!settingField) return { sent: 0 };

  let uniqueChatIds;
  if (event === 'rejected') {
    uniqueChatIds = await collectProcurementRejectedChatIds(deps, pr);
  } else {
    const users = await User.find({
      dismissed: { $ne: true },
      telegramChatId: { $exists: true, $ne: '' },
      [`notificationSettings.${settingField}`]: true,
    })
      .select('login telegramChatId')
      .lean();

    const chatIds = [
      ...new Set(
        users.map((u) => String(u.telegramChatId || '').trim()).filter(isValidTelegramChatId)
      ),
    ];

    if (process.env.TELEGRAM_ADMIN_CHAT_ID) {
      const adminId = String(process.env.TELEGRAM_ADMIN_CHAT_ID).trim();
      if (isValidTelegramChatId(adminId)) chatIds.push(adminId);
    }

    uniqueChatIds = [...new Set(chatIds)];
  }
  if (!uniqueChatIds.length) return { sent: 0 };

  const message = formatProcurementTelegramMessage(pr, event);
  const logType = `procurement_${event}`;

  let sent = 0;
  for (const chatId of uniqueChatIds) {
    const success = await telegramService.sendMessage(chatId, message);
    if (success) sent += 1;
    if (NotificationLog) {
      try {
        await NotificationLog.create({
          type: logType,
          taskId: pr._id,
          userId: 'procurement',
          message,
          telegramChatId: chatId,
          status: success ? 'sent' : 'failed',
        });
      } catch {
        /* ignore log errors */
      }
    }
  }

  return { sent };
}

module.exports = {
  EVENT_SETTING_FIELD,
  formatProcurementTelegramMessage,
  collectProcurementRejectedChatIds,
  sendProcurementTelegramNotifications,
};
