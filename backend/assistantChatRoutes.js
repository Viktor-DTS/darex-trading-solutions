/**
 * Маршрути GPT-чату асистента: окрема MongoDB (getAssistantConnection).
 */
const mongoose = require('mongoose');
const { assistantChatCompletion } = require('./assistantChatLlm');
const { buildTaskContextForLlm, ASSISTANT_PRIOR_SCAN } = require('./assistantTaskLookup');
const { buildDiscoveryContextForLlm } = require('./assistantDiscoveryLookup');
const { loadUserLeanForAssistant, formatAssistantSessionBlock } = require('./assistantUiContext');

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
      },
      { timestamps: true },
    );
    msgSchema.index({ conversationId: 1, createdAt: 1 });

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
 * @param {{ getAssistantConnection: () => import('mongoose').Connection | null }} opts
 */
function registerAssistantChatRoutes(app, { getAssistantConnection }) {
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

    const priorRaw = await Msg.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(MAX_MESSAGES_CONTEXT)
      .lean();

    const prior = [...priorRaw].reverse();
    const histForApi = [];
    for (const m of prior) {
      histForApi.push({
        role: m.role,
        content: truncate(m.content, MESSAGE_MAX_LENGTH),
      });
    }

    let contentForChat = `${userMsg}\n\n${sessionBlock}`;

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
      const tack = await buildTaskContextForLlm(req.user, userMsg, {
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
      const disc = await buildDiscoveryContextForLlm(req.user, userMsg, {
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

    lastUserDoc = await Msg.create({
      conversationId,
      role: 'user',
      content: userMsg,
    });

    try {
      const out = await assistantChatCompletion([
        ...histForApi,
        {
          role: 'user',
          content: truncate(contentForChat, MAX_LLM_USER_COMBINED),
        },
      ]);

      const assistantContent = truncate(out.content, MESSAGE_MAX_LENGTH);

      await Msg.create({
        conversationId,
        role: 'assistant',
        content: assistantContent,
      });

      await Conv.updateOne({ _id: conversationId }, { $set: { updatedAt: new Date() } }).catch(() => {});

      console.log(`✅ [PERF] POST /api/assistant/chat - ${Date.now() - start}ms (${login})`);

      res.json({
        conversationId: String(conversationId),
        reply: assistantContent,
        model: out.model || undefined,
        taskContext: combinedTaskContext,
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
      .select('role content createdAt')
      .lean();

    res.json({
      conversationId: idStr,
      messages: msgs.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  });
}

module.exports = { registerAssistantChatRoutes };
