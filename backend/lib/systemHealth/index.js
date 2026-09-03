/**
 * Маршрути вкладки «Аналіз роботи системи» (адміністратор).
 *
 * Зовнішні ресурси: Render, MongoDB Atlas, Cloudinary.
 * Проєкт: власні метрики бекенду, зібрані requestMetrics.
 */
const mongoose = require('mongoose');
const { fetchRenderState, isConfigured: renderConfigured } = require('./providers/renderProvider');
const { fetchMongoState, isConfigured: atlasConfigured } = require('./providers/atlasProvider');
const { fetchCloudinaryState, isConfigured: cloudinaryConfigured } = require('./providers/cloudinaryProvider');
const { analyzeProject } = require('./projectAnalyzer');
const { buildRecommendations } = require('./advisor');
const { getRequestMetricsSnapshot, resetRequestMetrics } = require('./requestMetrics');
const { ResourcePayment, RESOURCES, STATUSES, sanitizePayload, syncAtlasInvoices, summarize } = require('./billingJournal');
const { invalidate } = require('./cache');

const ADMIN_ROLES = ['admin', 'administrator'];

function requireAdmin(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!ADMIN_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Доступ лише для адміністратора' });
  }
  return next();
}

/** Помилка одного провайдера не має ламати весь борд — кожен блок повертається окремо. */
async function settle(label, promise) {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    return { ok: false, error: error.message, label };
  }
}

function statusFromPercent(percent, { warn = 70, critical = 88 } = {}) {
  if (percent == null || Number.isNaN(percent)) return 'unknown';
  if (percent >= critical) return 'critical';
  if (percent >= warn) return 'warning';
  return 'ok';
}

function worstStatus(statuses) {
  const order = ['critical', 'warning', 'ok', 'unknown'];
  for (const level of order) {
    if (statuses.includes(level)) return level;
  }
  return 'unknown';
}

/** Компактні картки для верхнього ряду бордів. */
function buildBoards({ render, mongo, cloudinary, project }) {
  const boards = [];

  if (render?.configured) {
    const web = (render.services || []).filter((service) => service.type === 'web_service');
    const memoryPercents = web.map((service) => service.usage?.memoryPercent).filter((value) => value != null);
    const cpuPercents = web.map((service) => service.usage?.cpuPercent).filter((value) => value != null);
    const maxMemory = memoryPercents.length ? Math.max(...memoryPercents) : null;
    const maxCpu = cpuPercents.length ? Math.max(...cpuPercents) : null;
    boards.push({
      key: 'render',
      title: 'Render',
      subtitle: `${render.services?.length || 0} сервіс(ів)`,
      status: worstStatus([statusFromPercent(maxMemory), statusFromPercent(maxCpu)]),
      primary: { label: 'Пам\'ять (макс.)', value: maxMemory == null ? '—' : `${Math.round(maxMemory)}%`, percent: maxMemory },
      secondary: [
        { label: 'CPU (макс.)', value: maxCpu == null ? '—' : `${Math.round(maxCpu)}%`, percent: maxCpu },
        { label: 'Запитів', value: (web.reduce((sum, s) => sum + (s.usage?.requestsTotal || 0), 0)).toLocaleString('uk-UA') },
        { label: 'Оцінка/міс', value: `$${(render.estimate?.monthlyUsd || 0).toFixed(0)}` },
      ],
      link: 'https://dashboard.render.com/',
    });
  } else {
    boards.push({
      key: 'render',
      title: 'Render',
      subtitle: 'не підключено',
      status: 'unknown',
      primary: { label: 'API-ключ', value: '—', percent: null },
      secondary: [],
      link: 'https://dashboard.render.com/',
    });
  }

  const mongoConnected = Boolean(mongo?.local?.available);
  const storagePercent = mongo?.storage?.percent ?? null;
  boards.push({
    key: 'mongodb',
    title: 'MongoDB Atlas',
    subtitle: mongoConnected ? mongo?.cluster?.name || mongo?.local?.name || 'кластер' : 'немає підключення',
    status: mongoConnected ? statusFromPercent(storagePercent, { warn: 75, critical: 90 }) : 'critical',
    primary: {
      label: 'Сховище',
      value: storagePercent == null ? '—' : `${Math.round(storagePercent)}%`,
      percent: storagePercent,
    },
    secondary: [
      { label: 'Дані', value: mongoConnected ? `${Math.round((mongo.local.totalSizeBytes || 0) / 1024 / 1024)} МБ` : '—' },
      { label: 'Колекцій', value: mongoConnected ? mongo.local.collections ?? '—' : '—' },
      { label: 'Документів', value: mongoConnected ? (mongo.local.objects || 0).toLocaleString('uk-UA') : '—' },
    ],
    link: 'https://account.mongodb.com/',
  });

  const creditPercent = cloudinary?.credits?.percent ?? null;
  boards.push({
    key: 'cloudinary',
    title: 'Cloudinary',
    subtitle: cloudinary?.plan?.label || 'не підключено',
    status: cloudinary?.configured ? statusFromPercent(creditPercent, { warn: 70, critical: 90 }) : 'unknown',
    primary: { label: 'Кредити', value: creditPercent == null ? '—' : `${Math.round(creditPercent)}%`, percent: creditPercent },
    secondary: [
      { label: 'Сховище', value: `${((cloudinary?.storage?.usedBytes || 0) / 1024 ** 3).toFixed(2)} ГБ`, percent: cloudinary?.storage?.percent ?? null },
      { label: 'Трафік', value: `${((cloudinary?.bandwidth?.usedBytes || 0) / 1024 ** 3).toFixed(2)} ГБ`, percent: cloudinary?.bandwidth?.percent ?? null },
      { label: 'Файлів', value: (cloudinary?.resources || 0).toLocaleString('uk-UA') },
    ],
    link: 'https://cloudinary.com/',
  });

  if (project) {
    const score = project.score;
    boards.push({
      key: 'project',
      title: 'Проєкт DTS',
      subtitle: `${project.totals.requests.toLocaleString('uk-UA')} запитів у вибірці`,
      status: score == null ? 'unknown' : score >= 80 ? 'ok' : score >= 55 ? 'warning' : 'critical',
      primary: { label: 'Індекс здоровʼя', value: score == null ? '—' : `${score}/100`, percent: score },
      secondary: [
        { label: 'p95', value: `${project.totals.p95Ms} мс` },
        { label: 'Помилки 5xx', value: `${project.totals.serverErrorRate.toFixed(2)}%` },
        { label: 'Event loop p99', value: `${project.runtime.eventLoop.p99Ms} мс` },
      ],
      link: null,
    });
  }

  return boards;
}

function registerSystemHealthRoutes(app, { authenticateToken } = {}) {
  const guard = [authenticateToken, requireAdmin].filter(Boolean);

  app.get('/api/system-health/config', ...guard, (req, res) => {
    res.json({
      render: { configured: renderConfigured(), envKeys: ['RENDER_API_KEY'] },
      mongodb: {
        configured: atlasConfigured(),
        connected: mongoose.connection.readyState === 1,
        envKeys: [
          'MONGODB_ATLAS_CLIENT_ID',
          'MONGODB_ATLAS_CLIENT_SECRET',
          'MONGODB_ATLAS_GROUP_ID',
          'MONGODB_ATLAS_ORG_ID',
        ],
      },
      cloudinary: { configured: cloudinaryConfigured(), envKeys: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] },
    });
  });

  /** Головний запит вкладки: борди, деталі по ресурсах, аналіз проєкту та рекомендації. */
  app.get('/api/system-health/overview', ...guard, async (req, res) => {
    try {
      const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
      const force = req.query.refresh === '1';

      const [renderResult, mongoResult, cloudinaryResult] = await Promise.all([
        settle('render', fetchRenderState({ hours, force })),
        settle('mongodb', fetchMongoState({ force })),
        settle('cloudinary', fetchCloudinaryState({ force })),
      ]);

      const render = renderResult.ok ? renderResult.data : { configured: renderConfigured(), services: [], error: renderResult.error };
      const mongo = mongoResult.ok ? mongoResult.data : { configured: atlasConfigured(), error: mongoResult.error };
      const cloudinary = cloudinaryResult.ok
        ? cloudinaryResult.data
        : { configured: cloudinaryConfigured(), error: cloudinaryResult.error };

      const project = analyzeProject({ mongoState: mongo });
      const recommendations = buildRecommendations({ render, mongo, cloudinary, project });
      const boards = buildBoards({ render, mongo, cloudinary, project });

      res.json({
        generatedAt: new Date().toISOString(),
        hours,
        boards,
        external: { render, mongodb: mongo, cloudinary },
        project,
        recommendations,
        errors: [renderResult, mongoResult, cloudinaryResult].filter((r) => !r.ok).map((r) => ({ scope: r.label, error: r.error })),
      });
    } catch (error) {
      console.error('[SYSTEM-HEALTH] overview error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/system-health/project', ...guard, async (req, res) => {
    try {
      const mongo = await fetchMongoState({}).catch(() => null);
      res.json(analyzeProject({ mongoState: mongo }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/system-health/metrics/raw', ...guard, (req, res) => {
    res.json(getRequestMetricsSnapshot());
  });

  app.post('/api/system-health/metrics/reset', ...guard, (req, res) => {
    resetRequestMetrics();
    res.json({ success: true });
  });

  app.post('/api/system-health/cache/invalidate', ...guard, (req, res) => {
    invalidate();
    res.json({ success: true });
  });

  // ── Журнал рахунків та оплат ──────────────────────────────────────────────

  app.get('/api/system-health/payments', ...guard, async (req, res) => {
    try {
      const filter = {};
      if (RESOURCES.includes(req.query.resource)) filter.resource = req.query.resource;
      if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
      const payments = await ResourcePayment.find(filter).sort({ periodStart: -1, createdAt: -1 }).limit(500).lean();
      res.json({ payments, summary: summarize(payments), resources: RESOURCES, statuses: STATUSES });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/system-health/payments', ...guard, async (req, res) => {
    try {
      const payload = sanitizePayload(req.body, req.user);
      if (!payload.amount && payload.amount !== 0) return res.status(400).json({ error: 'Вкажіть суму' });
      const created = await ResourcePayment.create(payload);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/system-health/payments/:id', ...guard, async (req, res) => {
    try {
      const payload = sanitizePayload(req.body, req.user);
      delete payload.createdByLogin;
      delete payload.createdByName;
      const updated = await ResourcePayment.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!updated) return res.status(404).json({ error: 'Запис не знайдено' });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/system-health/payments/:id', ...guard, async (req, res) => {
    try {
      const deleted = await ResourcePayment.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Запис не знайдено' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Підтягує рахунки Atlas у журнал (Render і Cloudinary API рахунків не віддають). */
  app.post('/api/system-health/payments/sync', ...guard, async (req, res) => {
    try {
      const mongo = await fetchMongoState({ force: true });
      const created = await syncAtlasInvoices(mongo?.invoices || []);
      const payments = await ResourcePayment.find({}).sort({ periodStart: -1, createdAt: -1 }).limit(500).lean();
      res.json({
        success: true,
        created,
        skipped: {
          render: 'Render не надає рахунки через API — додайте вручну або з dashboard.render.com/billing.',
          cloudinary: 'Cloudinary не надає рахунки через API — додайте вручну з console.cloudinary.com.',
        },
        payments,
        summary: summarize(payments),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = { registerSystemHealthRoutes };
