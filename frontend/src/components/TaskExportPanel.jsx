import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import {
  exportTasksToLocalFolder,
  fetchAllTasks,
  filterTasksForExport,
} from '../utils/taskLocalExport';
import './TaskExportPanel.css';

const STATUS_OPTIONS = [
  { value: '__ALL__', label: '— Усі статуси —' },
  { value: 'Заявка', label: 'Заявка' },
  { value: 'В роботі', label: 'В роботі' },
  { value: 'Виконано', label: 'Виконано' },
  { value: 'Заблоковано', label: 'Заблоковано' },
];

function TaskExportPanel({ user }) {
  const [regions, setRegions] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [region, setRegion] = useState('__ALL__');
  const [status, setStatus] = useState('__ALL__');
  const [loading, setLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const loadRegions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/regions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRegions(data.map((r) => (typeof r === 'object' ? r.name || r : r)).filter(Boolean));
      }
    } catch (err) {
      console.error('Помилка завантаження регіонів:', err);
    }
  }, []);

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  const countMatchingTasks = async () => {
    setError('');
    try {
      const token = localStorage.getItem('token');
      const { tasks } = await fetchAllTasks(token);
      const filtered = filterTasksForExport(tasks, { dateFrom, dateTo, region, status });
      setPreviewCount(filtered.length);
      return filtered;
    } catch (err) {
      setError(err.message || 'Помилка підрахунку');
      setPreviewCount(null);
      return [];
    }
  };

  const handlePreview = async () => {
    setLoading(true);
    await countMatchingTasks();
    setLoading(false);
  };

  const logExportEvent = async (count) => {
    try {
      const token = localStorage.getItem('token');
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      await fetch(`${API_BASE_URL}/event-log`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser._id || currentUser.id,
          userName: currentUser.name || currentUser.login,
          userRole: currentUser.role,
          action: 'export',
          entityType: 'tasks',
          entityId: 'local',
          description: `Експорт заявок на локальне місце (${count} шт.)`,
          details: { dateFrom, dateTo, region, status, count },
        }),
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }
  };

  const handleExport = async () => {
    setError('');
    setProgress(null);

    if (!('showDirectoryPicker' in window)) {
      setError('Ваш браузер не підтримує вибір папки для збереження. Використовуйте Chrome або Edge.');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const { tasks, serverDate } = await fetchAllTasks(token);
      const filtered = filterTasksForExport(tasks, { dateFrom, dateTo, region, status });

      if (filtered.length === 0) {
        setError('За обраними фільтрами заявок не знайдено');
        setPreviewCount(0);
        return;
      }

      setPreviewCount(filtered.length);

      const rootDirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });

      setProgress({ processed: 0, total: filtered.length, task: '...' });

      const result = await exportTasksToLocalFolder({
        tasks: filtered,
        rootDirHandle,
        serverDate,
        token,
        onProgress: setProgress,
        filters: { dateFrom, dateTo, region, status },
        exportedBy: user?.name || user?.login || '',
      });

      await logExportEvent(result.count);

      alert(
        `✅ Експорт завершено!\n\n` +
        `Папка: ${result.exportFolderName}\n` +
        `Заявок: ${result.count}`
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Помилка експорту:', err);
        setError(err.message || 'Помилка експорту');
        alert('❌ Помилка експорту: ' + (err.message || 'невідома помилка'));
      }
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  return (
    <div className="admin-section task-export-panel">
      <h3>📤 Експорт заявок на локальне місце</h3>
      <p className="info-text task-export-desc">
        Оберіть фільтри та натисніть «Експорт». Буде створено папку «Експорт [дата сервера]» з файлом критеріїв експорту,
        групуванням за регіоном → замовником (за ЄДРПОУ або назвою) → заявкою. У кожній папці заявки — PDF та прикріплені файли.
      </p>

      <div className="task-export-filters">
        <div className="task-export-filter-group">
          <label>Дата заявки від</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPreviewCount(null); }}
          />
          <span className="filter-hint">Порожні дати заявок завжди включаються</span>
        </div>

        <div className="task-export-filter-group">
          <label>Дата заявки до</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPreviewCount(null); }}
          />
        </div>

        <div className="task-export-filter-group">
          <label>Регіон</label>
          <select value={region} onChange={(e) => { setRegion(e.target.value); setPreviewCount(null); }}>
            <option value="__ALL__">— Усі регіони —</option>
            {regions
              .filter((r) => !String(r).includes(','))
              .map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
          </select>
        </div>

        <div className="task-export-filter-group">
          <label>Статус заявки</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPreviewCount(null); }}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {previewCount !== null && (
        <div className="task-export-preview">
          Знайдено заявок для експорту: <strong>{previewCount}</strong>
        </div>
      )}

      {progress && (
        <div className="task-export-progress">
          Експорт: {progress.processed} / {progress.total}
          {progress.task ? ` — ${progress.task}` : ''}
        </div>
      )}

      {error && <div className="task-export-error">{error}</div>}

      <div className="task-export-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={handlePreview}
          disabled={loading}
        >
          {loading && !progress ? '⏳ ...' : '🔍 Підрахувати'}
        </button>
        <button
          type="button"
          className="btn-backup"
          onClick={handleExport}
          disabled={loading}
        >
          {loading ? '⏳ Експорт...' : '📁 Експорт у папку'}
        </button>
      </div>

      <div className="task-export-structure">
        <h4>Структура папок</h4>
        <pre>{`Експорт ДД.ММ.РРРР/
  критерії_експорту.txt   ← параметри та час експорту
  Київський/
    12345678/          ← ЄДРПОУ (або «Замовник» для фіз. особи)
      DP-0001807 16.07.2026/
        заявка_DP-0001807.pdf
        договір...
        рахунок...
        акт...
        файли виконаних робіт...`}</pre>
      </div>
    </div>
  );
}

export default TaskExportPanel;
