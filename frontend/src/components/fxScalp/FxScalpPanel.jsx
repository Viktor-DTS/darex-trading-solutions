import React, { useCallback, useEffect, useRef, useState } from 'react';
import API_BASE_URL from '../../config';
import './FxScalpPanel.css';

function authHeaders(extra = {}) {
  const token = localStorage.getItem('token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }
    : { 'Content-Type': 'application/json', ...extra };
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtDt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('uk-UA');
}

function sideLabel(side) {
  const s = String(side || '').toLowerCase();
  if (s === 'short' || s === 'sell') return 'SELL';
  if (s === 'long' || s === 'buy') return 'BUY';
  return s || '—';
}

function logLineClass(line) {
  const t = String(line || '');
  if (/\[fx-entry\]|\[fx-open\]/i.test(t)) return 'fx-log-entry';
  if (/\[fx-exit\]|\[fx-close\]/i.test(t)) return 'fx-log-exit';
  if (/\[fx-scan\]/i.test(t)) return 'fx-log-scan';
  if (/skip|SKIP/i.test(t)) return 'fx-log-skip';
  return '';
}

function FxScalpPanel() {
  const [status, setStatus] = useState(null);
  const [dash, setDash] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/fx-scalp/status`, { headers: authHeaders() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || data.hint || `HTTP ${r.status}`);
      setStatus(data);
      if (!data.configured) {
        setError('');
      } else if (data.reachable === false) {
        setError(data.hint || data.error || 'Агент недоступний за вказаним URL');
      } else {
        setError('');
      }
      return data;
    } catch (e) {
      setStatus(null);
      setError(`Статус недоступний: ${e.message}`);
      return null;
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/fx-scalp/dashboard`, { headers: authHeaders() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setDash(data);
      setError('');
      return data;
    } catch (e) {
      setDash(null);
      setError(`Дані бота недоступні: ${e.message}`);
      return null;
    }
  }, []);
    try {
      const r = await fetch(`${API_BASE_URL}/fx-scalp/logs?limit=120`, { headers: authHeaders() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return;
      setLogs(data.lines || []);
    } catch (_) {
      /* ignore log poll errors */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const st = await fetchStatus();
    if (st?.configured && st?.reachable !== false) {
      await Promise.all([fetchDashboard(), fetchLogs()]);
    }
  }, [fetchStatus, fetchDashboard, fetchLogs]);

  const workerAction = async (action, force = false) => {
    setBusy(true);
    setError('');
    try {
      const path = action === 'start'
        ? `/fx-scalp/worker/start${force ? '?force=1' : ''}`
        : '/fx-scalp/worker/stop';
      const r = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: authHeaders(),
        body: '{}',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || data.hint || `HTTP ${r.status}`);
      await refreshAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshAll();
    pollRef.current = setInterval(refreshAll, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshAll]);

  const configured = status?.configured;
  const reachable = status?.reachable !== false;
  const control = dash?.control || status?.control;
  const state = dash?.state;
  const journal = dash?.journal;
  const workerRunning = Boolean(
    control?.managed
    || control?.externalWorkerLikely
    || control?.workerRunning
    || control?.managedRunning,
  );
  const externalPid = control?.statePid || control?.externalPid;
  const risk = state?.risk;
  const openTrades = state?.openTrades || journal?.summary?.openTrades || [];
  const pairs = state?.lastAnalyses || [];
  const closedEvents = (journal?.events || []).filter((e) => e.type === 'close').slice(0, 15);

  return (
    <div className="fx-scalp-panel">
      <div className="fx-head">
        <div>
          <h2>🤖 Bot Scalpe (FX)</h2>
          <p className="fx-sub">
            Моніторинг fx-scalp-agent через Darex backend. На Render задайте{' '}
            <code>FX_SCALP_AGENT_URL</code> та <code>FX_SCALP_AGENT_SECRET</code> ( = <code>FX_API_SECRET</code> агента).
          </p>
        </div>
        <div className="fx-head-actions">
          <button type="button" className="fx-btn-secondary" onClick={refreshAll} disabled={busy}>
            Оновити
          </button>
          {configured && (
            <>
              <button
                type="button"
                className="fx-btn-start"
                disabled={busy || workerRunning}
                onClick={() => workerAction('start', Boolean(externalPid))}
              >
                ▶ Worker
              </button>
              <button
                type="button"
                className="fx-btn-stop"
                disabled={busy || !workerRunning}
                onClick={() => workerAction('stop')}
              >
                ■ Stop
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className={`fx-alert ${configured && !reachable ? 'fx-alert-warn' : 'fx-alert-error'}`}>
          {error}
        </div>
      )}

      {!configured && status && (
        <div className="fx-alert fx-alert-warn">
          {status.hint || 'FX_SCALP_AGENT_URL не налаштовано на backend Render.'}
        </div>
      )}

      {configured && !reachable && status?.agentUrl && (
        <div className="fx-alert fx-alert-warn">
          Поточний URL: <code>{status.agentUrl}</code> — сервіс не відповідає на <code>/health</code>.
          Створіть окремий Render Web Service для <code>fx-scalp-agent</code> (branch <code>master</code>, root <code>fx-scalp-agent</code>).
        </div>
      )}

      <div className="fx-cards">
        <div className="fx-card">
          <div className="fx-card-label">Agent</div>
          <div className="fx-card-value">{status?.agentUrl || '—'}</div>
          <div className={`fx-badge ${configured && reachable ? 'ok' : configured ? 'warn' : 'off'}`}>
            {configured && reachable ? 'online' : configured ? 'URL задано' : 'не налаштовано'}
          </div>
        </div>
        <div className="fx-card">
          <div className="fx-card-label">Worker</div>
          <div className="fx-card-value">
            {workerRunning ? 'працює' : externalPid ? `зовнішній PID ${externalPid}` : 'зупинено'}
          </div>
          <div className={`fx-badge ${workerRunning ? 'ok' : 'off'}`}>
            {dash?.health?.simulate != null ? (dash.health.simulate ? 'sim' : 'live') : '—'}
          </div>
        </div>
        <div className="fx-card">
          <div className="fx-card-label">Day P/L</div>
          <div className={`fx-card-value ${(risk?.dayPnl ?? 0) >= 0 ? 'pos' : 'neg'}`}>
            {fmtMoney(risk?.dayPnl)}
          </div>
          <div className="fx-card-meta">
            угод сьогодні: {risk?.tradesToday ?? '—'} / {risk?.maxTradesPerDay ?? '—'}
          </div>
        </div>
        <div className="fx-card">
          <div className="fx-card-label">Відкриті</div>
          <div className="fx-card-value">{openTrades.length}</div>
          <div className="fx-card-meta">
            {state?.worker === 'offline' ? 'worker offline' : `${pairs.length} пар у скані`}
          </div>
        </div>
      </div>

      {openTrades.length > 0 && (
        <section className="fx-section">
          <h3>Відкриті позиції</h3>
          <table className="fx-table">
            <thead>
              <tr>
                <th>Пара</th>
                <th>Сторона</th>
                <th>Entry</th>
                <th>SL / TP</th>
                <th>Score</th>
                <th>Відкрито</th>
              </tr>
            </thead>
            <tbody>
              {openTrades.map((t) => (
                <tr key={`${t.pair}-${t.openedAt}`}>
                  <td>{t.pair}</td>
                  <td className={sideLabel(t.side) === 'SELL' ? 'sell' : 'buy'}>{sideLabel(t.side)}</td>
                  <td>{t.entry}</td>
                  <td>{t.stopLoss} / {t.takeProfit}</td>
                  <td>{t.score ?? '—'}</td>
                  <td>{fmtDt(t.openedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {pairs.length > 0 && (
        <section className="fx-section">
          <h3>Останній скан (топ пари)</h3>
          <table className="fx-table">
            <thead>
              <tr>
                <th>Пара</th>
                <th>Сигнал</th>
                <th>Score</th>
                <th>Conv</th>
                <th>Regime</th>
              </tr>
            </thead>
            <tbody>
              {pairs.slice(0, 12).map((p) => (
                <tr key={p.pair}>
                  <td>{p.pair}</td>
                  <td className={String(p.action || '').includes('SELL') ? 'sell' : String(p.action || '').includes('BUY') ? 'buy' : ''}>
                    {p.action || p.signal || 'SKIP'}
                  </td>
                  <td>{p.entryScore ?? p.score ?? '—'}</td>
                  <td>{p.conviction ?? p.meta?.conviction ?? '—'}</td>
                  <td>{p.regime ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {closedEvents.length > 0 && (
        <section className="fx-section">
          <h3>Журнал (останні закриття)</h3>
          <table className="fx-table">
            <thead>
              <tr>
                <th>Час</th>
                <th>Пара</th>
                <th>Сторона</th>
                <th>P/L</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {closedEvents.map((e, i) => (
                <tr key={`${e.closedAt}-${e.pair}-${i}`}>
                  <td>{fmtDt(e.closedAt)}</td>
                  <td>{e.pair}</td>
                  <td>{sideLabel(e.side)}</td>
                  <td className={(e.pnlUsd ?? 0) >= 0 ? 'pos' : 'neg'}>{fmtMoney(e.pnlUsd)}</td>
                  <td>{e.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="fx-section">
        <h3>Логи worker</h3>
        <div className="fx-log-box">
          {logs.length === 0 && <div className="fx-log-empty">Немає логів або worker не запущено.</div>}
          {logs.map((line, i) => (
            <div key={`${i}-${line.slice(0, 24)}`} className={`fx-log-line ${logLineClass(line)}`}>
              {line}
            </div>
          ))}
        </div>
      </section>

      {configured && status?.agentUrl && (
        <p className="fx-foot">
          Повна панель агента:{' '}
          <a href={status.agentUrl} target="_blank" rel="noreferrer">{status.agentUrl}</a>
        </p>
      )}
    </div>
  );
}

export default FxScalpPanel;
