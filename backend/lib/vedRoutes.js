/**
 * API панелі «Відділ ВЕД» — заявки на імпорт обладнання.
 */
const mongoose = require('mongoose');
const {
  vedAiEnabled,
  vedAiDailyLimit,
  runVedSupplierResearch,
  candidateToProposalDraft,
  resolveSerpApiKey,
  resolveLlmApiKey,
} = require('./vedAiResearch');
const {
  bindResearchSessionModel,
  runRegistrySearch,
  getRegistryMeta,
  VedSupplierRegistry,
  scheduleVedSupplierRegistryJob,
} = require('./vedSupplierRegistry');
const {
  VED_EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPES,
  normalizeEquipmentType,
  defaultTechnicalRequirements,
} = require('./vedEquipmentTypes');

const VED_STATUSES = [
  'pending_review',
  'in_progress',
  'supplier_selection',
  'proposals_ready',
  'supplier_chosen',
  'rejected',
  'completed',
];

const VED_ACTIVE_STATUSES = [
  'pending_review',
  'in_progress',
  'supplier_selection',
  'proposals_ready',
  'supplier_chosen',
];

const VED_ARCHIVE_STATUSES = ['completed', 'rejected'];

const EQUIPMENT_TYPES_LIST = EQUIPMENT_TYPES;

const INCOTERMS_OPTIONS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

const vedProposalSchema = new mongoose.Schema(
  {
    supplierName: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    contact: { type: String, trim: true, default: '' },
    productModel: { type: String, trim: true, default: '' },
    price: { type: Number, default: null },
    currency: { type: String, trim: true, default: '' },
    incoterms: { type: String, trim: true, default: '' },
    moq: { type: String, trim: true, default: '' },
    leadTime: { type: String, trim: true, default: '' },
    prepaymentPercent: { type: Number, default: null },
    paymentTerms: { type: String, trim: true, default: '' },
    comment: { type: String, trim: true, default: '' },
    chosen: { type: Boolean, default: false },
    createdByLogin: String,
    createdByName: String,
  },
  { timestamps: true }
);

const vedImportRequestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, trim: true, unique: true, sparse: true },
    status: {
      type: String,
      enum: VED_STATUSES,
      default: 'pending_review',
      index: true,
    },
    sourceType: {
      type: String,
      enum: ['open_search', 'contract_supplier'],
      default: 'open_search',
    },
    equipmentType: {
      type: String,
      enum: EQUIPMENT_TYPES_LIST,
      default: 'other',
    },
    equipmentName: { type: String, trim: true, default: '' },
    technicalRequirements: { type: String, trim: true, default: '' },
    quantity: { type: Number, default: 1 },
    desiredDeliveryDate: { type: String, trim: true, default: '' },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    managerComment: { type: String, trim: true, default: '' },
    requesterLogin: { type: String, index: true },
    requesterName: String,
    vedLogin: String,
    vedName: String,
    vedComment: { type: String, trim: true, default: '' },
    vedTakenAt: Date,
    proposals: { type: [vedProposalSchema], default: [] },
    chosenProposalId: { type: mongoose.Schema.Types.ObjectId, default: null },
    finalDecisionSummary: { type: String, trim: true, default: '' },
    rejectedReason: { type: String, trim: true, default: '' },
    completedAt: Date,
  },
  { timestamps: true }
);

vedImportRequestSchema.index({ status: 1, createdAt: -1 });
vedImportRequestSchema.index({ requesterLogin: 1, createdAt: -1 });

const vedCounterSchema = new mongoose.Schema({
  _id: { type: String, default: 'ved' },
  seq: { type: Number, default: 0 },
});

const vedAiSourceSchema = new mongoose.Schema(
  {
    url: String,
    title: String,
    snippet: String,
  },
  { _id: false }
);

const vedAiCandidateSchema = new mongoose.Schema(
  {
    supplierName: { type: String, default: '' },
    country: { type: String, default: '' },
    website: { type: String, default: '' },
    contact: { type: String, default: '' },
    productModel: { type: String, default: '' },
    productSummary: { type: String, default: '' },
    priceEstimate: { type: Number, default: null },
    priceStatus: { type: String, enum: ['unverified', 'estimated', 'quoted'], default: 'unverified' },
    currency: { type: String, default: '' },
    incotermsHint: { type: String, default: '' },
    moqHint: { type: String, default: '' },
    leadTimeHint: { type: String, default: '' },
    prepaymentPercentHint: { type: Number, default: null },
    riskNotes: { type: [String], default: [] },
    strengths: { type: [String], default: [] },
    sourceUrls: { type: [String], default: [] },
    addedToProposalId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true }
);

const vedResearchSessionSchema = new mongoose.Schema(
  {
    vedImportRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'VedImportRequest', index: true },
    requestNumber: String,
    status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running', index: true },
    searchQueries: { type: [String], default: [] },
    extraSearchHint: { type: String, default: '' },
    webContextPreview: { type: String, default: '' },
    userPromptPreview: { type: String, default: '' },
    sources: { type: [vedAiSourceSchema], default: [] },
    summary: { type: String, default: '' },
    recommendations: { type: [String], default: [] },
    candidates: { type: [vedAiCandidateSchema], default: [] },
    llmModel: String,
    disclaimer: String,
    hasWebSearch: { type: Boolean, default: false },
    error: { type: String, default: '' },
    mode: { type: String, enum: ['request', 'standalone'], default: 'request', index: true },
    equipmentType: { type: String, default: '' },
    equipmentName: { type: String, default: '' },
    technicalRequirements: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    createdByLogin: { type: String, index: true },
    createdByName: String,
  },
  { timestamps: true }
);

vedResearchSessionSchema.index({ vedImportRequestId: 1, createdAt: -1 });
vedResearchSessionSchema.index({ createdByLogin: 1, createdAt: -1 });
vedResearchSessionSchema.index({ mode: 1, createdAt: -1 });

let VedImportRequest;
let VedCounter;
let VedResearchSession;
try {
  VedImportRequest = mongoose.model('VedImportRequest');
} catch {
  VedImportRequest = mongoose.model('VedImportRequest', vedImportRequestSchema);
}
try {
  VedCounter = mongoose.model('VedCounter');
} catch {
  VedCounter = mongoose.model('VedCounter', vedCounterSchema);
}
try {
  VedResearchSession = mongoose.model('VedResearchSession');
} catch {
  VedResearchSession = mongoose.model('VedResearchSession', vedResearchSessionSchema);
}

bindResearchSessionModel(VedResearchSession);

async function getNextVedRequestNumber() {
  const doc = await VedCounter.findOneAndUpdate(
    { _id: 'ved' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const n = doc && typeof doc.seq === 'number' ? doc.seq : 1;
  return `VV-${String(n).padStart(5, '0')}`;
}

function normalizeRole(role) {
  return String(role || '').toLowerCase();
}

function isVedStaffRole(role) {
  return ['admin', 'administrator', 'ved', 'vidved'].includes(normalizeRole(role));
}

function isVedManagerRole(role) {
  const r = normalizeRole(role);
  return ['manager', 'mgradm'].includes(r) || isVedStaffRole(r);
}

function canCreateVedRequest(user) {
  return isVedManagerRole(user?.role);
}

function canManageVedRequests(user) {
  return isVedStaffRole(user?.role);
}

function userCanReadVedRequest(user, doc) {
  if (!doc) return false;
  if (canManageVedRequests(user)) return true;
  const login = String(user?.login || '').trim();
  return login && String(doc.requesterLogin || '').trim() === login;
}

function proposalHasContactOrWebsite(p) {
  return Boolean(String(p?.website || '').trim() || String(p?.contact || '').trim());
}

function validateProposalFields(p) {
  const errors = [];
  if (!String(p?.supplierName || '').trim()) errors.push('назва постачальника');
  if (!String(p?.country || '').trim()) errors.push('країна');
  if (!proposalHasContactOrWebsite(p)) errors.push('сайт або контакт');
  if (!String(p?.productModel || '').trim()) errors.push('номенклатура / модель');
  if (p?.price == null || !Number.isFinite(Number(p.price)) || Number(p.price) < 0) {
    errors.push('ціна');
  }
  if (!String(p?.currency || '').trim()) errors.push('валюта');
  if (!String(p?.incoterms || '').trim()) errors.push('Incoterms');
  if (!String(p?.moq || '').trim()) errors.push('MOQ');
  if (!String(p?.leadTime || '').trim()) errors.push('lead time');
  const prep = p?.prepaymentPercent;
  if (prep == null || !Number.isFinite(Number(prep)) || Number(prep) < 0 || Number(prep) > 100) {
    errors.push('% передоплати');
  }
  return errors;
}

function isProposalValid(p) {
  return validateProposalFields(p).length === 0;
}

function countValidProposals(doc) {
  return (doc?.proposals || []).filter(isProposalValid).length;
}

function stripProposalsForManager(doc) {
  if (!doc) return doc;
  const out = { ...doc };
  delete out.proposals;
  delete out.chosenProposalId;
  return out;
}

function sanitizeDocForUser(user, doc) {
  if (!doc) return doc;
  const lean = doc.toObject ? doc.toObject() : { ...doc };
  if (canManageVedRequests(user)) {
    lean.proposals = (lean.proposals || []).map((p) => ({
      ...p,
      isValid: isProposalValid(p),
      validationErrors: validateProposalFields(p),
    }));
    lean.validProposalCount = countValidProposals(lean);
    return lean;
  }
  return stripProposalsForManager(lean);
}

function vedListQueryForUser(user) {
  if (canManageVedRequests(user)) return {};
  const login = String(user?.login || '').trim();
  return { requesterLogin: login };
}

function buildFinalDecisionSummary(proposal) {
  if (!proposal) return '';
  const parts = [
    proposal.supplierName,
    proposal.productModel,
    proposal.price != null ? `${proposal.price} ${proposal.currency || ''}`.trim() : '',
    proposal.incoterms ? `Incoterms: ${proposal.incoterms}` : '',
    proposal.leadTime ? `Lead time: ${proposal.leadTime}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function applyProposalPayload(target, body) {
  if (body.supplierName !== undefined) target.supplierName = String(body.supplierName || '').trim();
  if (body.country !== undefined) target.country = String(body.country || '').trim();
  if (body.website !== undefined) target.website = String(body.website || '').trim();
  if (body.contact !== undefined) target.contact = String(body.contact || '').trim();
  if (body.productModel !== undefined) target.productModel = String(body.productModel || '').trim();
  if (body.price !== undefined) {
    const n = Number(body.price);
    target.price = Number.isFinite(n) ? n : null;
  }
  if (body.currency !== undefined) target.currency = String(body.currency || '').trim().toUpperCase();
  if (body.incoterms !== undefined) target.incoterms = String(body.incoterms || '').trim().toUpperCase();
  if (body.moq !== undefined) target.moq = String(body.moq || '').trim();
  if (body.leadTime !== undefined) target.leadTime = String(body.leadTime || '').trim();
  if (body.prepaymentPercent !== undefined) {
    const n = Number(body.prepaymentPercent);
    target.prepaymentPercent = Number.isFinite(n) ? n : null;
  }
  if (body.paymentTerms !== undefined) target.paymentTerms = String(body.paymentTerms || '').trim();
  if (body.comment !== undefined) target.comment = String(body.comment || '').trim();
}

function startOfTodayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function countVedAiSessionsToday(login) {
  return VedResearchSession.countDocuments({
    createdByLogin: login,
    createdAt: { $gte: startOfTodayUtc() },
  });
}

function buildVirtualRequestForSupplierSearch(body) {
  const equipmentType = normalizeEquipmentType(body?.equipmentType);
  const equipmentName = String(body?.equipmentName || '').trim();
  let technicalRequirements = String(body?.technicalRequirements || '').trim();
  if (!technicalRequirements) {
    technicalRequirements = defaultTechnicalRequirements(equipmentType);
  }
  let quantity = Number(body?.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;
  return {
    requestNumber: 'ПОШУК',
    equipmentType,
    equipmentName,
    technicalRequirements,
    quantity,
    managerComment: '',
    desiredDeliveryDate: '',
  };
}

function registerVedRoutes(app, deps = {}) {
  const { User, createManagerNotificationDeduped, authenticateToken } = deps;

  async function notifyVedStaffNewRequest(doc) {
    if (!User || !createManagerNotificationDeduped) return;
    try {
      const staff = await User.find({
        role: { $in: ['ved', 'vidved', 'admin', 'administrator'] },
        dismissed: { $ne: true },
      })
        .select('login')
        .lean();
      const rn = doc.requestNumber || String(doc._id);
      for (const u of staff) {
        const login = String(u.login || '').trim();
        if (!login) continue;
        await createManagerNotificationDeduped({
          recipientLogin: login,
          kind: 'ved_request_new',
          vedImportRequestId: doc._id,
          requestNumber: rn,
          title: `Нова заявка ВЕД ${rn}`,
          body: `Менеджер ${doc.requesterName || doc.requesterLogin || ''} подав заявку на імпорт обладнання.`,
          dedupeKey: `ved_new:${doc._id}:${login}`,
        });
      }
    } catch (e) {
      console.error('[ved] notifyVedStaffNewRequest:', e.message);
    }
  }

  async function notifyManagerStatus(doc, title, body) {
    if (!createManagerNotificationDeduped) return;
    const login = String(doc.requesterLogin || '').trim();
    if (!login) return;
    try {
      await createManagerNotificationDeduped({
        recipientLogin: login,
        kind: 'ved_request_status',
        vedImportRequestId: doc._id,
        requestNumber: doc.requestNumber || String(doc._id),
        title,
        body,
      });
    } catch (e) {
      console.error('[ved] notifyManagerStatus:', e.message);
    }
  }

  app.get('/api/ved/ai/config', authenticateToken, async (req, res) => {
    if (!canManageVedRequests(req.user)) {
      return res.status(403).json({ error: 'Немає доступу' });
    }
    const login = String(req.user?.login || '').trim();
    const usedToday = login ? await countVedAiSessionsToday(login) : 0;
    const dailyLimit = vedAiDailyLimit();
    res.json({
      enabled: vedAiEnabled(),
      hasLlm: Boolean(resolveLlmApiKey()),
      hasWebSearch: Boolean(resolveSerpApiKey()),
      dailyLimit,
      usedToday,
      remainingToday: Math.max(0, dailyLimit - usedToday),
    });
  });

  app.get('/api/ved/meta', authenticateToken, (req, res) => {
    if (!isVedManagerRole(req.user?.role)) {
      return res.status(403).json({ error: 'Немає доступу' });
    }
    res.json({
      statuses: {
        pending_review: 'Очікує розгляду',
        in_progress: 'В роботі',
        supplier_selection: 'Підбір постачальників',
        proposals_ready: 'Пропозиції готові',
        supplier_chosen: 'Обрано постачальника',
        rejected: 'Відхилено',
        completed: 'Завершено',
      },
      equipmentTypes: VED_EQUIPMENT_TYPE_LABELS,
      priorities: {
        low: 'Низький',
        normal: 'Звичайний',
        high: 'Високий',
        urgent: 'Терміновий',
      },
      incoterms: INCOTERMS_OPTIONS,
      activeStatuses: VED_ACTIVE_STATUSES,
      archiveStatuses: VED_ARCHIVE_STATUSES,
      canManage: canManageVedRequests(req.user),
      canCreate: canCreateVedRequest(req.user),
      aiEnabled: canManageVedRequests(req.user) && vedAiEnabled(),
    });
  });

  app.get('/api/ved/requests/:id/ai-research', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: 'Некоректний ідентифікатор' });
      }
      const doc = await VedImportRequest.findById(req.params.id).select('_id requestNumber').lean();
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      const sessions = await VedResearchSession.find({ vedImportRequestId: doc._id })
        .select('-webContextPreview -userPromptPreview')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      res.json(sessions);
    } catch (e) {
      console.error('[ved] GET ai-research list:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/requests/:id/ai-research', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      if (!vedAiEnabled()) {
        return res.status(503).json({ error: 'ШІ-модуль ВЕД не налаштовано (потрібен OPENAI_API_KEY)' });
      }
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: 'Некоректний ідентифікатор' });
      }
      const doc = await VedImportRequest.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      if (VED_ARCHIVE_STATUSES.includes(doc.status)) {
        return res.status(400).json({ error: 'Заявка в архіві' });
      }

      const login = String(req.user.login || '').trim();
      const usedToday = await countVedAiSessionsToday(login);
      const dailyLimit = vedAiDailyLimit();
      if (usedToday >= dailyLimit) {
        return res.status(429).json({
          error: `Денний ліміт ШІ-пошуків (${dailyLimit}) вичерпано. Спробуйте завтра.`,
        });
      }

      const dbUser = await User.findOne({ login: req.user.login }).lean();
      const extraSearchHint = String(req.body?.extraSearchHint || '').trim().slice(0, 200);

      const session = await VedResearchSession.create({
        vedImportRequestId: doc._id,
        requestNumber: doc.requestNumber,
        mode: 'request',
        status: 'running',
        extraSearchHint,
        createdByLogin: login,
        createdByName: String(dbUser?.name || req.user.name || login).trim(),
      });

      try {
        const result = await runVedSupplierResearch(doc, { extraSearchHint });
        session.status = 'completed';
        session.searchQueries = result.searchQueries || [];
        session.webContextPreview = result.webContextPreview || '';
        session.userPromptPreview = result.userPromptPreview || '';
        session.sources = result.sources || [];
        session.summary = result.summary || '';
        session.recommendations = result.recommendations || [];
        session.candidates = result.candidates || [];
        session.llmModel = result.llmModel || '';
        session.disclaimer = result.disclaimer || '';
        session.hasWebSearch = Boolean(result.hasWebSearch);
        await session.save();

        if (['pending_review', 'in_progress'].includes(doc.status)) {
          await VedImportRequest.updateOne({ _id: doc._id }, { status: 'supplier_selection' });
        }

        res.status(201).json(session.toObject());
      } catch (runErr) {
        session.status = 'failed';
        session.error = String(runErr.message || runErr).slice(0, 500);
        await session.save();
        return res.status(502).json({ error: session.error, sessionId: session._id });
      }
    } catch (e) {
      console.error('[ved] POST ai-research:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ved/ai-research/:sessionId', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      if (!mongoose.isValidObjectId(req.params.sessionId)) {
        return res.status(400).json({ error: 'Некоректний ідентифікатор сесії' });
      }
      const session = await VedResearchSession.findById(req.params.sessionId).lean();
      if (!session) return res.status(404).json({ error: 'Сесію не знайдено' });
      res.json(session);
    } catch (e) {
      console.error('[ved] GET ai-research session:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/ai-research/:sessionId/candidates/:candidateId/add-proposal', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const session = await VedResearchSession.findById(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Сесію не знайдено' });
      if (session.status !== 'completed') {
        return res.status(400).json({ error: 'Сесія дослідження не завершена успішно' });
      }

      const candidate = session.candidates.id(req.params.candidateId);
      if (!candidate) return res.status(404).json({ error: 'Кандидата не знайдено' });
      if (candidate.addedToProposalId) {
        return res.status(400).json({ error: 'Кандидат уже додано в пропозиції' });
      }

      const doc = await VedImportRequest.findById(session.vedImportRequestId);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      if (VED_ARCHIVE_STATUSES.includes(doc.status)) {
        return res.status(400).json({ error: 'Заявка в архіві' });
      }

      const dbUser = await User.findOne({ login: req.user.login }).lean();
      const draft = candidateToProposalDraft(candidate.toObject());
      const proposal = {
        ...draft,
        createdByLogin: req.user.login,
        createdByName: String(dbUser?.name || req.user.name || req.user.login).trim(),
      };
      doc.proposals.push(proposal);
      if (['pending_review', 'in_progress'].includes(doc.status)) {
        doc.status = 'supplier_selection';
      }
      await doc.save();

      const newProposal = doc.proposals[doc.proposals.length - 1];
      candidate.addedToProposalId = newProposal._id;
      await session.save();

      res.json({
        session: session.toObject(),
        request: sanitizeDocForUser(req.user, doc.toObject()),
        proposalId: newProposal._id,
      });
    } catch (e) {
      console.error('[ved] add-proposal from AI:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ved/supplier-registry', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const equipmentType = String(req.query.equipmentType || '').trim();
      const q = {};
      if (equipmentType && EQUIPMENT_TYPES_LIST.includes(equipmentType)) q.equipmentType = equipmentType;
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '200'), 10) || 200));
      const rows = await VedSupplierRegistry.find(q).sort({ createdAt: -1 }).limit(limit).lean();
      res.json(rows);
    } catch (e) {
      console.error('[ved] GET supplier-registry:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ved/supplier-registry/meta', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      res.json(await getRegistryMeta());
    } catch (e) {
      console.error('[ved] GET supplier-registry meta:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/supplier-registry/search', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      if (!vedAiEnabled()) {
        return res.status(503).json({ error: 'ШІ-модуль ВЕД не налаштовано (потрібен OPENAI_API_KEY)' });
      }

      const login = String(req.user.login || '').trim();
      const usedToday = await countVedAiSessionsToday(login);
      const dailyLimit = vedAiDailyLimit();
      if (usedToday >= dailyLimit) {
        return res.status(429).json({
          error: `Денний ліміт ШІ-пошуків (${dailyLimit}) вичерпано. Спробуйте завтра.`,
        });
      }

      const dbUser = await User.findOne({ login: req.user.login }).lean();
      const body = req.body || {};
      const result = await runRegistrySearch(
        {
          equipmentTypes: body.equipmentTypes,
          equipmentType: body.equipmentType,
          equipmentName: body.equipmentName,
          technicalRequirements: body.technicalRequirements,
          quantity: body.quantity,
          extraSearchHint: body.extraSearchHint,
        },
        {
          source: 'manual',
          addedByLogin: login,
          addedByName: String(dbUser?.name || req.user.name || login).trim(),
        }
      );

      res.status(201).json(result);
    } catch (e) {
      console.error('[ved] POST supplier-registry search:', e.message);
      const status = /Вкажіть найменування/.test(e.message) ? 400 : 502;
      res.status(status).json({ error: e.message });
    }
  });

  app.get('/api/ved/supplier-search/sessions', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const sessions = await VedResearchSession.find({ mode: 'standalone' })
        .select('-webContextPreview -userPromptPreview')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();
      res.json(sessions);
    } catch (e) {
      console.error('[ved] GET supplier-search sessions:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/supplier-search', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      if (!vedAiEnabled()) {
        return res.status(503).json({ error: 'ШІ-модуль ВЕД не налаштовано (потрібен OPENAI_API_KEY)' });
      }

      const login = String(req.user.login || '').trim();
      const usedToday = await countVedAiSessionsToday(login);
      const dailyLimit = vedAiDailyLimit();
      if (usedToday >= dailyLimit) {
        return res.status(429).json({
          error: `Денний ліміт ШІ-пошуків (${dailyLimit}) вичерпано. Спробуйте завтра.`,
        });
      }

      const dbUser = await User.findOne({ login: req.user.login }).lean();
      const body = req.body || {};
      const result = await runRegistrySearch(body, {
        source: 'manual',
        addedByLogin: login,
        addedByName: String(dbUser?.name || req.user.name || login).trim(),
      });
      res.status(201).json(result);
    } catch (e) {
      console.error('[ved] POST supplier-search:', e.message);
      const status = /Вкажіть найменування/.test(e.message) ? 400 : 502;
      res.status(status).json({ error: e.message, sessionId: null });
    }
  });

  app.get('/api/ved/requests', authenticateToken, async (req, res) => {
    try {
      if (!isVedManagerRole(req.user?.role)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const section = String(req.query.section || 'active').trim();
      const q = vedListQueryForUser(req.user);
      if (section === 'archive') {
        q.status = { $in: VED_ARCHIVE_STATUSES };
      } else {
        q.status = { $in: VED_ACTIVE_STATUSES };
      }
      const rows = await VedImportRequest.find(q).sort({ createdAt: -1 }).lean();
      const out = rows.map((row) => {
        const base = sanitizeDocForUser(req.user, row);
        if (canManageVedRequests(req.user)) {
          base.proposalCount = (row.proposals || []).length;
          base.validProposalCount = countValidProposals(row);
        }
        return base;
      });
      res.json(out);
    } catch (e) {
      console.error('[ved] GET requests:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/requests', authenticateToken, async (req, res) => {
    try {
      if (!canCreateVedRequest(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const body = req.body || {};
      const equipmentType = normalizeEquipmentType(body.equipmentType);
      const equipmentName = String(body.equipmentName || '').trim();
      const technicalRequirements = String(body.technicalRequirements || '').trim();
      const managerComment = String(body.managerComment || '').trim();
      const desiredDeliveryDate = String(body.desiredDeliveryDate || '').trim();
      const priority = ['low', 'normal', 'high', 'urgent'].includes(body.priority)
        ? body.priority
        : 'normal';
      let quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;

      if (!equipmentName && !technicalRequirements) {
        return res.status(400).json({ error: 'Вкажіть найменування обладнання або технічні вимоги' });
      }

      const dbUser = await User.findOne({ login: req.user.login }).lean();
      const requestNumber = await getNextVedRequestNumber();
      const doc = await VedImportRequest.create({
        requestNumber,
        equipmentType,
        equipmentName,
        technicalRequirements,
        quantity,
        desiredDeliveryDate,
        priority,
        managerComment,
        requesterLogin: req.user.login,
        requesterName: String(dbUser?.name || req.user.name || req.user.login).trim(),
        status: 'pending_review',
        sourceType: 'open_search',
      });
      await notifyVedStaffNewRequest(doc.toObject());
      res.status(201).json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] POST request:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ved/requests/:id', authenticateToken, async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: 'Некоректний ідентифікатор' });
      }
      const doc = await VedImportRequest.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      if (!userCanReadVedRequest(req.user, doc)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      res.json(sanitizeDocForUser(req.user, doc));
    } catch (e) {
      console.error('[ved] GET request:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/requests/:id/take-in-work', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const doc = await VedImportRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      if (doc.status !== 'pending_review') {
        return res.status(400).json({ error: 'Можна взяти в роботу лише заявку «Очікує розгляду»' });
      }
      const dbUser = await User.findOne({ login: req.user.login }).lean();
      doc.status = 'in_progress';
      doc.vedLogin = req.user.login;
      doc.vedName = String(dbUser?.name || req.user.name || req.user.login).trim();
      doc.vedTakenAt = new Date();
      await doc.save();
      await notifyManagerStatus(doc, `Заявка ВЕД ${doc.requestNumber} в роботі`, 'Спеціаліст ВЕД взяв вашу заявку в роботу.');
      res.json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] take-in-work:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/ved/requests/:id/ved-comment', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const doc = await VedImportRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      doc.vedComment = String(req.body?.vedComment || '').trim().slice(0, 10000);
      await doc.save();
      res.json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] ved-comment:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/requests/:id/proposals', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const doc = await VedImportRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      if (VED_ARCHIVE_STATUSES.includes(doc.status)) {
        return res.status(400).json({ error: 'Заявка в архіві' });
      }
      const dbUser = await User.findOne({ login: req.user.login }).lean();
      const proposal = {
        createdByLogin: req.user.login,
        createdByName: String(dbUser?.name || req.user.name || req.user.login).trim(),
      };
      applyProposalPayload(proposal, req.body || {});
      doc.proposals.push(proposal);
      if (['pending_review', 'in_progress'].includes(doc.status)) {
        doc.status = 'supplier_selection';
      }
      await doc.save();
      res.status(201).json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] add proposal:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/ved/requests/:id/proposals/:proposalId', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const doc = await VedImportRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      const proposal = doc.proposals.id(req.params.proposalId);
      if (!proposal) return res.status(404).json({ error: 'Пропозицію не знайдено' });
      applyProposalPayload(proposal, req.body || {});
      await doc.save();
      res.json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] patch proposal:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/ved/requests/:id/proposals/:proposalId', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const doc = await VedImportRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      const proposal = doc.proposals.id(req.params.proposalId);
      if (!proposal) return res.status(404).json({ error: 'Пропозицію не знайдено' });
      if (proposal.chosen) {
        return res.status(400).json({ error: 'Не можна видалити обрану пропозицію' });
      }
      proposal.deleteOne();
      await doc.save();
      res.json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] delete proposal:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/requests/:id/mark-proposals-ready', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const doc = await VedImportRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      const validCount = countValidProposals(doc);
      if (validCount < 1) {
        return res.status(400).json({
          error: 'Потрібна хоча б одна пропозиція з усіма обов’язковими полями (Incoterms, валюта, MOQ, lead time, % передоплати)',
        });
      }
      doc.status = 'proposals_ready';
      await doc.save();
      await notifyManagerStatus(
        doc,
        `Пропозиції готові — ${doc.requestNumber}`,
        'ВЕД підготував пропозиції постачальників. Очікується фінальне рішення.'
      );
      res.json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] mark-proposals-ready:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/requests/:id/choose-supplier', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const doc = await VedImportRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      const proposalId = String(req.body?.proposalId || '').trim();
      const proposal = doc.proposals.id(proposalId);
      if (!proposal) return res.status(404).json({ error: 'Пропозицію не знайдено' });
      const errors = validateProposalFields(proposal);
      if (errors.length) {
        return res.status(400).json({ error: `Пропозиція неповна: ${errors.join(', ')}` });
      }
      for (const p of doc.proposals) {
        p.chosen = String(p._id) === String(proposal._id);
      }
      doc.chosenProposalId = proposal._id;
      doc.finalDecisionSummary = buildFinalDecisionSummary(proposal);
      doc.status = 'supplier_chosen';
      if (req.body?.vedComment !== undefined) {
        doc.vedComment = String(req.body.vedComment || '').trim().slice(0, 10000);
      }
      await doc.save();
      await notifyManagerStatus(
        doc,
        `Обрано постачальника — ${doc.requestNumber}`,
        doc.finalDecisionSummary || 'ВЕД обрав постачальника для вашої заявки.'
      );
      res.json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] choose-supplier:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/requests/:id/reject', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const doc = await VedImportRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      if (VED_ARCHIVE_STATUSES.includes(doc.status)) {
        return res.status(400).json({ error: 'Заявка вже в архіві' });
      }
      const reason = String(req.body?.reason || '').trim();
      doc.status = 'rejected';
      doc.rejectedReason = reason;
      doc.completedAt = new Date();
      await doc.save();
      await notifyManagerStatus(
        doc,
        `Заявку ВЕД відхилено — ${doc.requestNumber}`,
        reason || 'Заявку відхилено відділом ВЕД.'
      );
      res.json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] reject:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/requests/:id/complete', authenticateToken, async (req, res) => {
    try {
      if (!canManageVedRequests(req.user)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const doc = await VedImportRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Заявку не знайдено' });
      if (doc.status !== 'supplier_chosen') {
        return res.status(400).json({ error: 'Завершити можна лише заявку з обраним постачальником' });
      }
      doc.status = 'completed';
      doc.completedAt = new Date();
      await doc.save();
      await notifyManagerStatus(
        doc,
        `Заявку ВЕД завершено — ${doc.requestNumber}`,
        doc.finalDecisionSummary || 'Заявку на імпорт закрито.'
      );
      res.json(sanitizeDocForUser(req.user, doc.toObject()));
    } catch (e) {
      console.error('[ved] complete:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = {
  registerVedRoutes,
  scheduleVedSupplierRegistryJob,
  VED_STATUSES,
  isVedStaffRole,
  isVedManagerRole,
};
