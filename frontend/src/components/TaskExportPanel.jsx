import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import {
  exportTasksToLocalFolder,
  fetchAllTasks,
  filterTasksForExport,
} from '../utils/taskLocalExport';
import './TaskExportPanel.css';

const STATUS_OPTIONS = [
  { value: 'Заявка', label: 'Заявка' },
  { value: 'В роботі', label: 'В роботі' },
  { value: 'Виконано', label: 'Виконано' },
  { value: 'Заблоковано', label: 'Заблоковано' },
];

function MultiCheckboxFilter({ label, options, selected, onChange, emptyLabel }) {
  const allValues = options.map((o) => o.value);
  const allSelected = selected.length === 0;

  const isChecked = (value) => allSelected || selected.includes(value);

  const toggleValue = (value) => {
    if (allSelected) {
      onChange(allValues.filter((v) => v !== value));
      return;
    }
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
      return;
    }
    const next = [...selected, value];
    onChange(next.length === allValues.length ? [] : next);
  };

  const selectAll = () => onChange([]);

  return (
    <div className="task-export-filter-group task-export-multiselect">
      <div className="multiselect-header">
        <label>{label}</label>
        <div className="multiselect-actions">
          <button type="button" onClick={selectAll} className="multiselect-link">Усі</button>
        </div>
      </div>
      <div className="multiselect-summary">
        {allSelected ? emptyLabel : `Обрано: ${selected.length} з ${allValues.length}`}
      </div>
      <div className="multiselect-list">
        {options.map((opt) => (
          <label key={opt.value} className="multiselect-item">
            <input
              type="checkbox"
              checked={isChecked(opt.value)}
              onChange={() => toggleValue(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TaskExportPanel({ user }) {
  const [regions, setRegions] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRegions, setSelectedRegions] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState(null);
  const [totalLoaded, setTotalLoaded] = useState(null);
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
      setTotalLoaded(tasks.length);
      const filtered = filterTasksForExport(tasks, {
        dateFrom,
        dateTo,
        regions: selectedRegions,
        statuses: selectedStatuses,
      });
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
          details: { dateFrom, dateTo, regions: selectedRegions, statuses: selectedStatuses, count },
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
    let rootDirHandle;
    try {
      // Діалог папки — одразу після кліку (до довгого завантаження заявок)
      rootDirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });
    } catch (err) {
      setLoading(false);
      if (err.name !== 'AbortError') {
        setError(err.message || 'Помилка вибору папки');
        alert('❌ Помилка вибору папки: ' + (err.message || 'невідома помилка'));
      }
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const { tasks, serverDate } = await fetchAllTasks(token);
      setTotalLoaded(tasks.length);
      const filtered = filterTasksForExport(tasks, {
        dateFrom,
        dateTo,
        regions: selectedRegions,
        statuses: selectedStatuses,
      });

      if (filtered.length === 0) {
        setError('За обраними фільтрами заявок не знайдено');
        setPreviewCount(0);
        alert('За обраними фільтрами заявок не знайдено. Експорт скасовано.');
        return;
      }

      setPreviewCount(filtered.length);
      setProgress({ processed: 0, total: filtered.length, task: '...' });

      const result = await exportTasksToLocalFolder({
        tasks: filtered,
        rootDirHandle,
        serverDate,
        token,
        onProgress: setProgress,
        filters: { dateFrom, dateTo, regions: selectedRegions, statuses: selectedStatuses },
        exportedBy: user?.name || user?.login || '',
      });

      await logExportEvent(result.count);

      alert(
        `✅ Експорт завершено!\n\n` +
        `Папка: ${result.exportFolderName}\n` +
        `Заявок: ${result.count}`
      );
    } catch (err) {
      console.error('Помилка експорту:', err);
      setError(err.message || 'Помилка експорту');
      alert('❌ Помилка експорту: ' + (err.message || 'невідома помилка'));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  return (
    <div className="admin-section task-export-panel">
      <h3>📤 Експорт заявок на локальне місце</h3>
      <p className="info-text task-export-desc">
        Оберіть фільтри та натисніть «Експорт у папку» — спочатку відкриється вікно вибору місця збереження,
        потім завантажаться заявки та створиться папка «Експорт [дата сервера]» з файлом критеріїв експорту,
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

        <MultiCheckboxFilter
          label="Регіон"
          emptyLabel="— Усі регіони —"
          options={regions
            .filter((r) => !String(r).includes(','))
            .map((r) => ({ value: r, label: r }))}
          selected={selectedRegions}
          onChange={(vals) => { setSelectedRegions(vals); setPreviewCount(null); }}
        />

        <MultiCheckboxFilter
          label="Статус заявки"
          emptyLabel="— Усі статуси —"
          options={STATUS_OPTIONS}
          selected={selectedStatuses}
          onChange={(vals) => { setSelectedStatuses(vals); setPreviewCount(null); }}
        />
      </div>

      {previewCount !== null && (
        <div className="task-export-preview">
          {totalLoaded != null && (
            <>Завантажено заявок: <strong>{totalLoaded}</strong> | </>
          )}
          Підходить під фільтр: <strong>{previewCount}</strong>
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
