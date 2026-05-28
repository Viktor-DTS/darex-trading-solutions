/**
 * Маршрути GPT-чату асистента: окрема MongoDB (getAssistantConnection).
 */
const mongoose = require('mongoose');
const { assistantChatCompletion } = require('./assistantChatLlm');
const { isCasualOffTopicUserMessage } = require('./assistantChatSanitize');
const { appendAssistantScopeHintToUserPayload } = require('./assistantChatScopeHints');
const { buildTaskContextForLlm, ASSISTANT_PRIOR_SCAN } = require('./assistantTaskLookup');
const { buildDiscoveryContextForLlm } = require('./assistantDiscoveryLookup');
const { loadUserLeanForAssistant, formatAssistantSessionBlock } = require('./assistantUiContext');
const { getAssistantDisclosureLlmBlockUk, getAssistantDisclosureForClient } = require('./assistantChatDisclosure');
const {
  isAssistantAdminRole,
  mapMessageForClient,
  submitAssistantMessageFeedback,
  buildAssistantFeedbackReport,
} = require('./assistantChatFeedback');
const { createPrivacyMaskSession, privacyNoteForLlmUk } = require('./assistantChatPrivacy');
const { buildLearnedContextForLlm, recordPositiveKnowledge, getKnowledgeStats } = require('./assistantChatLearning');
const {
  processTopicTurn,
  filterPriorByBoundary,
  buildCrossDialogContextForLlm,
  getTopicMemoryModel,
} = require('./assistantChatTopicContext');
const { processRelayUserTurn, getPendingRelayInbox } = require('./assistantAccountantRelay');
const {
  getAssistantUnreadNotificationCount,
  markAssistantNotificationsSeen,
} = require('./assistantNotifications');

const MAX_USER_MESSAGE = 4000;
const MAX_LLM_USER_COMBINED = 22000;
const MAX_MESSAGES_CONTEXT = 24;
const MESSAGE_MAX_LENGTH = 12000;

let AssistantConversation = null;
let AssistantMessage = null;

function getModels(getAssistantConnection) {
  const conn = getAssistantConnection();
  if (!conn || conn.readyState !== 1) {
    return { conn: null, AssistantConversation: null, AssistantMessage: null };
  }

  if (!AssistantConversation) {
    const convSchema = new mongoose.Schema(
      {
        userLogin: { type: String, required: true },
        title: { type: String, default: 'Діалог' },
        lastPanelId: { type: String, default: '' },
        topicAwaitingClarification: { type: Boolean, default: false },
        topicPendingMessage: { type: String, default: '', maxlength: 4000 },
        topicPriorSummary: { type: String, default: '', maxlength: 600 },
        topicBoundaryAfterMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
        topicClarifyAssistantMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
      { timestamps: true },
    );
    convSchema.index({ userLogin: 1, updatedAt: -1 });

    const msgSchema = new mongoose.Schema(
      {
        conversationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AssistantConversation',
          required: true,
        },
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true, maxlength: MESSAGE_MAX_LENGTH },
        feedback: {
          helpful: { type: Boolean },
          comment: { type: String, maxlength: 500, default: '' },
          ratedAt: { type: Date },
          userLogin: { type: String, default: '' },
        },
      },
      { timestamps: true },
    );
    msgSchema.index({ conversationId: 1, createdAt: 1 });
    msgSchema.index({ role: 1, 'feedback.ratedAt': -1 });

    AssistantConversation =
      conn.models.AssistantConversation || conn.model('AssistantConversation', convSchema);
    AssistantMessage =
      conn.models.AssistantMessage || conn.model('AssistantMessage', msgSchema);
  }

  return { conn, AssistantConversation, AssistantMessage };
}

function truncate(s, max) {
  const t = String(s || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function validObjectId(id) {
  return Boolean(id && mongoose.Types.ObjectId.isValid(id) && String(id).length === 24);
}

/**
 * @param {import('express').Application} app
 * @param {{ getAssistantConnection: () => import('mongoose').Connection | null, getCashlessPendingAlertsForUser?: (login: string, dbUser: object | null) => Promise<{ tasks: object[], summaryUk: string }> }} opts
 */
function registerAssistantChatRoutes(app, { getAssistantConnection, getCashlessPendingAlertsForUser, ManagerUserNotification }) {
  app.get('/api/assistant/info', async (req, res) => {
    const login = req.user?.login;
    if (!login) return res.status(401).json({ error: 'Користувач не визначений' });
    res.json(getAssistantDisclosureForClient());
  });

  app.get('/api/assistant/alerts/cashless-pending', async (req, res) => {
    const login = req.user?.login;
    if (!login) return res.status(401).json({ error: 'Користувач не визначений' });
    if (typeof getCashlessPendingAlertsForUser !== 'function') {
      return res.json({ tasks: [], summaryUk: '' });
    }
    try {
      const dbUser = await loadUserLeanForAssistant(login);
      const data = await getCashlessPendingAlertsForUser(login, dbUser);
      res.json(data);
    } catch (e) {
      console.error('[assistant-alerts] cashless-pending', e?.message || e);
      res.status(500).json({ error: 'Не вдалося завантажити нагадування' });
    }
  });

  app.get('/api/assistant/notifications/unread-count', async (req, res) => {
    const login = req.user?.login;
    if (!login) return res.status(401).json({ error: 'Користувач не визначений' });
    try {
      const count = await getAssistantUnreadNotificationCount(ManagerUserNotification, login);
      res.json({ count });
    } catch (e) {
      console.error('[assistant-notifications] unread-count', e?.message || e);
      res.status(500).json({ error: 'Не вдалося завантажити лічильник сповіщень' });
    }
  });

  app.post('/api/assistant/notifications/mark-seen', async (req, res) => {
    const login = req.user?.login;
    if (!login) return res.status(401).json({ error: 'Користувач не визначений' });
    try {
      const result = await markAssistantNotificationsSeen(ManagerUserNotification, login);
      const count = await getAssistantUnreadNotificationCount(ManagerUserNotification, login);
      res.json({ ...result, count });
    } catch (e) {
      console.error('[assistant-notifications] mark-seen', e?.message || e);
      res.status(500).json({ error: 'Не вдалося позначити сповіщення переглянутими' });
    }
  });

  app.get('/api/assistant/relay/pending', async (req, res) => {
    const login = req.user?.login;
    if (!login) return res.status(401).json({ error: 'Користувач не визначений' });
    const role = req.user?.role || '';
    try {
      const items = await getPendingRelayInbox(login, role, getAssistantConnection);
      res.json({
        items: (items || []).map((r) => ({
          id: String(r._id),
          taskId: r.taskId || '',
          requestNumber: r.requestNumber || '',
          messageText: r.messageText || '',
          direction: r.direction,
          status: r.status,
          recipientLogin: r.recipientLogin || '',
        })),
      });
    } catch (e) {
      console.error('[assistant-relay] pending', e?.message || e);
      res.status(500).json({ error: 'Не вдалося завантажити чергу' });
    }
  });

  app.post('/api/assistant/chat', async (req, res) => {
    const start = Date.now();
    const login = req.user?.login;
    if (!login) {
      return res.status(401).json({ error: 'Користувач не визначений' });
    }

    const models = getModels(getAssistantConnection);
    const { conn, AssistantConversation: Conv, AssistantMessage: Msg } = models;

    if (!conn) {
      return res.status(503).json({
        error: 'Асистентська база даних недоступна. Перевірте ASSISTANT_MONGODB_URI.',
      });
    }

    let rawConversationId = req.body?.conversationId;
    let conversationId = validObjectId(rawConversationId)
      ? new mongoose.Types.ObjectId(String(rawConversationId))
      : null;

    const userMsg = truncate(req.body?.message, MAX_USER_MESSAGE);
    if (!userMsg) {
      return res.status(400).json({ error: 'Введіть повідомлення' });
    }

    const bodyCtx =
      req.body?.context && typeof req.body.context === 'object' && !Array.isArray(req.body.context)
        ? req.body.context
        : {};
    const panelId = String(bodyCtx.panelId || '').trim().slice(0, 80);
    const pathHint = String(bodyCtx.path || '').trim().slice(0, 400);

    /** @type {Record<string, unknown> | null} */
    let dbUserLeanForAssistant = null;
    try {
      dbUserLeanForAssistant = await loadUserLeanForAssistant(login);
    } catch (e) {
      console.warn('[assistant-chat] loadUserLeanForAssistant:', e?.message || e);
    }

    const sessionBlock = formatAssistantSessionBlock({
      client: {
        panelId,
        panelLabel: String(bodyCtx.panelLabel || '').trim().slice(0, 240),
        panelHint: String(bodyCtx.panelHint || '').trim().slice(0, 1200),
        path: pathHint,
        userRole: String(bodyCtx.userRole || req.user?.role || '').trim().slice(0, 80),
        userName: String(bodyCtx.userName || '').trim().slice(0, 120),
        userRegion: String(bodyCtx.userRegion || '').trim().slice(0, 200),
      },
      serverUser: dbUserLeanForAssistant,
      login,
    });
    const disclosureBlock = getAssistantDisclosureLlmBlockUk();

    /** @type {import('mongoose').Document | null} */
    let lastUserDoc = null;

    if (conversationId) {
      const existing = await Conv.findOne({
        _id: conversationId,
        userLogin: login,
      }).lean();
      if (!existing) {
        return res.status(404).json({ error: 'Діалог не знайдено' });
      }
    } else {
      const conv = await Conv.create({
        userLogin: login,
        title: userMsg.length > 60 ? `${userMsg.slice(0, 57)}…` : userMsg,
        lastPanelId: panelId,
      });
      conversationId = conv._id;
    }

    if (panelId) {
      await Conv.updateOne({ _id: conversationId }, { $set: { lastPanelId: panelId } }).catch(() => {});
    }

    let convDoc = await Conv.findOne({ _id: conversationId, userLogin: login }).lean();

    /** @type {{ tasks?: object[], summaryUk?: string } | null} */
    let cashlessAlertPayload = null;
    if (typeof getCashlessPendingAlertsForUser === 'function') {
      try {
        cashlessAlertPayload = await getCashlessPendingAlertsForUser(login, dbUserLeanForAssistant);
      } catch (e) {
        console.warn('[assistant-chat] cashless alerts:', e?.message || e);
      }
    }
    const cashlessTasksList = Array.isArray(cashlessAlertPayload?.tasks) ? cashlessAlertPayload.tasks : [];
    const relayTaskContextRaw =
      req.body?.relayTaskContext && typeof req.body.relayTaskContext === 'object'
        ? req.body.relayTaskContext
        : null;
    const relayTaskContext = relayTaskContextRaw
      ? {
          taskId: String(relayTaskContextRaw.taskId || '').trim(),
          requestNumber: String(relayTaskContextRaw.requestNumber || '').trim(),
        }
      : null;

    try {
      const relayOut = await processRelayUserTurn({
        login,
        role: String(req.user?.role || dbUserLeanForAssistant?.role || ''),
        userName: String(bodyCtx.userName || dbUserLeanForAssistant?.name || login),
        conversationId: String(conversationId),
        messageText: userMsg,
        getAssistantConnection,
        cashlessTasks: cashlessTasksList,
        relayTaskContext,
      });
      if (relayOut.handled) {
        await Msg.create({ conversationId, role: 'user', content: userMsg });
        const assistantRelayDoc = await Msg.create({
          conversationId,
          role: 'assistant',
          content: truncate(relayOut.reply, MESSAGE_MAX_LENGTH),
        });
        await Conv.updateOne({ _id: conversationId }, { $set: { updatedAt: new Date() } }).catch(() => {});

        return res.json({
          conversationId: String(conversationId),
          reply: relayOut.reply,
          assistantMessageId: String(assistantRelayDoc._id),
          relayMeta: relayOut.relayMeta,
          cashlessAlert:
            cashlessAlertPayload?.tasks?.length > 0
              ? {
                  tasks: cashlessAlertPayload.tasks,
                  summaryUk: cashlessAlertPayload.summaryUk,
                  openActions: cashlessAlertPayload.tasks.map((t) => ({
                    taskId: t.taskId,
                    requestNumber: t.requestNumber,
                  })),
                }
              : undefined,
        });
      }
    } catch (e) {
      console.error('[assistant-chat] relay:', e?.message || e);
    }

    const priorRaw = await Msg.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(MAX_MESSAGES_CONTEXT)
      .lean();

    let prior = [...priorRaw].reverse();

    let effectiveUserMsg = userMsg;
    try {
      const topicResult = await processTopicTurn({
        getAssistantConnection,
        Conv,
        convDoc,
        userMsg,
        priorMessages: prior,
        login,
        conversationId,
      });

      if (topicResult.shortCircuit && topicResult.reply) {
        await Msg.create({ conversationId, role: 'user', content: userMsg });
        const assistantTopicDoc = await Msg.create({
          conversationId,
          role: 'assistant',
          content: truncate(topicResult.reply, MESSAGE_MAX_LENGTH),
        });
        const convUpdate = {
          updatedAt: new Date(),
          topicAwaitingClarification: true,
          topicClarifyAssistantMessageId: assistantTopicDoc._id,
        };
        if (topicResult.setAwaiting) {
          Object.assign(convUpdate, topicResult.setAwaiting);
        }
        await Conv.updateOne({ _id: conversationId }, { $set: convUpdate }).catch(() => {});

        return res.json({
          conversationId: String(conversationId),
          reply: topicResult.reply,
          assistantMessageId: String(assistantTopicDoc._id),
          topicMeta: topicResult.topicMeta,
          ratingPrompt: getAssistantDisclosureForClient().ratingPrompt,
        });
      }

      effectiveUserMsg = topicResult.effectiveUserMsg || userMsg;
      if (topicResult.topicBoundaryAfterMessageId) {
        prior = filterPriorByBoundary(prior, topicResult.topicBoundaryAfterMessageId);
      }
    } catch (e) {
      console.warn('[assistant-chat] topic:', e?.message || e);
    }

    const histForApi = [];
    for (const m of prior) {
      histForApi.push({
        role: m.role,
        content: truncate(m.content, MESSAGE_MAX_LENGTH),
      });
    }

    let contentForChat = `${effectiveUserMsg}\n\n${sessionBlock}\n\n${disclosureBlock}`;

    const priorUserForNumberScan = prior
      .filter((m) => m.role === 'user')
      .map((m) => truncate(m.content, ASSISTANT_PRIOR_SCAN.maxChars))
      .slice(-ASSISTANT_PRIOR_SCAN.maxMessages);

    const priorAssistantForNumberScan = prior
      .filter((m) => m.role === 'assistant')
      .map((m) => truncate(m.content, ASSISTANT_PRIOR_SCAN.maxChars))
      .slice(-ASSISTANT_PRIOR_SCAN.maxAssistantMessages);

    /** @type {{ matched: number, requestNumbers: string[], elevated?: boolean, taskModal?: unknown } | undefined} */
    let taskContextPayload = undefined;
    /** @type {Record<string, unknown> | undefined} */
    let discoveryMeta = undefined;
    try {
      const tack = await buildTaskContextForLlm(req.user, effectiveUserMsg, {
        priorUserMessages: priorUserForNumberScan,
        priorAssistantMessages: priorAssistantForNumberScan,
        dbUserLean: dbUserLeanForAssistant,
      });
      if (tack.textForLlm) {
        contentForChat = `${contentForChat}\n\n${tack.textForLlm}`;
      }
      if (tack.meta?.requestNumbers?.length) {
        taskContextPayload = {
          matched: tack.meta.matched,
          requestNumbers: tack.meta.requestNumbers,
          elevated: Boolean(tack.meta.elevated),
          taskModal: tack.meta.taskModal ?? null,
        };
      } else if (tack.meta?.taskModal) {
        taskContextPayload = {
          matched: tack.meta.matched ?? 0,
          requestNumbers: Array.isArray(tack.meta.requestNumbers) ? tack.meta.requestNumbers : [],
          elevated: Boolean(tack.meta.elevated),
          taskModal: tack.meta.taskModal,
        };
      }
    } catch (e) {
      console.error('[assistant-chat] task context:', e?.message || e);
    }

    try {
      const disc = await buildDiscoveryContextForLlm(req.user, effectiveUserMsg, {
        priorUserMessages: priorUserForNumberScan,
        priorAssistantMessages: priorAssistantForNumberScan,
        dbUserLean: dbUserLeanForAssistant,
      });
      if (disc.textForLlm) {
        contentForChat = `${contentForChat}\n\n${disc.textForLlm}`;
      }
      const dmeta = disc.meta?.discovery;
      if (dmeta && typeof dmeta === 'object') {
        const oa = dmeta.openActions;
        const attach =
          (Array.isArray(oa) && oa.length > 1) ||
          (Number(dmeta.tasks) || 0) > 0 ||
          (Number(dmeta.clients) || 0) > 0;
        if (attach) discoveryMeta = dmeta;
      }
    } catch (e) {
      console.error('[assistant-chat] discovery context:', e?.message || e);
    }

    /** @type {Record<string, unknown> | undefined} */
    const combinedTaskContext = (() => {
      const base = taskContextPayload ? { ...taskContextPayload } : {};
      if (discoveryMeta) Object.assign(base, { discovery: discoveryMeta });
      return Object.keys(base).length ? base : undefined;
    })();

    const discoveryOpenActionsLen = Array.isArray(discoveryMeta?.openActions)
      ? discoveryMeta.openActions.length
      : 0;
    contentForChat = appendAssistantScopeHintToUserPayload(
      effectiveUserMsg,
      contentForChat,
      discoveryOpenActionsLen,
    );

    const privacySession = createPrivacyMaskSession();

    try {
      const crossDialogBlock = await buildCrossDialogContextForLlm({
        Msg,
        Conv,
        login,
        currentConversationId: conversationId,
        userMessage: effectiveUserMsg,
        maskSession: privacySession,
      });
      if (crossDialogBlock) {
        contentForChat = `${contentForChat}\n\n${crossDialogBlock}`;
      }
    } catch (e) {
      console.warn('[assistant-chat] cross-dialog:', e?.message || e);
    }

    try {
      const learnedBlock = await buildLearnedContextForLlm(
        getAssistantConnection,
        effectiveUserMsg,
        panelId,
        privacySession,
      );
      if (learnedBlock) {
        contentForChat = `${contentForChat}\n\n${learnedBlock}`;
      }
    } catch (e) {
      console.warn('[assistant-chat] learned context:', e?.message || e);
    }

    contentForChat = `${contentForChat}\n\n${privacyNoteForLlmUk()}`;

    const histForLlm = histForApi.map((m) => ({
      role: m.role,
      content: privacySession.mask(truncate(m.content, MESSAGE_MAX_LENGTH)),
    }));

    const contentForLlm = privacySession.mask(truncate(contentForChat, MAX_LLM_USER_COMBINED));

    lastUserDoc = await Msg.create({
      conversationId,
      role: 'user',
      content: userMsg,
    });

    try {
      const casualOffTopic = isCasualOffTopicUserMessage(userMsg);
      const out = await assistantChatCompletion(
        [
          ...histForLlm,
          {
            role: 'user',
            content: contentForLlm,
          },
        ],
        { casual: casualOffTopic },
      );

      const assistantContentRaw = truncate(out.content, MESSAGE_MAX_LENGTH);
      const assistantContent = truncate(privacySession.unmask(assistantContentRaw), MESSAGE_MAX_LENGTH);

      const assistantDoc = await Msg.create({
        conversationId,
        role: 'assistant',
        content: assistantContent,
      });

      await Conv.updateOne({ _id: conversationId }, { $set: { updatedAt: new Date() } }).catch(() => {});

      console.log(`✅ [PERF] POST /api/assistant/chat - ${Date.now() - start}ms (${login})`);

      const cashlessForClient =
        cashlessAlertPayload?.tasks?.length > 0
          ? {
              tasks: cashlessAlertPayload.tasks,
              summaryUk: cashlessAlertPayload.summaryUk,
              openActions: cashlessAlertPayload.tasks.map((t) => ({
                taskId: t.taskId,
                requestNumber: t.requestNumber,
              })),
            }
          : undefined;

      const taskContextOut = combinedTaskContext ? { ...combinedTaskContext } : {};
      if (cashlessForClient) {
        taskContextOut.cashlessPending = cashlessForClient;
      }

      res.json({
        conversationId: String(conversationId),
        reply: assistantContent,
        assistantMessageId: String(assistantDoc._id),
        model: out.model || undefined,
        taskContext: Object.keys(taskContextOut).length ? taskContextOut : undefined,
        cashlessAlert: cashlessForClient,
        ratingPrompt: getAssistantDisclosureForClient().ratingPrompt,
      });
    } catch (e) {
      console.error('[assistant-chat] LLM:', e.code || '', e.message);
      if (lastUserDoc?._id) {
        await Msg.deleteOne({ _id: lastUserDoc._id }).catch(() => {});
      }

      if (e.code === 'NO_LLM_KEY') {
        return res.status(503).json({
          error:
            'Мовна модель не налаштована на сервері. Додайте OPENAI_API_KEY або ключ асистента LLM.',
        });
      }

      return res.status(502).json({
        error:
          'Не вдалося отримати відповідь асистента. Спробуйте пізніше або перевірте доступ до LLM.',
      });
    }
  });

  app.get('/api/assistant/conversations', async (req, res) => {
    const login = req.user?.login;
    if (!login) {
      return res.status(401).json({ error: 'Користувач не визначений' });
    }

    const models = getModels(getAssistantConnection);
    if (!models.conn) {
      return res.status(503).json({ error: 'Асистентська база даних недоступна.' });
    }

    const rows = await models.AssistantConversation.find({ userLogin: login })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('_id title lastPanelId updatedAt createdAt')
      .lean();

    res.json({
      conversations: rows.map((r) => ({
        id: String(r._id),
        title: r.title,
        lastPanelId: r.lastPanelId || '',
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
      })),
    });
  });

  /**
   * Масове видалення давніх діалогів (повідомлення + документ розмови) — лише поточний користувач.
   * Query/body: days — мінімальна «давність» за полем updatedAt (1…730).
   */
  app.delete('/api/assistant/conversations/purge-old', async (req, res) => {
    const login = req.user?.login;
    if (!login) {
      return res.status(401).json({ error: 'Користувач не визначений' });
    }

    const raw =
      req.query?.days ??
      req.query?.olderThanDays ??
      (req.body && typeof req.body === 'object' ? req.body.days : undefined);
    const days = parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(days) || days < 1 || days > 730) {
      return res.status(400).json({
        error: 'Параметр days має бути цілим числом від 1 до 730 (неактивність за останнім оновленням діалогу).',
      });
    }

    const models = getModels(getAssistantConnection);
    if (!models.conn) {
      return res.status(503).json({ error: 'Асистентська база даних недоступна.' });
    }

    const cutoff = new Date(Date.now() - days * 86400000);
    const oldRows = await models.AssistantConversation.find({
      userLogin: login,
      updatedAt: { $lt: cutoff },
    })
      .select('_id')
      .lean();

    const ids = oldRows.map((r) => r._id).filter(Boolean);
    if (!ids.length) {
      return res.json({ deletedConversations: 0, deletedMessages: 0 });
    }

    const msgDel = await models.AssistantMessage.deleteMany({
      conversationId: { $in: ids },
    });
    const convDel = await models.AssistantConversation.deleteMany({
      _id: { $in: ids },
      userLogin: login,
    });

    res.json({
      deletedConversations: convDel.deletedCount ?? 0,
      deletedMessages: msgDel.deletedCount ?? 0,
    });
  });

  app.get('/api/assistant/conversations/:id/messages', async (req, res) => {
    const login = req.user?.login;
    if (!login) return res.status(401).json({ error: 'Користувач не визначений' });

    const idStr = req.params.id;
    if (!validObjectId(idStr)) {
      return res.status(400).json({ error: 'Невірний ідентифікатор діалогу' });
    }

    const models = getModels(getAssistantConnection);
    if (!models.conn) {
      return res.status(503).json({ error: 'Асистентська база даних недоступна.' });
    }

    const conv = await models.AssistantConversation.findOne({
      _id: idStr,
      userLogin: login,
    }).lean();

    if (!conv) {
      return res.status(404).json({ error: 'Діалог не знайдено' });
    }

    const msgs = await models.AssistantMessage.find({ conversationId: idStr })
      .sort({ createdAt: 1 })
      .limit(200)
      .select('role content createdAt feedback')
      .lean();

    res.json({
      conversationId: idStr,
      messages: msgs.map(mapMessageForClient),
    });
  });

  app.post('/api/assistant/messages/:id/feedback', async (req, res) => {
    const login = req.user?.login;
    if (!login) return res.status(401).json({ error: 'Користувач не визначений' });

    const idStr = req.params.id;
    const models = getModels(getAssistantConnection);
    if (!models.conn) {
      return res.status(503).json({ error: 'Асистентська база даних недоступна.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const result = await submitAssistantMessageFeedback(
        models.AssistantMessage,
        models.AssistantConversation,
        login,
        idStr,
        {
          helpful: body.helpful,
          comment: body.comment,
        },
      );

      if (body.helpful === true) {
        try {
          const msg = await models.AssistantMessage.findById(idStr).lean();
          if (msg?.conversationId) {
            const priorUser = await models.AssistantMessage.findOne({
              conversationId: msg.conversationId,
              role: 'user',
              createdAt: { $lt: msg.createdAt },
            })
              .sort({ createdAt: -1 })
              .select('content')
              .lean();
            const conv = await models.AssistantConversation.findById(msg.conversationId)
              .select('lastPanelId')
              .lean();
            const learnResult = await recordPositiveKnowledge(getAssistantConnection, {
              questionRaw: priorUser?.content || '',
              answerRaw: msg.content || '',
              panelId: conv?.lastPanelId || '',
              sourceMessageId: msg._id,
              sourceConversationId: msg.conversationId,
            });
            if (learnResult) result.knowledge = learnResult;
          }
        } catch (learnErr) {
          console.warn('[assistant-feedback] knowledge:', learnErr?.message || learnErr);
        }
      }

      res.json(result);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[assistant-feedback]', e?.message || e);
      res.status(status).json({ error: e.message || 'Не вдалося зберегти оцінку' });
    }
  });

  app.get('/api/assistant/feedback/report', async (req, res) => {
    const login = req.user?.login;
    const role = req.user?.role || '';
    if (!login) return res.status(401).json({ error: 'Користувач не визначений' });
    if (!isAssistantAdminRole(role)) {
      return res.status(403).json({ error: 'Звіт доступний лише адміністраторам' });
    }

    const models = getModels(getAssistantConnection);
    if (!models.conn) {
      return res.status(503).json({ error: 'Асистентська база даних недоступна.' });
    }

    const days = parseInt(String(req.query?.days ?? '7'), 10);
    const limit = parseInt(String(req.query?.limit ?? '40'), 10);

    try {
      const report = await buildAssistantFeedbackReport(
        models.AssistantMessage,
        models.AssistantConversation,
        { days, limit },
      );
      report.knowledge = await getKnowledgeStats(getAssistantConnection);
      const TopicMem = getTopicMemoryModel(getAssistantConnection);
      report.topicDecisions = TopicMem
        ? await TopicMem.countDocuments({
            createdAt: { $gte: new Date(Date.now() - days * 86400000) },
          })
        : 0;
      res.json(report);
    } catch (e) {
      console.error('[assistant-feedback-report]', e?.message || e);
      res.status(500).json({ error: 'Не вдалося сформувати звіт' });
    }
  });

  /** Видалити один діалог і всі його повідомлення в асистентській MongoDB. */
  app.delete('/api/assistant/conversations/:id', async (req, res) => {
    const login = req.user?.login;
    if (!login) {
      return res.status(401).json({ error: 'Користувач не визначений' });
    }

    const idStr = req.params.id;
    if (!validObjectId(idStr)) {
      return res.status(400).json({ error: 'Невірний ідентифікатор діалогу' });
    }

    const models = getModels(getAssistantConnection);
    if (!models.conn) {
      return res.status(503).json({ error: 'Асистентська база даних недоступна.' });
    }

    const owns = await models.AssistantConversation.findOne({
      _id: idStr,
      userLogin: login,
    })
      .select('_id')
      .lean();

    if (!owns) {
      return res.status(404).json({ error: 'Діалог не знайдено' });
    }

    await models.AssistantMessage.deleteMany({ conversationId: idStr });
    await models.AssistantConversation.deleteOne({
      _id: idStr,
      userLogin: login,
    });

    res.json({ ok: true });
  });
}

module.exports = { registerAssistantChatRoutes };
