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

function strategyLabel(profile) {
  if (profile === 'active') return 'Active ($5–15/день)';
  return 'Swing';
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

function signalBuyRank(s) {
  return s?.meta?.buyRank ?? s?.buyRank ?? null;
}

function signalSelectedForEntry(s) {
  if (s?.action === 'BUY') return true;
  return s?.meta?.selectedForEntry === true;
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

  const cancelTrade = async (tradeId) => {
    setBusy(`cancel-${tradeId}`);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/trading/trades/${tradeId}/cancel`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Cancel failed');
      await loadTrades(tradesFilter);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

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
        body: JSON.stringify({ paused, reason: paused ? 'вручну з панелі' : '' }),
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
  const isActiveMode = settings.strategyProfile === 'active';
  const latestScanId = signals[0]?.scanId;
  const latestScanSignals = latestScanId
    ? signals.filter((s) => s.scanId === latestScanId)
    : [];
  const topEntryPicks = latestScanSignals
    .filter((s) => s.action === 'BUY')
    .sort((a, b) => (signalBuyRank(a) ?? 99) - (signalBuyRank(b) ?? 99));
  const rankedCandidates = latestScanSignals
    .filter((s) => signalBuyRank(s) != null)
    .sort((a, b) => signalBuyRank(a) - signalBuyRank(b))
    .slice(0, 5);

  return (
    <div className={`trading-page${embedded ? ' trading-page-embedded' : ''}`}>
      <header className="trading-header">
        <div>
          <h1>Торгівля — IBKR (зростання капіталу)</h1>
          <p className="trading-sub">
            {user?.login} · режим <strong>{modeLabel(settings.mode)}</strong>
            · стратегія <strong>{strategyLabel(settings.strategyProfile)}</strong>
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
          {isActiveMode && (
            <>
              <div className="trading-card">
                <div className="trading-card-label">P/L сьогодні</div>
                <div className={`trading-card-value ${(risk.dailyPnlUsd ?? 0) >= 0 ? 'trading-pnl-pos' : 'trading-pnl-neg'}`}>
                  {fmtMoney(risk.dailyPnlUsd ?? 0)}
                </div>
                <div className="trading-card-value trading-card-value-sm trading-muted">
                  ціль {fmtMoney(settings.dailyProfitTargetUsd ?? 15)} · угод {risk.tradesTodayCount ?? 0}/{settings.maxTradesPerDay ?? 5}
                </div>
              </div>
              <div className="trading-card">
                <div className="trading-card-label">TP / SL на угоду</div>
                <div className="trading-card-value trading-card-value-sm">
                  +{fmtMoney(settings.targetProfitPerTradeUsd ?? 6)} / −{fmtMoney(settings.targetRiskPerTradeUsd ?? 4)}
                </div>
              </div>
            </>
          )}
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
          {latestScanSignals.length > 0 && (
            <div className="trading-card trading-card-wide">
              <div className="trading-card-label">Найкращі для входу (останній скан)</div>
              {topEntryPicks.length > 0 ? (
                <ul className="trading-pending-list">
                  {topEntryPicks.map((s) => (
                    <li key={s._id}>
                      <strong>#{signalBuyRank(s) ?? '?'}</strong> {s.symbol} · F{s.finalScore} · R:R {s.meta?.riskReward ?? '—'}
                      {' '}@ {s.entryPrice} · SL {s.stopLoss} · TP {s.takeProfit}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="trading-muted">
                  Немає обраних BUY — {rankedCandidates.length ? 'найсильніші кандидати:' : 'усі нижче порогу або слоти зайняті'}
                </p>
              )}
              {!topEntryPicks.length && rankedCandidates.length > 0 && (
                <ul className="trading-pending-list">
                  {rankedCandidates.map((s) => (
                    <li key={s._id}>
                      <strong>#{signalBuyRank(s)}</strong> {s.symbol} · F{s.finalScore} · {s.action}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                <th>Ранг</th>
                <th>Дія</th>
                <th>Бали</th>
                <th>Вхід / SL / TP</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s._id} className={signalSelectedForEntry(s) ? 'trading-row-selected' : ''}>
                  <td>{new Date(s.createdAt).toLocaleString('uk-UA')}</td>
                  <td><strong>{s.symbol}</strong></td>
                  <td>{signalBuyRank(s) != null ? `#${signalBuyRank(s)}` : '—'}</td>
                  <td>
                    <span className={`trading-badge ${actionClass(s.action)}`}>{s.action}</span>
                    {signalSelectedForEntry(s) && s.action === 'BUY' && (
                      <span className="trading-tag trading-tag-pick">вхід</span>
                    )}
                  </td>
                  <td>T{s.technicalScore} E{s.externalScore} F{s.finalScore}</td>
                  <td>
                    {s.entryPrice ?? '—'} / {s.stopLoss ?? '—'} / {s.takeProfit ?? '—'}
                  </td>
                  <td className="trading-reason">{s.reason}</td>
                </tr>
              ))}
              {!signals.length && (
                <tr><td colSpan={7} className="trading-muted">Немає сигналів — натисни «Сканувати»</td></tr>
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
                  <th>SL</th>
                  <th>TP</th>
                  <th>Ціна (скан)</th>
                  <th>Сума покупки</th>
                  <th>Продаж</th>
                  <th>Ціна виходу</th>
                  <th>Сума продажу</th>
                  <th>Комісія</th>
                  <th>P/L</th>
                  <th>P/L %</th>
                  <th>Вихід</th>
                  {isSimMode && <th />}
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
                    <td>{t.stopLoss != null ? fmtMoney(t.stopLoss) : '—'}</td>
                    <td>{t.takeProfit != null ? fmtMoney(t.takeProfit) : '—'}</td>
                    <td className="trading-mark-cell">
                      {['open', 'pending_sim', 'pending_ibkr'].includes(t.status) ? (
                        t.lastMarkPrice != null ? (
                          <>
                            <div className={pnlClass(t.markVsEntryPct)}>{fmtMoney(t.lastMarkPrice)}</div>
                            {t.markVsEntryPct != null && (
                              <div className={`trading-mark-delta ${pnlClass(t.markVsEntryPct)}`}>
                                {fmtPct(t.markVsEntryPct)} vs вхід
                              </div>
                            )}
                            <div className="trading-mark-time">{fmtDateTime(t.lastMarkPriceAt)}</div>
                          </>
                        ) : (
                          <span className="trading-muted">запусти скан</span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{fmtMoney(t.buyTotalUsd)}</td>
                    <td>{fmtDateTime(t.closedAt)}</td>
                    <td>{t.exitPrice != null ? fmtMoney(t.exitPrice) : '—'}</td>
                    <td>{fmtMoney(t.sellTotalUsd)}</td>
                    <td>{fmtMoney(t.totalFeesUsd)}</td>
                    <td className={pnlClass(t.pnlUsd)}>{fmtMoney(t.pnlUsd)}</td>
                    <td className={pnlClass(t.pnlPct)}>{fmtPct(t.pnlPct)}</td>
                    <td>{exitReasonLabel(t.exitReason)}</td>
                    {isSimMode && (
                      <td>
                        {['open', 'pending_sim'].includes(t.status) && t.source === 'simulation' && (
                          <button
                            type="button"
                            className="trading-btn trading-btn-ghost trading-btn-xs"
                            disabled={busy === `cancel-${t._id}`}
                            onClick={() => cancelTrade(t._id)}
                          >
                            {busy === `cancel-${t._id}` ? '…' : '✕'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {!tradesLoading && !(tradesData?.trades || []).length && (
                  <tr>
                    <td colSpan={isSimMode ? 17 : 16} className="trading-muted">
                      Ще немає угод. Увімкни авто-торгівлю та запусти скан — записи з’являться тут.
                    </td>
                  </tr>
                )}
                {tradesLoading && !(tradesData?.trades || []).length && (
                  <tr><td colSpan={isSimMode ? 17 : 16} className="trading-muted">Завантаження угод…</td></tr>
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
            <div className="trading-card-label">Стратегія</div>
            <div className="trading-settings-row">
              <select
                value={settings.strategyProfile || 'swing'}
                onChange={(e) => {
                  const profile = e.target.value;
                  const patch = { strategyProfile: profile };
                  if (profile === 'active') {
                    patch.maxOpenPositions = 1;
                    patch.mode = 'simulate';
                  }
                  patchSettings(patch);
                }}
                disabled={busy === 'settings'}
              >
                <option value="swing">Swing (денні бари, 1–2 позиції)</option>
                <option value="active">Active Income ($5–15/день, intraday SPY/QQQ)</option>
              </select>
            </div>
            {isActiveMode && (
              <p className="trading-hint">
                Active: 15m VWAP+EMA, фіксований TP ~${settings.targetProfitTargetUsd ?? 6}/угода,
                денна ціль ${settings.dailyProfitTargetUsd ?? 15}, закриття о <strong>15:55 ET</strong>.
                Cron: <code>*/5 14-20 * * 1-5</code> (UTC, підлаштуй під DST).
              </p>
            )}
          </div>

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
                1) Увімкни <strong>simulate</strong> + <strong>Авто</strong> → «Сканувати» — бот обере{' '}
                <strong>топ-{settings.maxOpenPositions ?? 2}</strong> BUY за балами (finalScore).
                2) Або «Тестова сим-угода» — одразу відкриває позицію по SPY/watchlist з SL/TP.
                3) Кожен наступний скан перевіряє stop/take-profit по Yahoo-ціні.
              </p>
            )}
          </div>

          {isActiveMode && (
            <div className="trading-card trading-card-wide">
              <div className="trading-card-label">Active Income — параметри</div>
              <div className="trading-settings-row trading-settings-grid">
                <label>
                  TP / угода ($):
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={settings.targetProfitPerTradeUsd ?? 6}
                    onChange={(e) => patchSettings({ targetProfitPerTradeUsd: Number(e.target.value) })}
                    disabled={busy === 'settings'}
                    className="trading-input-num"
                  />
                </label>
                <label>
                  SL / угода ($):
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={settings.targetRiskPerTradeUsd ?? 4}
                    onChange={(e) => patchSettings({ targetRiskPerTradeUsd: Number(e.target.value) })}
                    disabled={busy === 'settings'}
                    className="trading-input-num"
                  />
                </label>
                <label>
                  Денна ціль ($):
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={settings.dailyProfitTargetUsd ?? 15}
                    onChange={(e) => patchSettings({ dailyProfitTargetUsd: Number(e.target.value) })}
                    disabled={busy === 'settings'}
                    className="trading-input-num"
                  />
                </label>
                <label>
                  Макс. угод / день:
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    value={settings.maxTradesPerDay ?? 5}
                    onChange={(e) => patchSettings({ maxTradesPerDay: Number(e.target.value) })}
                    disabled={busy === 'settings'}
                    className="trading-input-num"
                  />
                </label>
              </div>
              <textarea
                className="trading-watchlist-input"
                rows={2}
                defaultValue={(settings.activeWatchlist || ['SPY', 'QQQ']).join(', ')}
                disabled={busy === 'settings'}
                onBlur={(e) => {
                  const list = e.target.value
                    .split(/[,;\s]+/)
                    .map((t) => t.trim().toUpperCase())
                    .filter(Boolean);
                  const prev = (settings.activeWatchlist || ['SPY', 'QQQ']).join(',');
                  const next = list.join(',');
                  if (list.length && prev !== next) patchSettings({ activeWatchlist: list });
                }}
                placeholder="SPY, QQQ"
              />
              <p className="trading-hint">
                Рекомендовано <strong>SPY</strong> або <strong>QQQ</strong> — вузький spread, ~$6 рух ≈ 1%.
                Після досягнення денної цілі нові входи блокуються до завтра.
              </p>
            </div>
          )}

          <div className="trading-card trading-card-wide">
            <div className="trading-card-label">Список спостереження (тикери для аналізу)</div>
            <textarea
              className="trading-watchlist-input"
              rows={3}
              defaultValue={(settings.watchlist || []).join(', ')}
              disabled={busy === 'settings'}
              onBlur={(e) => {
                const list = e.target.value
                  .split(/[,;\s]+/)
                  .map((t) => t.trim().toUpperCase())
                  .filter(Boolean);
                const prev = (settings.watchlist || []).join(',');
                const next = list.join(',');
                if (list.length && prev !== next) patchSettings({ watchlist: list });
              }}
              placeholder="VOO, SPY, AAPL, MSFT, NVDA…"
            />
            <p className="trading-hint">
              {isActiveMode
                ? 'У режимі Active використовується activeWatchlist вище; swing-watchlist — для довгострокового скану.'
                : <>Через кому або пробіл. Бот порівнює всі тикери і купує лише найсильніші сигнали в межах{' '}
                <strong>макс. {settings.maxOpenPositions ?? 2} позицій</strong>.</>}
            </p>
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
