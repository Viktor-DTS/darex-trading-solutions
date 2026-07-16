const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../state');

function forecastPath(fileName = 'oracle-forecasts.jsonl') {
  return path.join(DATA_DIR, fileName);
}

function actualPath(fileName = 'oracle-actual.jsonl') {
  return path.join(DATA_DIR, fileName);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function appendJsonl(file, obj) {
  ensureDataDir();
  fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
}

function readJsonl(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim().split(/\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch (_) {
    return [];
  }
}

function appendForecast(oracle, cfg = {}) {
  const file = cfg.forecastLog || 'oracle-forecasts.jsonl';
  const row = {
    ts: new Date().toISOString(),
    type: 'forecast',
    ...oracle,
  };
  appendJsonl(forecastPath(file), row);
  return row;
}

function appendActual(actual, cfg = {}) {
  const file = cfg.actualLog || 'oracle-actual.jsonl';
  const row = {
    ts: new Date().toISOString(),
    type: 'actual',
    ...actual,
  };
  appendJsonl(actualPath(file), row);
  return row;
}

function readForecasts(limit = 200, cfg = {}) {
  const file = cfg.forecastLog || 'oracle-forecasts.jsonl';
  return readJsonl(forecastPath(file)).slice(-limit);
}

function readActuals(limit = 500, cfg = {}) {
  const file = cfg.actualLog || 'oracle-actual.jsonl';
  return readJsonl(actualPath(file)).slice(-limit);
}

function loadPendingForecasts(cfg = {}) {
  const forecasts = readForecasts(2000, cfg);
  const actuals = readActuals(5000, cfg);
  const reconciled = new Set(actuals.map((a) => a.oracleId).filter(Boolean));
  const pending = new Map();
  for (const f of forecasts) {
    if (!f.oracleId || reconciled.has(f.oracleId)) continue;
    pending.set(f.oracleId, f);
  }
  return pending;
}

module.exports = {
  appendForecast,
  appendActual,
  readForecasts,
  readActuals,
  loadPendingForecasts,
  forecastPath,
  actualPath,
};
