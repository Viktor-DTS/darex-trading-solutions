const {
  initTradingModels,
  ensureDefaultSettings,
  ensureRiskState,
} = require('./tradingModels');
const { runTradingScan } = require('./tradingScan');
const { notifyTradingAlert, sendTelegramTest, isTelegramConfigured, isBuyOnlyTelegram } = require('./tradingTelegram');
const { getIbkrStatus, testIbkrConnection } = require('./ibkrClient');
const { enrichTrade, summarizeTrades } = require('./tradingTrades');
const { syncTradesFromIbkr } = require('./ibkrTradeSync');
const { createDemoSimulationTrade, isSimulationMode } = require('./tradeSimulator');

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
      cronConfigured: Boolean(process.env.TRADING_CRON_SECRET),
      telegramConfigured: isTelegramConfigured(),
      ibkr: getIbkrStatus(),
      settings,
      risk,
    });
  });

  app.get('/api/trading/integrations', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const models = initTradingModels(getAssistantConnection);
    const risk = models.conn ? await ensureRiskState(models) : null;
    res.json({
      cron: {
        configured: Boolean(process.env.TRADING_CRON_SECRET),
        lastRunAt: risk?.lastCronAt || null,
        scheduleHint: 'Render Cron → POST /api/trading/cron/scan · header X-Trading-Cron-Secret · 0 * * * *',
        backendUrl: process.env.TRADING_CRON_URL || 'https://darex-trading-solutions.onrender.com/api/trading/cron/scan',
      },
      telegram: {
        configured: isTelegramConfigured(),
        buyOnly: isBuyOnlyTelegram(),
        chatIdSet: Boolean(process.env.TRADING_TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID),
      },
      ibkr: getIbkrStatus(),
      intervalScan: process.env.TRADING_SCAN_ENABLED === '1',
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

    const [settings, risk, signals, trades, pending, external] = await Promise.all([
      ensureDefaultSettings(models),
      ensureRiskState(models),
      models.TradingSignal.find().sort({ createdAt: -1 }).limit(30).lean(),
      models.TradingTrade.find({ status: 'open' }).sort({ openedAt: -1 }).lean(),
      models.TradingTrade.find({ status: { $in: ['pending_ibkr', 'pending_sim'] } }).sort({ createdAt: -1 }).limit(20).lean(),
      models.TradingExternalSnapshot.findOne().sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      settings,
      risk,
      openTrades: trades,
      pendingTrades: pending,
      recentSignals: signals,
      external: external || null,
      integrations: {
        cronConfigured: Boolean(process.env.TRADING_CRON_SECRET),
        telegramConfigured: isTelegramConfigured(),
        ibkr: getIbkrStatus(),
      },
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

  app.get('/api/trading/trades', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const models = initTradingModels(getAssistantConnection);
    if (!models.conn) return res.status(503).json({ error: 'Assistant MongoDB недоступна' });

    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500);
    const statusFilter = String(req.query.status || 'all').toLowerCase();

    const query = {};
    if (statusFilter !== 'all') {
      const allowed = new Set(['open', 'closed', 'pending_ibkr', 'pending_sim', 'cancelled']);
      if (!allowed.has(statusFilter)) {
        return res.status(400).json({ error: 'status must be open|closed|pending_ibkr|pending_sim|cancelled|all' });
      }
      query.status = statusFilter;
    }

    const rows = await models.TradingTrade.find(query)
      .sort({ openedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const trades = rows.map(enrichTrade);
    const risk = await ensureRiskState(models);
    res.json({
      trades,
      summary: summarizeTrades(trades),
      limit,
      status: statusFilter,
      lastIbkrSyncAt: risk?.lastIbkrSyncAt || null,
      lastIbkrSyncStatus: risk?.lastIbkrSyncStatus || null,
    });
  });

  app.post('/api/trading/trades/sync', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const models = initTradingModels(getAssistantConnection);
    if (!models.conn) return res.status(503).json({ error: 'Assistant MongoDB недоступна' });

    const result = await syncTradesFromIbkr(models, { triggeredBy: `manual:${req.user?.login || 'api'}` });
    if (!result.ok && !result.skipped) {
      return res.status(400).json(result);
    }
    res.json(result);
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
      'strategyProfile',
      'activeWatchlist',
      'activeChartInterval',
      'activeChartRange',
      'activeMinScore',
      'activeMinExternal',
      'targetProfitPerTradeUsd',
      'targetRiskPerTradeUsd',
      'dailyProfitTargetUsd',
      'dailyLossLimitUsd',
      'maxTradesPerDay',
      'eodFlattenEnabled',
      'riskPerTradePct',
      'maxOpenPositions',
      'dailyLossLimitPct',
      'weeklyLossLimitPct',
      'maxDrawdownPct',
      'equityUsd',
      'simCommissionPerSideUsd',
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
    if (patch.activeWatchlist && !Array.isArray(patch.activeWatchlist)) {
      return res.status(400).json({ error: 'activeWatchlist must be array' });
    }
    if (patch.activeWatchlist) {
      patch.activeWatchlist = patch.activeWatchlist.map((s) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 10);
    }
    if (patch.strategyProfile && !['swing', 'active'].includes(patch.strategyProfile)) {
      return res.status(400).json({ error: 'strategyProfile must be swing or active' });
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

  app.post('/api/trading/telegram/test', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const result = await sendTelegramTest();
    if (!result.ok) {
      return res.status(400).json({ error: result.reason || 'Telegram failed' });
    }
    res.json({ ok: true });
  });

  app.get('/api/trading/ibkr/status', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    res.json(getIbkrStatus());
  });

  app.post('/api/trading/ibkr/test', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const result = await testIbkrConnection();
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  });

  app.post('/api/trading/trades/:id/cancel', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const models = initTradingModels(getAssistantConnection);
    if (!models.conn) return res.status(503).json({ error: 'Assistant MongoDB недоступна' });

    const trade = await models.TradingTrade.findById(req.params.id);
    if (!trade) return res.status(404).json({ error: 'Угоду не знайдено' });

    const cancellable = new Set(['open', 'pending_sim', 'pending_ibkr']);
    if (!cancellable.has(trade.status)) {
      return res.status(400).json({ error: `Неможна скасувати статус ${trade.status}` });
    }

    const note = `[${req.user?.login || 'admin'}] cancelled manually`;
    await models.TradingTrade.updateOne(
      { _id: trade._id },
      {
        $set: {
          status: 'cancelled',
          closedAt: new Date(),
          notes: trade.notes ? `${trade.notes} | ${note}` : note,
        },
      },
    );

    res.json({ ok: true, id: trade._id, symbol: trade.symbol });
  });

  app.post('/api/trading/simulate/demo', async (req, res) => {
    if (!isTradingAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const models = initTradingModels(getAssistantConnection);
    if (!models.conn) return res.status(503).json({ error: 'Assistant MongoDB недоступна' });

    const settings = await ensureDefaultSettings(models);
    if (!isSimulationMode(settings)) {
      return res.status(400).json({ error: 'Увімкніть режим simulate в налаштуваннях' });
    }

    try {
      const symbol = req.body?.symbol;
      const result = await createDemoSimulationTrade(models, settings, symbol);
      res.json({ ok: true, ...result });
    } catch (err) {
      const status = err.code === 'DUPLICATE' ? 409 : 400;
      res.status(status).json({ ok: false, error: err.message });
    }
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
