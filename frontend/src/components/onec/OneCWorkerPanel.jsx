import React, { useState, useEffect, useRef, useCallback } from 'react';
import './OneCWorkerPanel.css';

const LS_URL = 'onecAgentUrl';
const LS_TOKEN = 'onecAgentToken';
const DEFAULT_URL = 'http://127.0.0.1:8765';

const STATE_META = {
  idle: { label: 'Очікує', cls: 'idle' },
  running: { label: 'Виконується…', cls: 'running' },
  done: { label: 'Успішно', cls: 'done' },
  error: { label: 'Помилка', cls: 'error' },
};

function OneCWorkerPanel() {
  const [agentUrl, setAgentUrl] = useState(() => localStorage.getItem(LS_URL) || DEFAULT_URL);
  const [agentToken, setAgentToken] = useState(() => localStorage.getItem(LS_TOKEN) || '');
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  const base = agentUrl.replace(/\/+$/, '');
  const headers = agentToken ? { 'x-agent-token': agentToken } : {};

  const saveSettings = useCallback(() => {
    localStorage.setItem(LS_URL, agentUrl);
    localStorage.setItem(LS_TOKEN, agentToken);
  }, [agentUrl, agentToken]);

  const checkHealth = useCallback(async () => {
    setError('');
    try {
      const r = await fetch(`${base}/health`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setHealth(await r.json());
    } catch (e) {
      setHealth(null);
      setError(`Агент недоступний за ${base}. Перевірте, що агент запущено на сервері 1С. (${e.message})`);
    }
  }, [base]);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${base}/status`, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const s = await r.json();
      setStatus(s);
      return s;
    } catch (e) {
      setError(`Не вдалося отримати статус: ${e.message}`);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, agentToken]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const s = await fetchStatus();
      if (s && s.state !== 'running') stopPolling();
    }, 2000);
  }, [fetchStatus]);

  const startWork = useCallback(async () => {
    setError('');
    setBusy(true);
    saveSettings();
    try {
      const r = await fetch(`${base}/run`, { method: 'POST', headers });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      if (!data.started) {
        setError(data.reason || 'Агент уже виконує цикл.');
      }
      await fetchStatus();
      startPolling();
    } catch (e) {
      setError(`Не вдалося запустити: ${e.message}`);
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, agentToken, fetchStatus, startPolling, saveSettings]);

  useEffect(() => {
    checkHealth();
    fetchStatus().then((s) => {
      if (s && s.state === 'running') startPolling();
    });
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sm = status ? STATE_META[status.state] || STATE_META.idle : null;
  const sum = status?.importSummary;

  return (
    <div className="onec-worker">
      <div className="ow-head">
        <div>
          <h2>🤖 Агент 1С — оновлення залишків</h2>
          <p className="ow-sub">
            Кнопка запускає на сервері 1С: «Сформировать» у звіті → збереження файлу → імпорт у DTS
            (залишки + журнал руху). Також працює за розкладом 08:00 / 12:00 / 16:00.
          </p>
        </div>
        <button className="ow-run" onClick={startWork} disabled={busy || status?.state === 'running'}>
          {status?.state === 'running' ? '⏳ Виконується…' : '▶ Почати роботу'}
        </button>
      </div>

      <details className="ow-settings">
        <summary>⚙️ Підключення до агента</summary>
        <div className="ow-settings-body">
          <label>
            Адреса агента
            <input
              type="text"
              value={agentUrl}
              onChange={(e) => setAgentUrl(e.target.value)}
              placeholder={DEFAULT_URL}
            />
          </label>
          <label>
            Agent token
            <input
              type="password"
              value={agentToken}
              onChange={(e) => setAgentToken(e.target.value)}
              placeholder="x-agent-token"
            />
          </label>
          <button onClick={() => { saveSettings(); checkHealth(); }}>Перевірити з'єднання</button>
        </div>
      </details>

      {health && (
        <div className="ow-health">
          <span className={`ow-dot ${health.automationAvailable ? 'ok' : 'warn'}`} />
          Агент на зв'язку. Емуляція: {health.automationAvailable ? 'доступна' : 'НЕДОСТУПНА'}
          {!health.automationAvailable && health.nutError ? ` (${health.nutError})` : ''}.
          Розклад: {health.scheduleEnabled ? 'увімкнено' : 'вимкнено'}.
        </div>
      )}

      {error && <div className="ow-error">{error}</div>}

      {sm && (
        <div className={`ow-status ${sm.cls}`}>
          <div className="ow-status-row">
            <strong>Стан:</strong> {sm.label}
            {status.trigger && <span className="ow-trigger">({status.trigger === 'manual' ? 'вручну' : 'розклад'})</span>}
          </div>
          {status.startedAt && (
            <div className="ow-status-row ow-muted">
              Старт: {new Date(status.startedAt).toLocaleString('uk-UA')}
              {status.finishedAt && ` · Завершено: ${new Date(status.finishedAt).toLocaleString('uk-UA')}`}
            </div>
          )}
          {status.fileName && <div className="ow-status-row">Файл: {status.fileName}</div>}
          {status.error && <div className="ow-status-row ow-err-text">{status.error}</div>}
        </div>
      )}

      {sum && (
        <div className="ow-summary">
          <h3>Результат імпорту</h3>
          <div className="ow-cards">
            <div className="ow-card">
              <span className="ow-num">+{sum.stock?.created ?? 0}</span>
              <span className="ow-lbl">нових позицій</span>
            </div>
            <div className="ow-card">
              <span className="ow-num">~{sum.stock?.updated ?? 0}</span>
              <span className="ow-lbl">оновлено залишків</span>
            </div>
            <div className="ow-card">
              <span className="ow-num">+{sum.movements?.inserted ?? 0}</span>
              <span className="ow-lbl">записів руху</span>
            </div>
            <div className="ow-card">
              <span className="ow-num">{sum.movements?.duplicates ?? 0}</span>
              <span className="ow-lbl">дублі (пропущено)</span>
            </div>
          </div>
          {Array.isArray(sum.unmappedWarehouses) && sum.unmappedWarehouses.length > 0 && (
            <div className="ow-unmapped">
              ⚠️ Не зіставлені склади 1С ({sum.unmappedWarehouses.length}):{' '}
              {sum.unmappedWarehouses.slice(0, 12).join(', ')}
              {sum.unmappedWarehouses.length > 12 ? '…' : ''}
              <div className="ow-hint">Зіставте їх у «Управління складами» → «Склади 1С (зіставлення)».</div>
            </div>
          )}
        </div>
      )}

      {status?.log?.length > 0 && (
        <div className="ow-log">
          <h3>Журнал виконання</h3>
          <pre>{status.log.join('\n')}</pre>
        </div>
      )}
    </div>
  );
}

export default OneCWorkerPanel;
