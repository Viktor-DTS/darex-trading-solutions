const {
  initTradingModels,
  ensureDefaultSettings,
  ensureRiskState,
} = require('./tradingModels');
const { runTradingScan } = require('./tradingScan');
const { notifyTradingAlert } = require('./tradingTelegram');

const TRADING_ADMIN_ROLES = new Set(['admin', 'administrator']);

function isTradingAdmin(role) {
  return TRADING_ADMIN_ROLES.has(String(role || '').toLowerCase());
}

function registerTradingRoutes(app, { getAssistantConnection }) {
  app.get('/api/trading/status', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ лише для ролей admin / administrator' });
    }
    const models = initTradingModels(getAssistantConnection);
    if (!models.conn) {
      return res.status(503).json({ error: 'Assistant MongoDB недоступна' });
    }
    const settings = await ensureDefaultSettings(models);
    const risk = await ensureRiskState(models);
    res.json({
      enabled: process.env.TRADING_MODULE_ENABLED !== '0',
      scanEnabled: process.env.TRADING_SCAN_ENABLED === '1',
      ibkrConfigured: Boolean(process.env.IBKR_CONSUMER_KEY),
      settings,
      risk,
    });
  });

  app.get('/api/trading/dashboard', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const models = initTradingModels(getAssistantConnection);
    if (!models.conn) {
      return res.status(503).json({ error: 'Assistant MongoDB недоступна' });
    }

    const [settings, risk, signals, trades, external] = await Promise.all([
      ensureDefaultSettings(models),
      ensureRiskState(models),
      models.TradingSignal.find().sort({ createdAt: -1 }).limit(30).lean(),
      models.TradingTrade.find({ status: 'open' }).sort({ openedAt: -1 }).lean(),
      models.TradingExternalSnapshot.findOne().sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      settings,
      risk,
      openTrades: trades,
      recentSignals: signals,
      external: external || null,
    });
  });

  app.get('/api/trading/signals', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const models = initTradingModels(getAssistantConnection);
    if (!models.conn) return res.status(503).json({ error: 'Assistant MongoDB недоступна' });

    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const rows = await models.TradingSignal.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ signals: rows });
  });

  app.patch('/api/trading/settings', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const models = initTradingModels(getAssistantConnection);
    if (!models.conn) return res.status(503).json({ error: 'Assistant MongoDB недоступна' });

    const allowed = [
      'mode',
      'autoEnabled',
      'watchlist',
      'riskPerTradePct',
      'maxOpenPositions',
      'dailyLossLimitPct',
      'weeklyLossLimitPct',
      'maxDrawdownPct',
      'equityUsd',
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.watchlist && !Array.isArray(patch.watchlist)) {
      return res.status(400).json({ error: 'watchlist must be array' });
    }
    if (patch.watchlist) {
      patch.watchlist = patch.watchlist.map((s) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 30);
    }

    const doc = await models.TradingSettings.findOneAndUpdate(
      { key: 'global' },
      { $set: patch },
      { new: true, upsert: true },
    ).lean();

    res.json({ settings: doc });
  });

  app.post('/api/trading/scan', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const result = await runTradingScan(getAssistantConnection, { triggeredBy: req.user?.login || 'api' });
    if (!result.ok && !result.skipped) {
      return res.status(500).json(result);
    }
    res.json(result);
  });

  app.post('/api/trading/pause', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const models = initTradingModels(getAssistantConnection);
    if (!models.conn) return res.status(503).json({ error: 'Assistant MongoDB недоступна' });

    const paused = req.body?.paused !== false;
    const reason = String(req.body?.reason || (paused ? 'manual pause' : '')).slice(0, 200);

    await models.TradingRiskState.updateOne(
      { key: 'global' },
      { $set: { tradingPaused: paused, pauseReason: paused ? reason : '' } },
      { upsert: true },
    );

    if (paused) {
      await notifyTradingAlert(`Trading PAUSED: ${reason} (${req.user?.login})`);
    }

    res.json({ ok: true, paused, reason });
  });

  /** Render Cron: POST з секретом у заголовку X-Trading-Cron-Secret */
  app.post('/api/trading/cron/scan', async (req, res) => {
    const secret = process.env.TRADING_CRON_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'TRADING_CRON_SECRET not configured' });
    }
    const header = req.headers['x-trading-cron-secret'];
    if (header !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await runTradingScan(getAssistantConnection, { triggeredBy: 'render-cron' });
    res.json(result);
  });
}

module.exports = { registerTradingRoutes, isTradingAdmin };
