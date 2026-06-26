import React, { useCallback, useEffect, useState } from 'react';
import API_BASE_URL from '../config';
import './TradingDashboard.css';

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

function actionClass(action) {
  const a = String(action || '').toUpperCase();
  if (a === 'BUY') return 'trading-action-buy';
  if (a === 'SELL') return 'trading-action-sell';
  if (a === 'HOLD') return 'trading-action-hold';
  return 'trading-action-skip';
}

function regimeLabel(regime) {
  if (regime === 'risk_on') return 'RISK-ON';
  if (regime === 'risk_off') return 'RISK-OFF';
  if (regime === 'elevated') return 'ELEVATED';
  return regime || '—';
}

export default function TradingDashboard({ user, embedded = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState('dashboard');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/trading/dashboard`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message || 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const runScan = async () => {
    setScanning(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/trading/scan`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Scan failed');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const togglePause = async () => {
    const paused = !(data?.risk?.tradingPaused);
    try {
      const res = await fetch(`${API_BASE_URL}/trading/pause`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ paused, reason: paused ? 'manual from dashboard' : '' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Pause failed');
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading && !data) {
    return <div className="trading-page"><p className="trading-muted">Завантаження trading…</p></div>;
  }

  const settings = data?.settings || {};
  const risk = data?.risk || {};
  const external = data?.external || {};
  const signals = data?.recentSignals || [];
  const openTrades = data?.openTrades || [];

  return (
    <div className={`trading-page${embedded ? ' trading-page-embedded' : ''}`}>
      <header className="trading-header">
        <div>
          <h1>Trading — IBKR Capital Growth</h1>
          <p className="trading-sub">
            {user?.login} · режим <strong>{settings.mode || 'paper'}</strong>
            · auto <strong>{settings.autoEnabled ? 'ON' : 'OFF'}</strong>
          </p>
        </div>
        <div className="trading-header-actions">
          <button type="button" className="trading-btn" onClick={runScan} disabled={scanning}>
            {scanning ? 'Сканування…' : '▶ Scan now'}
          </button>
          <button
            type="button"
            className={risk.tradingPaused ? 'trading-btn trading-btn-warn' : 'trading-btn trading-btn-danger'}
            onClick={togglePause}
          >
            {risk.tradingPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button type="button" className="trading-btn trading-btn-ghost" onClick={load}>
            ↻
          </button>
        </div>
      </header>

      {error && <div className="trading-error">{error}</div>}

      <nav className="trading-tabs">
        {[
          ['dashboard', 'Dashboard'],
          ['signals', 'Signals'],
          ['external', 'External'],
          ['risk', 'Risk'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`trading-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && (
        <div className="trading-grid">
          <div className="trading-card">
            <div className="trading-card-label">Equity (config)</div>
            <div className="trading-card-value">${settings.equityUsd ?? '—'}</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Regime / VIX</div>
            <div className="trading-card-value">
              {regimeLabel(risk.regime || external.regime)} · {risk.vix ?? external.vix ?? '—'}
            </div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Drawdown</div>
            <div className="trading-card-value">{risk.currentDrawdownPct ?? 0}%</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Open positions</div>
            <div className="trading-card-value">{openTrades.length}</div>
          </div>
          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">Last scan</div>
            <div className="trading-card-value trading-card-value-sm">
              {risk.lastScanAt ? new Date(risk.lastScanAt).toLocaleString('uk-UA') : '—'}
              {risk.lastScanStatus ? ` · ${risk.lastScanStatus}` : ''}
            </div>
            {risk.tradingPaused && (
              <div className="trading-paused-banner">⏸ PAUSED: {risk.pauseReason || 'manual'}</div>
            )}
          </div>
        </div>
      )}

      {tab === 'signals' && (
        <div className="trading-table-wrap">
          <table className="trading-table">
            <thead>
              <tr>
                <th>Час</th>
                <th>Symbol</th>
                <th>Action</th>
                <th>Scores</th>
                <th>Entry / SL / TP</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s._id}>
                  <td>{new Date(s.createdAt).toLocaleString('uk-UA')}</td>
                  <td><strong>{s.symbol}</strong></td>
                  <td><span className={`trading-badge ${actionClass(s.action)}`}>{s.action}</span></td>
                  <td>T{s.technicalScore} E{s.externalScore} F{s.finalScore}</td>
                  <td>
                    {s.entryPrice ?? '—'} / {s.stopLoss ?? '—'} / {s.takeProfit ?? '—'}
                  </td>
                  <td className="trading-reason">{s.reason}</td>
                </tr>
              ))}
              {!signals.length && (
                <tr><td colSpan={6} className="trading-muted">Немає сигналів — натисни Scan now</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'external' && (
        <div className="trading-external">
          <div className="trading-card">
            <div className="trading-card-label">VIX</div>
            <div className="trading-card-value">{external.vix ?? risk.vix ?? '—'}</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">US 10Y (^TNX)</div>
            <div className="trading-card-value">{external.us10y ?? '—'}</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Regime</div>
            <div className="trading-card-value">{regimeLabel(external.regime || risk.regime)}</div>
          </div>
          {Array.isArray(external.macroNotes) && external.macroNotes.length > 0 && (
            <ul className="trading-notes">
              {external.macroNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'risk' && (
        <div className="trading-risk-grid">
          <div className="trading-card">
            <div className="trading-card-label">Risk / trade</div>
            <div className="trading-card-value">{settings.riskPerTradePct}%</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Max positions</div>
            <div className="trading-card-value">{settings.maxOpenPositions}</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Daily loss limit</div>
            <div className="trading-card-value">{settings.dailyLossLimitPct}%</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Max drawdown</div>
            <div className="trading-card-value">{settings.maxDrawdownPct}%</div>
          </div>
          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">Portfolio split</div>
            <div className="trading-card-value trading-card-value-sm">
              Core {settings.coreAllocationPct}% · Growth {settings.growthAllocationPct}% · Cash {settings.cashAllocationPct}%
            </div>
          </div>
          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">Watchlist</div>
            <div className="trading-watchlist">
              {(settings.watchlist || []).map((s) => (
                <span key={s} className="trading-tag">{s}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
