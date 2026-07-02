const mongoose = require('mongoose');

let modelsInitialized = false;
let TradingSettings = null;
let TradingSignal = null;
let TradingTrade = null;
let TradingRiskState = null;
let TradingExternalSnapshot = null;

function initTradingModels(getAssistantConnection) {
  const conn = getAssistantConnection();
  if (!conn || conn.readyState !== 1) {
    return { conn: null };
  }

  if (!modelsInitialized) {
    const settingsSchema = new mongoose.Schema(
      {
        key: { type: String, default: 'global', unique: true },
        mode: { type: String, enum: ['paper', 'live', 'simulate'], default: 'paper' },
        autoEnabled: { type: Boolean, default: false },
        simCommissionPerSideUsd: { type: Number, default: 1 },
        watchlist: { type: [String], default: ['VOO', 'SPY', 'AAPL', 'MSFT', 'NVDA'] },
        riskPerTradePct: { type: Number, default: 0.8 },
        maxOpenPositions: { type: Number, default: 2 },
        dailyLossLimitPct: { type: Number, default: 2 },
        weeklyLossLimitPct: { type: Number, default: 5 },
        maxDrawdownPct: { type: Number, default: 15 },
        equityUsd: { type: Number, default: 1700 },
        coreAllocationPct: { type: Number, default: 55 },
        growthAllocationPct: { type: Number, default: 30 },
        cashAllocationPct: { type: Number, default: 15 },
      },
      { timestamps: true },
    );

    const signalSchema = new mongoose.Schema(
      {
        symbol: { type: String, required: true, index: true },
        action: { type: String, enum: ['BUY', 'SELL', 'HOLD', 'SKIP'], required: true },
        technicalScore: Number,
        externalScore: Number,
        sentimentScore: Number,
        finalScore: Number,
        entryPrice: Number,
        stopLoss: Number,
        takeProfit: Number,
        riskPct: Number,
        positionSizeUsd: Number,
        reason: String,
        meta: mongoose.Schema.Types.Mixed,
        scanId: String,
      },
      { timestamps: true },
    );
    signalSchema.index({ createdAt: -1 });
    signalSchema.index({ symbol: 1, createdAt: -1 });

    const tradeSchema = new mongoose.Schema(
      {
        symbol: String,
        side: { type: String, enum: ['long', 'short'], default: 'long' },
        status: {
          type: String,
          enum: ['open', 'closed', 'cancelled', 'pending_ibkr', 'pending_sim'],
          default: 'open',
        },
        entryPrice: Number,
        exitPrice: Number,
        quantity: Number,
        stopLoss: Number,
        takeProfit: Number,
        pnlUsd: Number,
        pnlPct: Number,
        commissionUsd: { type: Number, default: 0 },
        feesUsd: { type: Number, default: 0 },
        exitReason: {
          type: String,
          enum: ['stop', 'take_profit', 'manual', 'unknown', ''],
          default: '',
        },
        openedAt: Date,
        closedAt: Date,
        source: { type: String, default: 'scan' },
        signalId: { type: mongoose.Schema.Types.ObjectId, ref: 'TradingSignal' },
        ibkrOrderId: String,
        ibkrBuyExecId: String,
        ibkrSellExecId: String,
        ibkrSyncedAt: Date,
        notes: String,
      },
      { timestamps: true },
    );
    tradeSchema.index({ status: 1, openedAt: -1 });
    tradeSchema.index({ closedAt: -1 });

    const riskSchema = new mongoose.Schema(
      {
        key: { type: String, default: 'global', unique: true },
        tradingPaused: { type: Boolean, default: false },
        pauseReason: String,
        dailyPnlUsd: { type: Number, default: 0 },
        weeklyPnlUsd: { type: Number, default: 0 },
        equityHighUsd: Number,
        currentDrawdownPct: { type: Number, default: 0 },
        openPositionsCount: { type: Number, default: 0 },
        lastScanAt: Date,
        lastScanStatus: String,
        lastTriggeredBy: String,
        lastCronAt: Date,
        lastIbkrSyncAt: Date,
        lastIbkrSyncStatus: String,
        vix: Number,
        regime: { type: String, default: 'unknown' },
      },
      { timestamps: true },
    );

    const externalSchema = new mongoose.Schema(
      {
        vix: Number,
        regime: String,
        us10y: Number,
        macroNotes: [String],
        symbols: mongoose.Schema.Types.Mixed,
        scanId: String,
      },
      { timestamps: true },
    );
    externalSchema.index({ createdAt: -1 });

    TradingSettings = conn.model('TradingSettings', settingsSchema);
    TradingSignal = conn.model('TradingSignal', signalSchema);
    TradingTrade = conn.model('TradingTrade', tradeSchema);
    TradingRiskState = conn.model('TradingRiskState', riskSchema);
    TradingExternalSnapshot = conn.model('TradingExternalSnapshot', externalSchema);
    modelsInitialized = true;
  }

  return {
    conn,
    TradingSettings,
    TradingSignal,
    TradingTrade,
    TradingRiskState,
    TradingExternalSnapshot,
  };
}

async function ensureDefaultSettings(models) {
  if (!models?.TradingSettings) return null;
  let doc = await models.TradingSettings.findOne({ key: 'global' }).lean();
  if (!doc) {
    doc = (
      await models.TradingSettings.create({
        key: 'global',
      })
    ).toObject();
  }
  return doc;
}

async function ensureRiskState(models) {
  if (!models?.TradingRiskState) return null;
  let doc = await models.TradingRiskState.findOne({ key: 'global' }).lean();
  if (!doc) {
    doc = (
      await models.TradingRiskState.create({
        key: 'global',
        equityHighUsd: 1700,
      })
    ).toObject();
  }
  return doc;
}

module.exports = {
  initTradingModels,
  ensureDefaultSettings,
  ensureRiskState,
};
