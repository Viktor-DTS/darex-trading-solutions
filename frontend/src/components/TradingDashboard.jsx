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
  if (regime === 'risk_on') return 'РИЗИК-ON';
  if (regime === 'risk_off') return 'РИЗИК-OFF';
  if (regime === 'elevated') return 'ПІДВИЩЕНИЙ';
  return regime || '—';
}

function modeLabel(mode) {
  if (mode === 'live') return 'live';
  if (mode === 'simulate') return 'симуляція';
  return 'paper';
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(2)}%`;
}

function fmtDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('uk-UA');
}

function tradeStatusClass(status) {
  if (status === 'open') return 'trading-trade-open';
  if (status === 'closed') return 'trading-trade-closed';
  if (status === 'pending_ibkr') return 'trading-trade-pending';
  if (status === 'pending_sim') return 'trading-trade-pending-sim';
  if (status === 'cancelled') return 'trading-trade-cancelled';
  return '';
}

function exitReasonLabel(reason) {
  if (reason === 'stop') return 'Stop-loss';
  if (reason === 'take_profit') return 'Take-profit';
  if (reason === 'manual') return 'Вручну';
  return reason || '—';
}

function pnlClass(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  if (n > 0) return 'trading-pnl-pos';
  if (n < 0) return 'trading-pnl-neg';
  return '';
}

export default function TradingDashboard({ user, embedded = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [busy, setBusy] = useState('');
  const [tradesData, setTradesData] = useState(null);
  const [tradesFilter, setTradesFilter] = useState('all');
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesSyncing, setTradesSyncing] = useState(false);

  const patchSettings = async (patch) => {
    setBusy('settings');
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/trading/settings`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Settings failed');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const testTelegram = async () => {
    setBusy('telegram');
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/trading/telegram/test`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Telegram test failed');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const testIbkr = async () => {
    setBusy('ibkr');
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/trading/ibkr/test`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'IBKR test failed');
      await load();
      setError('');
      window.alert(`IBKR OK: ${json.message}${json.accountIds?.length ? `\nAccounts: ${json.accountIds.join(', ')}` : ''}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const loadTrades = useCallback(async (status = tradesFilter) => {
    setTradesLoading(true);
    try {
      const qs = status && status !== 'all' ? `?status=${encodeURIComponent(status)}&limit=200` : '?limit=200';
      const res = await fetch(`${API_BASE_URL}/trading/trades${qs}`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setTradesData(await res.json());
    } catch (e) {
      setError(e.message || 'Помилка завантаження угод');
    } finally {
      setTradesLoading(false);
    }
  }, [tradesFilter]);

  const syncTrades = async () => {
    setTradesSyncing(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/trading/trades/sync`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok && !json.skipped) {
        throw new Error(json.error || json.message || `HTTP ${res.status}`);
      }
      await loadTrades(tradesFilter);
    } catch (e) {
      setError(e.message || 'Помилка синхронізації IBKR');
    } finally {
      setTradesSyncing(false);
    }
  };

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

  useEffect(() => {
    if (tab === 'trades') {
      loadTrades(tradesFilter);
    }
  }, [tab, tradesFilter, loadTrades]);

  const runDemoSimTrade = async () => {
    setBusy('demoSim');
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/trading/simulate/demo`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Demo trade failed');
      await load();
      if (tab === 'trades') await loadTrades(tradesFilter);
      window.alert(`Сим-угода відкрита: ${json.trade?.symbol} · ${json.trade?.quantity} @ ${json.trade?.entryPrice}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

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
      if (tab === 'trades') await loadTrades(tradesFilter);
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
  const pendingTrades = data?.pendingTrades || [];
  const integrations = data?.integrations || {};
  const isSimMode = settings.mode === 'simulate';

  return (
    <div className={`trading-page${embedded ? ' trading-page-embedded' : ''}`}>
      <header className="trading-header">
        <div>
          <h1>Торгівля — IBKR (зростання капіталу)</h1>
          <p className="trading-sub">
            {user?.login} · режим <strong>{modeLabel(settings.mode)}</strong>
            · авто <strong>{settings.autoEnabled ? 'УВІМК' : 'ВИМК'}</strong>
            {isSimMode && <span className="trading-sim-badge"> без IBKR</span>}
          </p>
        </div>
        <div className="trading-header-actions">
          <button type="button" className="trading-btn" onClick={runScan} disabled={scanning}>
            {scanning ? 'Сканування…' : '▶ Сканувати'}
          </button>
          <button
            type="button"
            className={risk.tradingPaused ? 'trading-btn trading-btn-warn' : 'trading-btn trading-btn-danger'}
            onClick={togglePause}
          >
            {risk.tradingPaused ? '▶ Продовжити' : '⏸ Пауза'}
          </button>
          <button type="button" className="trading-btn trading-btn-ghost" onClick={load}>
            ↻
          </button>
        </div>
      </header>

      {error && <div className="trading-error">{error}</div>}

      <nav className="trading-tabs">
        {[
          ['dashboard', 'Огляд'],
          ['signals', 'Сигнали'],
          ['trades', 'Угоди'],
          ['external', 'Макро'],
          ['risk', 'Ризик'],
          ['settings', 'Налаштування'],
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
            <div className="trading-card-label">Капітал (config)</div>
            <div className="trading-card-value">${settings.equityUsd ?? '—'}</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Режим / VIX</div>
            <div className="trading-card-value">
              {regimeLabel(risk.regime || external.regime)} · {risk.vix ?? external.vix ?? '—'}
            </div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Просадка</div>
            <div className="trading-card-value">{risk.currentDrawdownPct ?? 0}%</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Відкриті позиції</div>
            <div className="trading-card-value">{openTrades.length}</div>
          </div>
          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">Останній скан</div>
            <div className="trading-card-value trading-card-value-sm">
              {risk.lastScanAt ? new Date(risk.lastScanAt).toLocaleString('uk-UA') : '—'}
              {risk.lastScanStatus ? ` · ${risk.lastScanStatus}` : ''}
              {risk.lastTriggeredBy ? ` · ${risk.lastTriggeredBy}` : ''}
            </div>
            {risk.lastCronAt && (
              <div className="trading-card-value trading-card-value-sm trading-muted">
                Cron: {new Date(risk.lastCronAt).toLocaleString('uk-UA')}
              </div>
            )}
            {risk.tradingPaused && (
              <div className="trading-paused-banner">⏸ ПАУЗА: {risk.pauseReason || 'вручну'}</div>
            )}
          </div>
          {pendingTrades.length > 0 && (
            <div className="trading-card trading-card-wide">
              <div className="trading-card-label">Очікують виконання ({pendingTrades.length})</div>
              <ul className="trading-pending-list">
                {pendingTrades.map((t) => (
                  <li key={t._id}>
                    <strong>{t.symbol}</strong> · {t.quantity} @ {t.entryPrice} · SL {t.stopLoss} · TP {t.takeProfit}
                    {t.status === 'pending_sim' ? ' · SIM LMT' : ' · IBKR'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'signals' && (
        <div className="trading-table-wrap">
          <table className="trading-table">
            <thead>
              <tr>
                <th>Час</th>
                <th>Тикер</th>
                <th>Дія</th>
                <th>Бали</th>
                <th>Вхід / SL / TP</th>
                <th>Причина</th>
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
                <tr><td colSpan={6} className="trading-muted">Немає сигналів — натисни «Сканувати»</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'trades' && (
        <div className="trading-trades">
          <div className="trading-trades-toolbar">
            <select
              className="trading-trades-filter"
              value={tradesFilter}
              onChange={(e) => setTradesFilter(e.target.value)}
            >
              <option value="all">Усі угоди</option>
              <option value="open">Відкриті</option>
              <option value="closed">Закриті</option>
              <option value="pending_ibkr">Очікують IBKR</option>
              <option value="pending_sim">Очікують LMT (sim)</option>
              <option value="cancelled">Скасовані</option>
            </select>
            {!isSimMode && (
              <button
                type="button"
                className="trading-btn"
                onClick={syncTrades}
                disabled={tradesSyncing || tradesLoading}
              >
                {tradesSyncing ? 'Синх…' : '⟳ IBKR sync'}
              </button>
            )}
            <button
              type="button"
              className="trading-btn trading-btn-ghost"
              onClick={() => loadTrades(tradesFilter)}
              disabled={tradesLoading}
            >
              {tradesLoading ? '…' : '↻ Оновити'}
            </button>
          </div>

          {(tradesData?.lastIbkrSyncAt || tradesData?.lastIbkrSyncStatus) && !isSimMode && (
            <p className="trading-hint trading-trades-sync-meta">
              Останній IBKR sync:{' '}
              {tradesData.lastIbkrSyncAt
                ? fmtDateTime(tradesData.lastIbkrSyncAt)
                : '—'}
              {tradesData.lastIbkrSyncStatus ? ` · ${tradesData.lastIbkrSyncStatus}` : ''}
            </p>
          )}

          {tradesData?.summary && (
            <div className="trading-grid trading-trades-summary">
              <div className="trading-card">
                <div className="trading-card-label">Усього угод</div>
                <div className="trading-card-value">{tradesData.summary.total}</div>
              </div>
              <div className="trading-card">
                <div className="trading-card-label">Закриті / відкриті</div>
                <div className="trading-card-value trading-card-value-sm">
                  {tradesData.summary.closed} / {tradesData.summary.open}
                </div>
              </div>
              <div className="trading-card">
                <div className="trading-card-label">{isSimMode ? 'Очікують LMT' : 'Очікують IBKR'}</div>
                <div className="trading-card-value">
                  {isSimMode ? (tradesData.summary.pendingSim ?? 0) : (tradesData.summary.pendingIbkr ?? tradesData.summary.pending)}
                </div>
              </div>
              <div className="trading-card">
                <div className="trading-card-label">Сумарний P/L</div>
                <div className={`trading-card-value ${pnlClass(tradesData.summary.totalPnlUsd)}`}>
                  {fmtMoney(tradesData.summary.totalPnlUsd)}
                </div>
              </div>
              <div className="trading-card">
                <div className="trading-card-label">Комісії / збори</div>
                <div className="trading-card-value trading-card-value-sm">
                  {fmtMoney(tradesData.summary.totalFeesUsd)}
                </div>
              </div>
              <div className="trading-card">
                <div className="trading-card-label">Win / Loss</div>
                <div className="trading-card-value trading-card-value-sm">
                  {tradesData.summary.winners} / {tradesData.summary.losers}
                </div>
              </div>
            </div>
          )}

          <div className="trading-table-wrap">
            <table className="trading-table trading-table-trades">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Купівля</th>
                  <th>Тикер</th>
                  <th>К-сть</th>
                  <th>Ціна входу</th>
                  <th>Сума покупки</th>
                  <th>Продаж</th>
                  <th>Ціна виходу</th>
                  <th>Сума продажу</th>
                  <th>Комісія</th>
                  <th>P/L</th>
                  <th>P/L %</th>
                  <th>Вихід</th>
                </tr>
              </thead>
              <tbody>
                {(tradesData?.trades || []).map((t) => (
                  <tr key={t._id}>
                    <td>
                      <span className={`trading-badge ${tradeStatusClass(t.status)}`}>
                        {t.statusLabel || t.status}
                      </span>
                    </td>
                    <td>{fmtDateTime(t.openedAt)}</td>
                    <td><strong>{t.symbol}</strong></td>
                    <td>{t.quantity ?? '—'}</td>
                    <td>{t.entryPrice != null ? fmtMoney(t.entryPrice) : '—'}</td>
                    <td>{fmtMoney(t.buyTotalUsd)}</td>
                    <td>{fmtDateTime(t.closedAt)}</td>
                    <td>{t.exitPrice != null ? fmtMoney(t.exitPrice) : '—'}</td>
                    <td>{fmtMoney(t.sellTotalUsd)}</td>
                    <td>{fmtMoney(t.totalFeesUsd)}</td>
                    <td className={pnlClass(t.pnlUsd)}>{fmtMoney(t.pnlUsd)}</td>
                    <td className={pnlClass(t.pnlPct)}>{fmtPct(t.pnlPct)}</td>
                    <td>{exitReasonLabel(t.exitReason)}</td>
                  </tr>
                ))}
                {!tradesLoading && !(tradesData?.trades || []).length && (
                  <tr>
                    <td colSpan={13} className="trading-muted">
                      Ще немає угод. Увімкни авто-торгівлю та запусти скан — записи з’являться тут.
                    </td>
                  </tr>
                )}
                {tradesLoading && !(tradesData?.trades || []).length && (
                  <tr><td colSpan={13} className="trading-muted">Завантаження угод…</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="trading-hint trading-trades-hint">
            {isSimMode
              ? 'Симуляція: ціни з Yahoo/Stooq, limit-вхід, stop/take-profit на кожному скані. IBKR не використовується.'
              : 'Після кожного скану бот автоматично синхронізує угоди з IBKR (fills + позиції, ~7 днів). Кнопка «IBKR sync» — вручну.'}
          </p>
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
            <div className="trading-card-label">Режим ринку</div>
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
            <div className="trading-card-label">Ризик / угода</div>
            <div className="trading-card-value">{settings.riskPerTradePct}%</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Макс. позицій</div>
            <div className="trading-card-value">{settings.maxOpenPositions}</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Денний ліміт збитку</div>
            <div className="trading-card-value">{settings.dailyLossLimitPct}%</div>
          </div>
          <div className="trading-card">
            <div className="trading-card-label">Макс. просадка</div>
            <div className="trading-card-value">{settings.maxDrawdownPct}%</div>
          </div>
          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">Розподіл портфеля</div>
            <div className="trading-card-value trading-card-value-sm">
              Core {settings.coreAllocationPct}% · Growth {settings.growthAllocationPct}% · Cash {settings.cashAllocationPct}%
            </div>
          </div>
          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">Список спостереження</div>
            <div className="trading-watchlist">
              {(settings.watchlist || []).map((s) => (
                <span key={s} className="trading-tag">{s}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="trading-settings">
          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">Авто-торгівля</div>
            <div className="trading-settings-row">
              <label>
                <input
                  type="checkbox"
                  checked={!!settings.autoEnabled}
                  onChange={(e) => patchSettings({ autoEnabled: e.target.checked })}
                  disabled={busy === 'settings'}
                />
                {' '}Авто УВІМК ({isSimMode ? 'BUY → сим-угоди' : 'BUY → черга IBKR'})
              </label>
              <select
                value={settings.mode || 'paper'}
                onChange={(e) => patchSettings({ mode: e.target.value })}
                disabled={busy === 'settings'}
              >
                <option value="simulate">simulate (без IBKR)</option>
                <option value="paper">paper</option>
                <option value="live">live</option>
              </select>
            </div>
            {isSimMode && (
              <div className="trading-settings-row">
                <label>
                  Комісія / сторона ($):
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.simCommissionPerSideUsd ?? 1}
                    onChange={(e) => patchSettings({ simCommissionPerSideUsd: Number(e.target.value) })}
                    disabled={busy === 'settings'}
                    className="trading-input-num"
                  />
                </label>
                <button
                  type="button"
                  className="trading-btn"
                  onClick={runDemoSimTrade}
                  disabled={busy === 'demoSim'}
                >
                  {busy === 'demoSim' ? '…' : '▶ Тестова сим-угода'}
                </button>
              </div>
            )}
            {isSimMode && (
              <p className="trading-hint">
                1) Увімкни <strong>simulate</strong> + <strong>Авто</strong> → «Сканувати» для реальних BUY-сигналів.
                2) Або «Тестова сим-угода» — одразу відкриває позицію по SPY/watchlist з SL/TP.
                3) Кожен наступний скан перевіряє stop/take-profit по Yahoo-ціні.
              </p>
            )}
          </div>

          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">1 · Render Cron</div>
            <p className="trading-muted">
              {integrations.cronConfigured ? '✅ TRADING_CRON_SECRET задано' : '❌ Додай TRADING_CRON_SECRET на Render'}
            </p>
            <p className="trading-hint">
              Render → Cron Jobs → POST <code>/api/trading/cron/scan</code> · header{' '}
              <code>X-Trading-Cron-Secret</code> · schedule <code>0 * * * *</code>
            </p>
          </div>

          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">2 · Telegram BUY-алерти</div>
            <p className="trading-muted">
              {integrations.telegramConfigured ? '✅ Telegram налаштовано' : '❌ TELEGRAM_BOT_TOKEN + TRADING_TELEGRAM_CHAT_ID'}
            </p>
            <button type="button" className="trading-btn" onClick={testTelegram} disabled={busy === 'telegram'}>
              {busy === 'telegram' ? '…' : 'Тест Telegram'}
            </button>
          </div>

          <div className={`trading-card trading-card-wide${isSimMode ? ' trading-card-muted' : ''}`}>
            <div className="trading-card-label">3 · IBKR OAuth</div>
            {isSimMode ? (
              <p className="trading-muted">⏸ Не потрібно в режимі simulate</p>
            ) : (
              <>
                <p className="trading-muted">{integrations.ibkr?.message || '—'}</p>
                {integrations.ibkr?.missingEnv?.length > 0 && (
                  <p className="trading-hint trading-hint-warn">
                    Не вистачає: {integrations.ibkr.missingEnv.join(', ')}
                  </p>
                )}
                <p className="trading-hint">
                  IBKR Self-Service Portal → OAuth keys → Render env:
                  IBKR_CONSUMER_KEY, IBKR_ACCESS_TOKEN, IBKR_ACCESS_SECRET_HEX,
                  IBKR_SIGNATURE_PRIVATE_KEY_B64, IBKR_DH_PRIME_HEX, IBKR_ACCOUNT_ID.
                  Потім IBKR_LIVE_ORDERS=1.
                </p>
                <button type="button" className="trading-btn" onClick={testIbkr} disabled={busy === 'ibkr'}>
                  {busy === 'ibkr' ? '…' : 'Тест з’єднання IBKR'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
