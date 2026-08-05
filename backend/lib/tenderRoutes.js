/**
 * API маршрути панелі «Тендерний відділ».
 */
const mongoose = require('mongoose');
const { searchTendersAll, getTenderDetails, SOURCES } = require('./tenderAggregator');
const { DEFAULT_NICHE_KEYWORDS } = require('./tenderProzorro');
const { analyzeTender, CATEGORY_LABELS, RECOMMENDATION_LABELS } = require('./tenderAnalysis');

const TENDER_STATUSES = ['new', 'review', 'approved', 'assigned', 'participating', 'won', 'lost', 'rejected'];

const tenderWatchSchema = new mongoose.Schema(
  {
    prozorroId: { type: String, required: true, index: true },
    source: { type: String, enum: ['prozorro', 'dzo'], default: 'prozorro', index: true },
    sourceLabel: String,
    tenderNumber: String,
    title: String,
    description: String,
    budget: Number,
    currency: { type: String, default: 'UAH' },
    budgetFormatted: String,
    deadline: Date,
    customer: String,
    region: String,
    deliveryAddress: String,
    category: String,
    categoryLabel: String,
    powerKw: Number,
    prozorroUrl: String,
    platformUrl: String,
    documents: [{ title: String, url: String, format: String }],
    analysis: {
      score: Number,
      recommendation: String,
      recommendationLabel: String,
      summary: String,
      requiredDocs: [String],
      competitiveNotes: [String],
      strengths: [String],
      risks: [String],
    },
    status: { type: String, enum: TENDER_STATUSES, default: 'new', index: true },
    assignedManagerLogin: String,
    assignedManagerName: String,
    assignedAt: Date,
    assignedByLogin: String,
    assignedByName: String,
    transmittedAt: Date,
    notes: String,
    savedByLogin: String,
    savedByName: String,
    rawSnapshot: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

tenderWatchSchema.index({ source: 1, prozorroId: 1 }, { unique: true });
tenderWatchSchema.index({ status: 1, updatedAt: -1 });
tenderWatchSchema.index({ assignedManagerLogin: 1, status: 1 });

let TenderWatch;
try {
  TenderWatch = mongoose.model('TenderWatch');
} catch {
  TenderWatch = mongoose.model('TenderWatch', tenderWatchSchema);
}

function canAccessTenderPanel(user) {
  const role = String(user?.role || '').toLowerCase();
  return ['admin', 'administrator', 'tenderviddil', 'tender', 'tendervid'].includes(role);
}

function canManageTenders(user) {
  return canAccessTenderPanel(user);
}

function canViewTender(user, record) {
  if (canManageTenders(user)) return true;
  const role = String(user?.role || '').toLowerCase();
  if (role === 'manager' && record?.assignedManagerLogin === user.login) return true;
  if (['regional', 'regkerivn'].includes(role) && record?.assignedManagerLogin === user.login) return true;
  return false;
}

function registerTenderRoutes(app, deps = {}) {
  const { User, createManagerNotificationDeduped, authenticateToken } = deps;

  app.get('/api/tenders/meta', authenticateToken, (req, res) => {
    res.json({
      categories: CATEGORY_LABELS,
      statuses: {
        new: 'Новий',
        review: 'На аналізі',
        approved: 'Схвалено',
        assigned: 'Призначено менеджеру',
        participating: 'Участь',
        won: 'Виграно',
        lost: 'Програно',
        rejected: 'Відхилено',
      },
      recommendations: RECOMMENDATION_LABELS,
      defaultKeywords: DEFAULT_NICHE_KEYWORDS,
      sources: SOURCES,
    });
  });

  app.get('/api/tenders/search', authenticateToken, async (req, res) => {
    try {
      if (!canAccessTenderPanel(req.user)) {
        return res.status(403).json({ error: 'Немає доступу до тендерного відділу' });
      }
      const q = String(req.query.q || req.query.query || '').trim();
      const region = String(req.query.region || '').trim();
      const category = String(req.query.category || '').trim();
      const limit = Math.min(parseInt(req.query.limit, 10) || 25, 50);
      const minBudget = req.query.minBudget != null && req.query.minBudget !== '' ? Number(req.query.minBudget) : null;
      const maxBudget = req.query.maxBudget != null && req.query.maxBudget !== '' ? Number(req.query.maxBudget) : null;
      const nicheOnly = req.query.nicheOnly !== '0';
      const source = String(req.query.source || 'all').trim();

      const { items, warnings, query: usedQuery } = await searchTendersAll({
        query: q,
        region,
        category,
        limit,
        minBudget,
        maxBudget,
        nicheOnly,
        source,
      });

      const enriched = items.map((t) => ({
        ...t,
        analysis: analyzeTender(t),
      }));

      res.json({
        items: enriched,
        count: enriched.length,
        query: q || usedQuery,
        source,
        warnings,
        warning: warnings.length ? warnings.join('; ') : undefined,
      });
    } catch (e) {
      console.error('[tenders/search]', e);
      res.json({
        items: [],
        count: 0,
        warning: e.message || 'Prozorro тимчасово недоступний',
        query: String(req.query.q || req.query.query || '').trim() || DEFAULT_NICHE_KEYWORDS.slice(0, 3).join(' '),
      });
    }
  });

  app.get('/api/tenders/prozorro/:id', authenticateToken, async (req, res) => {
    try {
      if (!canAccessTenderPanel(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const source = String(req.query.source || 'prozorro').toLowerCase();
      const tender = await getTenderDetails(req.params.id, source);
      const analysis = analyzeTender(tender);
      res.json({ ...tender, analysis });
    } catch (e) {
      res.status(404).json({ error: e.message || 'Тендер не знайдено' });
    }
  });

  app.get('/api/tenders/watchlist', authenticateToken, async (req, res) => {
    try {
      const role = String(req.user?.role || '').toLowerCase();
      const filter = {};
      if (canManageTenders(req.user)) {
        if (req.query.status) filter.status = req.query.status;
      } else if (role === 'manager') {
        filter.assignedManagerLogin = req.user.login;
      } else {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const list = await TenderWatch.find(filter).sort({ updatedAt: -1 }).limit(500).lean();
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/tenders/watchlist/stats', authenticateToken, async (req, res) => {
    try {
      if (!canManageTenders(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const base = {};
      const byStatus = {};
      for (const st of TENDER_STATUSES) {
        byStatus[st] = await TenderWatch.countDocuments({ ...base, status: st });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const urgent = await TenderWatch.countDocuments({
        ...base,
        deadline: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 86400000) },
        status: { $in: ['new', 'review', 'approved', 'assigned', 'participating'] },
      });
      res.json({ byStatus, urgent, total: await TenderWatch.countDocuments(base) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/tenders/watchlist', authenticateToken, async (req, res) => {
    try {
      if (!canManageTenders(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const prozorroId = String(bodyProzorroId(req.body)).trim();
      if (!prozorroId) return res.status(400).json({ error: 'Вкажіть prozorroId' });
      const source = String(req.body?.source || req.body?.tender?.source || 'prozorro').toLowerCase();

      const existing = await TenderWatch.findOne({ prozorroId, source }).lean();
      if (existing) return res.status(409).json({ error: 'Тендер уже в робочому списку', record: existing });

      let tender;
      let analysis;
      if (req.body?.tender && req.body?.analysis) {
        tender = req.body.tender;
        analysis = req.body.analysis;
      } else {
        tender = await getTenderDetails(prozorroId, source);
        analysis = analyzeTender(tender);
      }

      const dbUser = User ? await User.findOne({ login: req.user.login }).lean() : null;

      const record = await TenderWatch.create({
        prozorroId: tender.prozorroId || prozorroId,
        source: tender.source || source,
        sourceLabel: tender.sourceLabel || (source === 'dzo' ? 'DZO' : 'Prozorro'),
        tenderNumber: tender.tenderNumber,
        title: tender.title,
        description: tender.description,
        budget: tender.budget,
        currency: tender.currency,
        budgetFormatted: tender.budgetFormatted,
        deadline: tender.deadline ? new Date(tender.deadline) : null,
        customer: tender.customer,
        region: tender.region,
        deliveryAddress: tender.deliveryAddress,
        category: analysis.category,
        categoryLabel: analysis.categoryLabel,
        powerKw: analysis.powerKw,
        prozorroUrl: tender.prozorroUrl,
        platformUrl: tender.platformUrl || tender.prozorroUrl,
        documents: tender.documents || [],
        analysis: {
          score: analysis.score,
          recommendation: analysis.recommendation,
          recommendationLabel: analysis.recommendationLabel,
          summary: analysis.summary,
          requiredDocs: analysis.requiredDocs,
          competitiveNotes: analysis.competitiveNotes,
          strengths: analysis.strengths,
          risks: analysis.risks,
        },
        status: 'new',
        savedByLogin: req.user.login,
        savedByName: dbUser?.name || req.user.login,
        rawSnapshot: tender,
      });

      res.status(201).json(record);
    } catch (e) {
      if (e.code === 11000) {
        const existing = await TenderWatch.findOne({
          prozorroId: bodyProzorroId(req.body),
          source: String(req.body?.source || req.body?.tender?.source || 'prozorro').toLowerCase(),
        }).lean();
        return res.status(409).json({ error: 'Тендер уже в робочому списку', record: existing });
      }
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/tenders/watchlist/:id', authenticateToken, async (req, res) => {
    try {
      const record = await TenderWatch.findById(req.params.id);
      if (!record) return res.status(404).json({ error: 'Запис не знайдено' });
      if (!canViewTender(req.user, record) || (!canManageTenders(req.user) && !record.assignedManagerLogin)) {
        if (!canManageTenders(req.user)) return res.status(403).json({ error: 'Немає доступу' });
      }

      const body = req.body || {};
      if (canManageTenders(req.user)) {
        if (body.status && TENDER_STATUSES.includes(body.status)) record.status = body.status;
        if (body.notes !== undefined) record.notes = String(body.notes || '');
      } else if (body.notes !== undefined) {
        record.notes = String(body.notes || '');
      }

      await record.save();
      res.json(record);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/tenders/watchlist/:id/assign', authenticateToken, async (req, res) => {
    try {
      if (!canManageTenders(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const record = await TenderWatch.findById(req.params.id);
      if (!record) return res.status(404).json({ error: 'Запис не знайдено' });

      const managerLogin = String(req.body?.managerLogin || '').trim();
      if (!managerLogin) return res.status(400).json({ error: 'Вкажіть managerLogin' });
      if (!User) return res.status(500).json({ error: 'User model недоступна' });

      const manager = await User.findOne({ login: managerLogin, dismissed: { $ne: true } }).lean();
      if (!manager) return res.status(404).json({ error: 'Менеджера не знайдено' });

      const dbUser = await User.findOne({ login: req.user.login }).lean();
      record.assignedManagerLogin = manager.login;
      record.assignedManagerName = manager.name || manager.login;
      record.assignedAt = new Date();
      record.assignedByLogin = req.user.login;
      record.assignedByName = dbUser?.name || req.user.login;
      record.status = 'assigned';
      await record.save();
      res.json(record);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/tenders/watchlist/:id/transmit', authenticateToken, async (req, res) => {
    try {
      if (!canManageTenders(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const record = await TenderWatch.findById(req.params.id);
      if (!record) return res.status(404).json({ error: 'Запис не знайдено' });
      if (!record.assignedManagerLogin) {
        return res.status(400).json({ error: 'Спочатку призначте менеджера' });
      }

      record.transmittedAt = new Date();
      record.status = 'participating';
      await record.save();

      if (createManagerNotificationDeduped) {
        const title = `📋 Тендер: ${record.title || record.tenderNumber || 'без назви'}`.slice(0, 120);
        const body = [
          `Бюджет: ${record.budgetFormatted || '—'}`,
          `Дедлайн: ${record.deadline ? new Date(record.deadline).toLocaleString('uk-UA') : '—'}`,
          `Регіон: ${record.region || '—'}`,
          record.analysis?.recommendationLabel || '',
          record.prozorroUrl ? `Посилання: ${record.prozorroUrl}` : '',
        ].filter(Boolean).join('\n');

        await createManagerNotificationDeduped({
          recipientLogin: record.assignedManagerLogin,
          kind: 'tender_assigned',
          title,
          body,
          dedupeKey: `tender_transmit:${record._id}:${record.assignedManagerLogin}`,
          metadata: {
            tenderWatchId: String(record._id),
            prozorroId: record.prozorroId,
            prozorroUrl: record.prozorroUrl,
          },
        });
      }

      res.json(record);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/tenders/watchlist/:id', authenticateToken, async (req, res) => {
    try {
      if (!canManageTenders(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const record = await TenderWatch.findByIdAndDelete(req.params.id);
      if (!record) return res.status(404).json({ error: 'Запис не знайдено' });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
}

function bodyProzorroId(body) {
  return body?.prozorroId || body?.id || body?.tender?.prozorroId;
}

module.exports = {
  registerTenderRoutes,
  TenderWatch,
  canAccessTenderPanel,
};
