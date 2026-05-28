/**
 * Релеє пояснень регіон ↔ бухгалтер через чат асистента з підтвердженням Так/Ні.
 */
const mongoose = require('mongoose');
const {
  extractRequestNumbers,
  expandRequestNumberVariants,
} = require('./assistantTaskLookup');
const { isTaskStatisticsQuery } = require('./assistantTaskStatistics');

/** @type {{ User: import('mongoose').Model | null, createManagerNotificationDeduped: ((doc: object) => Promise<void>) | null }} */
const mainDb = {
  User: null,
  createManagerNotificationDeduped: null,
};

let AssistantRelay = null;

function initAssistantAccountantRelay(deps) {
  Object.assign(mainDb, deps);
}

function getRelayModel(getAssistantConnection) {
  const conn = getAssistantConnection();
  if (!conn || conn.readyState !== 1) return null;
  if (!AssistantRelay) {
    const schema = new mongoose.Schema(
      {
        conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        initiatorLogin: { type: String, required: true, index: true },
        recipientLogin: { type: String, default: '' },
        taskId: { type: String, default: '' },
        requestNumber: { type: String, default: '' },
        messageText: { type: String, required: true, maxlength: 4000 },
        direction: { type: String, enum: ['to_accountant', 'to_user'], required: true },
        status: {
          type: String,
          enum: ['awaiting_confirm', 'sent', 'awaiting_reply_confirm', 'cancelled'],
          default: 'awaiting_confirm',
        },
        parentRelayId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
      { timestamps: true },
    );
    schema.index({ initiatorLogin: 1, status: 1, updatedAt: -1 });
    schema.index({ recipientLogin: 1, status: 1, updatedAt: -1 });
    AssistantRelay = conn.models.AssistantRelay || conn.model('AssistantRelay', schema);
  }
  return AssistantRelay;
}

function isAffirmative(text) {
  const s = String(text || '').trim().toLowerCase().replace(/[.!…]+$/g, '');
  return /^(так|yes|y|ок|ok|okay|згоден|згодна|підтверджую|\+|да)$/i.test(s);
}

function isNegative(text) {
  const s = String(text || '').trim().toLowerCase().replace(/[.!…]+$/g, '');
  return /^(ні|no|n|не\s*потрібно|скасувати|cancel|не)$/i.test(s);
}

function looksLikeExplanation(text) {
  const s = String(text || '').trim();
  if (s.length < 12) return false;
  if (isAffirmative(s) || isNegative(s)) return false;
  if (isTaskStatisticsQuery(s)) return false;
  return /не\s+мож|неможлив|не\s+вда|через|тому\s+що|бо\s|причин|реквізит|договор|клієнт|контрагент|очіку|немає|нема\b|відсутн|безгот|рахунк|оплат|вистав/i.test(
    s,
  );
}

function normalizeRequestToken(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function requestNumbersEquivalent(token, requestNumber) {
  const a = String(token || '').trim();
  const b = String(requestNumber || '').trim();
  if (!a || !b) return false;
  const va = new Set(expandRequestNumberVariants(a).map(normalizeRequestToken));
  const vb = new Set(expandRequestNumberVariants(b).map(normalizeRequestToken));
  for (const x of va) {
    if (vb.has(x)) return true;
  }
  const numA = a.match(/(\d+)\s*$/);
  const numB = b.match(/-(\d+)\s*$/);
  if (numA && numB && numA[1] === numB[1]) {
    const suffixA = parseInt(numA[1], 10);
    const suffixB = parseInt(numB[1], 10);
    if (Number.isFinite(suffixA) && suffixA === suffixB) return true;
  }
  return false;
}

/** «заявку 678» — суфікс без префікса в тексті */
function extractBareDigitsAfterTaskWord(primary) {
  const norm = String(primary || '').replace(/\s+/g, ' ').trim();
  if (!norm) return null;
  const m =
    /заявк\p{L}*\s*[:\s-]*(\d{2,8})\b/iu.exec(norm) ||
    /номер\s+заявк\p{L}*\s*[:\s-]*(\d{2,8})\b/iu.exec(norm);
  if (!m) return null;
  const dig = String(m[1] || '');
  return /^\d{2,8}$/.test(dig) ? dig : null;
}

function tokensFromMessage(messageText, cashlessTasks) {
  const tokens = new Set(extractRequestNumbers(messageText));
  const bare = extractBareDigitsAfterTaskWord(messageText);
  if (bare) {
    const prefs = new Set();
    for (const t of cashlessTasks || []) {
      const m = String(t.requestNumber || '').match(/^([A-Za-zА-Яа-яІіЇїЄєҐґ]+)-/u);
      if (m?.[1]) prefs.add(m[1]);
    }
    if (prefs.size === 1) {
      tokens.add(`${[...prefs][0]}-${bare}`);
    } else if (prefs.size > 1) {
      for (const p of prefs) tokens.add(`${p}-${bare}`);
    } else {
      tokens.add(`KV-${bare}`);
    }
  }
  return [...tokens];
}

/**
 * @param {{ messageText?: string, cashlessTasks?: { taskId: string, requestNumber?: string }[], relayTaskContext?: { taskId?: string, requestNumber?: string } | null }} opts
 * @returns {{ task?: { taskId: string, requestNumber?: string }, needSelection?: boolean, ambiguous?: object[], tasks?: object[] }}
 */
function resolveRelayTaskForExplanation(opts) {
  const tasks = Array.isArray(opts.cashlessTasks) ? opts.cashlessTasks : [];
  const ctx = opts.relayTaskContext;

  if (ctx?.taskId) {
    const id = String(ctx.taskId).trim();
    const fromList = tasks.find((t) => String(t.taskId) === id);
    if (fromList) return { task: fromList };
    if (id) {
      return {
        task: {
          taskId: id,
          requestNumber: String(ctx.requestNumber || '').trim(),
        },
      };
    }
  }

  if (ctx?.requestNumber && !ctx?.taskId) {
    const rn = String(ctx.requestNumber).trim();
    const matched = tasks.filter((t) => requestNumbersEquivalent(rn, t.requestNumber));
    if (matched.length === 1) return { task: matched[0] };
    if (matched.length > 1) return { ambiguous: matched };
  }

  const msg = String(opts.messageText || '').trim();
  const tokens = tokensFromMessage(msg, tasks);
  if (tokens.length && tasks.length) {
    const matched = tasks.filter((t) => tokens.some((tok) => requestNumbersEquivalent(tok, t.requestNumber)));
    if (matched.length === 1) return { task: matched[0] };
    if (matched.length > 1) return { ambiguous: matched };
  }

  if (tasks.length === 1) return { task: tasks[0] };

  if (tasks.length > 1) return { needSelection: true, tasks };

  return { task: null };
}

function formatTaskListUk(tasks, max = 8) {
  return (tasks || [])
    .slice(0, max)
    .map((t) => t.requestNumber || t.taskId)
    .filter(Boolean)
    .join(', ');
}

async function getAccountantLogins() {
  const { User } = mainDb;
  if (!User) return [];
  const rows = await User.find({
    dismissed: { $ne: true },
    role: { $in: ['accountant', 'buhgalteria', 'admin', 'administrator'] },
  })
    .select('login')
    .lean();
  return [...new Set(rows.map((r) => String(r.login || '').trim()).filter(Boolean))];
}

async function notifyAccountantsRelay({ taskId, requestNumber, fromLogin, fromName, messageText }) {
  const { createManagerNotificationDeduped } = mainDb;
  if (!createManagerNotificationDeduped) return;
  const logins = await getAccountantLogins();
  const title = `Пояснення щодо рахунку (${requestNumber || taskId})`;
  const body =
    `${fromName || fromLogin} пояснює, чому не може виставити рахунок по заявці ${requestNumber || taskId}:\n\n` +
    `${messageText}\n\n` +
    `Відповідь можна надіслати через асистента DTS (вкладка «Бух на затвердженні»).`;

  for (const login of logins) {
    await createManagerNotificationDeduped({
      recipientLogin: login,
      kind: 'assistant_accountant_relay',
      taskId: taskId || undefined,
      requestNumber: requestNumber || '',
      title,
      body,
      dedupeKey: `relay_acct:${taskId}:${fromLogin}:${Date.now()}:${login}`,
      read: false,
    });
  }
}

async function notifyUserRelayReply({ taskId, requestNumber, toLogin, fromName, messageText }) {
  const { createManagerNotificationDeduped } = mainDb;
  if (!createManagerNotificationDeduped || !toLogin) return;
  await createManagerNotificationDeduped({
    recipientLogin: toLogin,
    kind: 'assistant_accountant_relay_reply',
    taskId: taskId || undefined,
    requestNumber: requestNumber || '',
    title: `Відповідь бухгалтерії (${requestNumber || taskId})`,
    body: `${fromName || 'Бухгалтерія'} відповідає по заявці ${requestNumber || taskId}:\n\n${messageText}`,
    dedupeKey: `relay_reply:${taskId}:${toLogin}:${Date.now()}`,
    read: false,
  });
}

/**
 * @param {string} login
 * @param {string} role
 * @param {() => import('mongoose').Connection | null} getAssistantConnection
 */
async function getPendingRelayInbox(login, role, getAssistantConnection) {
  const Relay = getRelayModel(getAssistantConnection);
  if (!Relay) return [];
  const r = String(role || '').toLowerCase();
  const isAcct = ['accountant', 'buhgalteria', 'admin', 'administrator'].includes(r);

  if (isAcct) {
    const rows = await Relay.find({
      direction: 'to_accountant',
      status: 'sent',
      recipientLogin: { $in: ['', login] },
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
    return rows.filter((row) => !row.recipientLogin || row.recipientLogin === login);
  }

  return Relay.find({
    initiatorLogin: login,
    status: { $in: ['awaiting_confirm', 'awaiting_reply_confirm'] },
  })
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();
}

/**
 * Обробка черги Так/Ні та нових пояснень. Якщо handled — LLM не потрібен.
 */
async function processRelayUserTurn({
  login,
  role,
  userName,
  conversationId,
  messageText,
  getAssistantConnection,
  cashlessTasks,
  relayTaskContext,
}) {
  const Relay = getRelayModel(getAssistantConnection);
  if (!Relay || !login || !conversationId) return { handled: false };

  const msg = String(messageText || '').trim();
  if (!msg) return { handled: false };

  const convOid = new mongoose.Types.ObjectId(String(conversationId));
  const rLower = String(role || '').toLowerCase();
  const isAcct = ['accountant', 'buhgalteria', 'admin', 'administrator'].includes(rLower);

  /** Підтвердження ініціатора (регіон → бухгалтер) */
  const awaiting = await Relay.findOne({
    conversationId: convOid,
    initiatorLogin: login,
    status: 'awaiting_confirm',
    direction: 'to_accountant',
  }).sort({ updatedAt: -1 });

  if (awaiting) {
    if (isAffirmative(msg)) {
      awaiting.status = 'sent';
      awaiting.updatedAt = new Date();
      await awaiting.save();
      await notifyAccountantsRelay({
        taskId: awaiting.taskId,
        requestNumber: awaiting.requestNumber,
        fromLogin: login,
        fromName: userName,
        messageText: awaiting.messageText,
      });
      return {
        handled: true,
        reply:
          'Дякую. Ваше пояснення надіслано бухгалтерії (користувачі з доступом до «Бух на затвердженні»). ' +
          'Коли бухгалтер відповість — ви отримаєте сповіщення та зможете підтвердити пересилання відповіді через цей чат.',
        relayMeta: {
          completed: true,
          taskId: awaiting.taskId,
          requestNumber: awaiting.requestNumber,
        },
      };
    }
    if (isNegative(msg)) {
      awaiting.status = 'cancelled';
      awaiting.updatedAt = new Date();
      await awaiting.save();
      return { handled: true, reply: 'Добре, повідомлення бухгалтерії не надсилатиму.', relayMeta: { completed: true, cancelled: true } };
    }
    return {
      handled: true,
      reply: 'Очікую підтвердження: напишіть **Так**, якщо можна перенаправити пояснення бухгалтеру, або **Ні**, якщо не потрібно.',
    };
  }

  /** Підтвердження відповіді бухгалтера → користувач */
  const awaitingReply = await Relay.findOne({
    conversationId: convOid,
    initiatorLogin: login,
    status: 'awaiting_reply_confirm',
    direction: 'to_user',
  }).sort({ updatedAt: -1 });

  if (awaitingReply) {
    if (isAffirmative(msg)) {
      awaitingReply.status = 'sent';
      awaitingReply.updatedAt = new Date();
      await awaitingReply.save();
      await notifyUserRelayReply({
        taskId: awaitingReply.taskId,
        requestNumber: awaitingReply.requestNumber,
        toLogin: awaitingReply.recipientLogin,
        fromName: userName,
        messageText: awaitingReply.messageText,
      });
      return {
        handled: true,
        reply: `Відповідь передано користувачу ${awaitingReply.recipientLogin || '—'}.`,
      };
    }
    if (isNegative(msg)) {
      awaitingReply.status = 'cancelled';
      await awaitingReply.save();
      return { handled: true, reply: 'Відповідь користувачу не надсилатиму.' };
    }
    return {
      handled: true,
      reply: 'Напишіть **Так**, щоб надіслати відповідь користувачу, або **Ні** — скасувати.',
    };
  }

  /** Бухгалтер відповідає на надіслане пояснення */
  if (isAcct && looksLikeExplanation(msg)) {
    const parent = await Relay.findOne({
      direction: 'to_accountant',
      status: 'sent',
      $or: [{ recipientLogin: login }, { recipientLogin: '' }],
    }).sort({ updatedAt: -1 });

    const taskId = parent?.taskId || '';
    const requestNumber = parent?.requestNumber || '';
    const toLogin = parent?.initiatorLogin || '';

    if (!toLogin) {
      return {
        handled: true,
        reply:
          'Не знайдено заявку-контекст для відповіді. Уточніть номер заявки (наприклад KV-0000456) або відкрийте сповіщення з поясненням.',
      };
    }

    const draft = await Relay.create({
      conversationId: convOid,
      initiatorLogin: login,
      recipientLogin: toLogin,
      taskId,
      requestNumber,
      messageText: msg,
      direction: 'to_user',
      status: 'awaiting_reply_confirm',
      parentRelayId: parent?._id || null,
    });

    return {
      handled: true,
      reply:
        `Зрозумів вашу відповідь щодо заявки ${requestNumber || taskId}.\n\n` +
        `Чи можу передати це користувачу **${toLogin}**?\n` +
        `Напишіть **Так**, якщо згодні, або **Ні**, якщо не потрібно.`,
      relayMeta: { relayId: String(draft._id), awaitingConfirm: true },
    };
  }

  /** Регіональний / сервіс: нове пояснення чому не можна виставити рахунок */
  const isRegionalSide = ['regional', 'regkerivn', 'service', 'admin', 'administrator'].includes(rLower);
  if (isRegionalSide && looksLikeExplanation(msg)) {
    const resolved = resolveRelayTaskForExplanation({
      messageText: msg,
      cashlessTasks: cashlessTasks || [],
      relayTaskContext: relayTaskContext || null,
    });

    if (resolved.needSelection) {
      return {
        handled: true,
        reply:
          `У списку **${(resolved.tasks || []).length}** заявок без рахунку. Оберіть одну:\n` +
          `• натисніть **«Пояснити»** біля потрібного номера в жовтому блоці над чатом, або\n` +
          `• вкажіть номер у повідомленні (наприклад ${formatTaskListUk(resolved.tasks)}).\n\n` +
          `Після цього повторіть пояснення — воно буде прив’язане до обраної заявки.`,
        relayMeta: { needTaskSelection: true },
      };
    }

    if (resolved.ambiguous?.length) {
      return {
        handled: true,
        reply:
          `У тексті згадано кілька номерів зі списку: **${formatTaskListUk(resolved.ambiguous)}**. ` +
          `Уточніть **одну** заявку (кнопка «Пояснити» або один номер у повідомленні) і надішліть пояснення ще раз.`,
        relayMeta: { needTaskSelection: true, ambiguous: resolved.ambiguous.map((t) => t.requestNumber) },
      };
    }

    const task = resolved.task;
    if (!task?.taskId && (cashlessTasks || []).length > 0) {
      return {
        handled: true,
        reply:
          `Не вдалося визначити заявку для пояснення. Оберіть **«Пояснити»** біля номера в списку або додайте номер (наприклад ${formatTaskListUk(cashlessTasks)}) у текст.`,
        relayMeta: { needTaskSelection: true },
      };
    }

    const draft = await Relay.create({
      conversationId: convOid,
      initiatorLogin: login,
      recipientLogin: '',
      taskId: String(task?.taskId || ''),
      requestNumber: String(task?.requestNumber || ''),
      messageText: msg,
      direction: 'to_accountant',
      status: 'awaiting_confirm',
    });

    const rn = task?.requestNumber ? ` **${task.requestNumber}**` : task?.taskId ? ` (id ${task.taskId})` : '';
    return {
      handled: true,
      reply:
        `Зафіксував ваше пояснення щодо заявки${rn}.\n\n` +
        `Чи можу перенаправити цю відповідь бухгалтеру (вкладка «Бух на затвердженні»)?\n` +
        `Напишіть **Так**, якщо згодні, або **Ні**, якщо не потрібно.`,
      relayMeta: {
        relayId: String(draft._id),
        awaitingConfirm: true,
        taskId: task?.taskId,
        requestNumber: task?.requestNumber,
      },
    };
  }

  return { handled: false };
}

module.exports = {
  initAssistantAccountantRelay,
  processRelayUserTurn,
  getPendingRelayInbox,
  getRelayModel,
  resolveRelayTaskForExplanation,
};
