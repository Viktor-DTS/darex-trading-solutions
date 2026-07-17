import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import {
  fetchAllTasks,
  filterTasksForExport,
} from '../utils/taskLocalExport';
import {
  getTaskExportState,
  isTaskExportRunning,
  startTaskExport,
  subscribeTaskExport,
} from '../utils/taskExportRunner';
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
  const [error, setError] = useState('');
  const [exportJob, setExportJob] = useState(getTaskExportState);

  useEffect(() => subscribeTaskExport(setExportJob), []);

  const exportRunning = exportJob.status === 'running';

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
    if (exportRunning) return;
    setLoading(true);
    await countMatchingTasks();
    setLoading(false);
  };

  const handleExport = async () => {
    setError('');

    if (isTaskExportRunning()) {
      setError('Експорт уже виконується. Дивіться панель прогресу внизу справа.');
      return;
    }

    if (!('showDirectoryPicker' in window)) {
      setError('Ваш браузер не підтримує вибір папки для збереження. Використовуйте Chrome або Edge.');
      return;
    }

    let rootDirHandle;
    try {
      rootDirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Помилка вибору папки');
        alert('❌ Помилка вибору папки: ' + (err.message || 'невідома помилка'));
      }
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Немає токена авторизації');
      return;
    }

    const filters = {
      dateFrom,
      dateTo,
      regions: selectedRegions,
      statuses: selectedStatuses,
    };

    startTaskExport({
      rootDirHandle,
      token,
      filters,
      exportedBy: user?.name || user?.login || '',
      userSnapshot: {
        id: user?._id || user?.id,
        name: user?.name || user?.login,
        role: user?.role,
      },
    });
  };

  return (
    <div className="admin-section task-export-panel">
      <h3>📤 Експорт заявок на локальне місце</h3>
      <p className="info-text task-export-desc">
        Оберіть фільтри та натисніть «Експорт у папку» — спочатку відкриється вікно вибору місця збереження,
        потім завантажаться заявки та створиться папка «Експорт [дата сервера]». Експорт працює у фоні —
        можна вийти з системи, але не закривайте вкладку браузера. Зупинити — кнопкою внизу справа.
      </p>

      <div className="task-export-filters">
        <div className="task-export-filter-group">
          <label>Дата заявки від</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPreviewCount(null); }}
            disabled={exportRunning}
          />
          <span className="filter-hint">Порожні дати заявок завжди включаються</span>
        </div>

        <div className="task-export-filter-group">
          <label>Дата заявки до</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPreviewCount(null); }}
            disabled={exportRunning}
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

      {exportRunning && (
        <div className="task-export-progress">
          Експорт у фоні: {exportJob.progress?.processed ?? 0} / {exportJob.progress?.total ?? '…'}
          {exportJob.message ? ` — ${exportJob.message}` : ''}
        </div>
      )}

      {error && <div className="task-export-error">{error}</div>}

      <div className="task-export-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={handlePreview}
          disabled={loading || exportRunning}
        >
          {loading ? '⏳ ...' : '🔍 Підрахувати'}
        </button>
        <button
          type="button"
          className="btn-backup"
          onClick={handleExport}
          disabled={exportRunning}
        >
          {exportRunning ? '⏳ Експорт триває...' : '📁 Експорт у папку'}
        </button>
      </div>

      <div className="task-export-structure">
        <h4>Структура папок</h4>
        <pre>{`Експорт ДД.ММ.РРРР/
  критерії_експорту.txt   ← параметри та час експорту
  Київський/
    03113549 ТОВ Компанія/   ← ЄДРПОУ + назва (або лише «Замовник» для фіз. особи)
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
