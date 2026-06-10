import React, { useState, useEffect, useRef, useCallback } from 'react';
import API_BASE_URL from '../../config';
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

const TRIGGER_LABELS = {
  manual: 'Вручну (агент)',
  schedule: 'Розклад',
  upload: 'Завантаження в адмінці',
};

function formatDt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('uk-UA');
}

/** Виправлення «Ð—Ð°Ð»Ð¸ÑˆÐºÐ¸» → «Залишки» для старих записів журналу. */
function fixFilenameEncoding(name) {
  const raw = String(name || '').trim();
  if (!raw || /[а-яіїєґ]/i.test(raw)) return raw;
  try {
    const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    if (decoded && /[а-яіїєґ]/i.test(decoded)) return decoded;
  } catch (_) {
    /* ignore */
  }
  return raw;
}

function OneCWorkerPanel() {
  const [agentUrl, setAgentUrl] = useState(() => localStorage.getItem(LS_URL) || DEFAULT_URL);
  const [agentToken, setAgentToken] = useState(() => localStorage.getItem(LS_TOKEN) || '');
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [journal, setJournal] = useState([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState('');
  const pollRef = useRef(null);
  const prevStateRef = useRef(null);

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

  const fetchJournal = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setJournalError('Увійдіть у систему, щоб бачити журнал імпортів.');
      return;
    }
    setJournalLoading(true);
    setJournalError('');
    try {
      const r = await fetch(`${API_BASE_URL}/onec/import-journal?limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setJournal(data.entries || []);
      setJournalTotal(data.total ?? 0);
    } catch (e) {
      setJournalError(`Журнал недоступний: ${e.message}`);
    } finally {
      setJournalLoading(false);
    }
  }, []);

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
    fetchJournal();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cur = status?.state;
    const prev = prevStateRef.current;
    if (prev === 'running' && (cur === 'done' || cur === 'error')) {
      fetchJournal();
    }
    prevStateRef.current = cur;
  }, [status?.state, fetchJournal]);

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
          <h3>Журнал виконання (поточний цикл)</h3>
          <pre>{status.log.join('\n')}</pre>
        </div>
      )}

      <div className="ow-journal">
        <div className="ow-journal-head">
          <h3>📋 Журнал завантажень у DTS</h3>
          <button type="button" className="ow-refresh" onClick={fetchJournal} disabled={journalLoading}>
            {journalLoading ? 'Оновлення…' : '↻ Оновити'}
          </button>
        </div>
        <p className="ow-journal-sub">
          Історія імпортів «Ведомости» з сервера DTS — працює навіть якщо локальний агент недоступний з браузера.
          {journalTotal > 0 && ` Всього записів: ${journalTotal}.`}
        </p>
        {journalError && <div className="ow-error">{journalError}</div>}
        {!journalError && journal.length === 0 && !journalLoading && (
          <div className="ow-journal-empty">Записів ще немає. Після першого успішного імпорту вони з’являться тут.</div>
        )}
        {journal.length > 0 && (
          <div className="ow-journal-wrap">
            <table className="ow-journal-table">
              <thead>
                <tr>
                  <th>Дата / час</th>
                  <th>Файл</th>
                  <th>Джерело</th>
                  <th>Статус</th>
                  <th>Залишки</th>
                  <th>Рух</th>
                  <th>Деталі</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((row) => (
                  <tr key={row._id} className={row.status === 'error' ? 'ow-row-err' : ''}>
                    <td className="ow-dt">{formatDt(row.importedAt)}</td>
                    <td className="ow-file" title={fixFilenameEncoding(row.fileName) || ''}>
                      {fixFilenameEncoding(row.fileName) || '—'}
                    </td>
                    <td>{TRIGGER_LABELS[row.trigger] || row.trigger || '—'}</td>
                    <td>
                      <span className={`ow-badge ${row.status === 'success' ? 'ok' : 'err'}`}>
                        {row.status === 'success' ? 'OK' : 'Помилка'}
                      </span>
                      {row.dryRun && <span className="ow-dry">dryRun</span>}
                    </td>
                    <td>
                      {row.status === 'success'
                        ? `+${row.stock?.created ?? 0} / ~${row.stock?.updated ?? 0}`
                        : '—'}
                    </td>
                    <td>
                      {row.status === 'success'
                        ? `+${row.movements?.inserted ?? 0}${(row.movements?.updated ?? 0) > 0 ? ` / ~${row.movements.updated}` : ''} (без змін ${row.movements?.duplicates ?? 0})`
                        : '—'}
                    </td>
                    <td className="ow-details">
                      {row.status === 'error' && row.error ? (
                        <span className="ow-err-text" title={row.error}>{row.error}</span>
                      ) : (
                        <>
                          {row.importedByLogin && <span>{row.importedByLogin}</span>}
                          {(row.unmappedWarehousesCount ?? 0) > 0 && (
                            <span className="ow-warn">
                              {' '}· незіставлені склади: {row.unmappedWarehousesCount}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default OneCWorkerPanel;
