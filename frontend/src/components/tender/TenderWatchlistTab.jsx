import React, { useState, useEffect, useCallback } from 'react';
import {
  getTenderWatchlist,
  getTenderWatchlistStats,
  getTenderMeta,
  assignTenderManager,
  transmitTenderToManager,
  updateTenderWatch,
  deleteTenderWatch,
} from '../../utils/tenderAPI';
import API_BASE_URL from '../../config';
import TenderDetailPanel from './TenderDetailPanel';
import './TenderDepartment.css';

function fetchManagers() {
  const token = localStorage.getItem('token');
  return fetch(`${API_BASE_URL}/users`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => r.json())
    .then((list) => (Array.isArray(list) ? list.filter((u) => (u.role || '').toLowerCase() === 'manager') : []))
    .catch(() => []);
}

function TenderWatchlistTab() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(null);
  const [managers, setManagers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [assignLogin, setAssignLogin] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selected) setAssignLogin(selected.assignedManagerLogin || '');
  }, [selected?._id, selected?.assignedManagerLogin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const [list, st, m] = await Promise.all([
        getTenderWatchlist(params),
        getTenderWatchlistStats().catch(() => null),
        getTenderMeta().catch(() => ({})),
      ]);
      setItems(Array.isArray(list) ? list : []);
      setStats(st);
      setMeta(m);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
    fetchManagers().then(setManagers);
  }, [load]);

  const handleAssign = async () => {
    if (!selected || !assignLogin) return;
    setSaving(true);
    try {
      const updated = await assignTenderManager(selected._id, assignLogin);
      setSelected(updated);
      load();
    } catch (e) {
      alert(e.message || 'Помилка призначення');
    } finally {
      setSaving(false);
    }
  };

  const handleTransmit = async () => {
    if (!selected) return;
    if (!window.confirm('Передати тендер менеджеру з системним сповіщенням?')) return;
    setSaving(true);
    try {
      const updated = await transmitTenderToManager(selected._id);
      setSelected(updated);
      load();
      alert('Тендер передано менеджеру');
    } catch (e) {
      alert(e.message || 'Помилка передачі');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status) => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateTenderWatch(selected._id, { status });
      setSelected(updated);
      load();
    } catch (e) {
      alert(e.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const handleNotesBlur = async (notes) => {
    if (!selected) return;
    try {
      await updateTenderWatch(selected._id, { notes });
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm('Видалити тендер з робочого списку?')) return;
    setSaving(true);
    try {
      await deleteTenderWatch(selected._id);
      setSelected(null);
      load();
    } catch (e) {
      alert(e.message || 'Помилка видалення');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tender-watchlist-tab">
      <div className="tender-stats-grid">
        <div className="tender-stat-card">
          <span className="tender-stat-label">Усього</span>
          <strong>{stats?.total ?? '—'}</strong>
        </div>
        <div className="tender-stat-card">
          <span className="tender-stat-label">Нові</span>
          <strong>{stats?.byStatus?.new ?? '—'}</strong>
        </div>
        <div className="tender-stat-card">
          <span className="tender-stat-label">Призначено</span>
          <strong>{stats?.byStatus?.assigned ?? '—'}</strong>
        </div>
        <div className="tender-stat-card">
          <span className="tender-stat-label">Участь</span>
          <strong>{stats?.byStatus?.participating ?? '—'}</strong>
        </div>
        <div className="tender-stat-card tender-stat-card--urgent">
          <span className="tender-stat-label">Дедлайн ≤7 дн.</span>
          <strong>{stats?.urgent ?? '—'}</strong>
        </div>
      </div>

      <div className="tender-toolbar">
        <select
          className="tender-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">— Усі статуси —</option>
          {Object.entries(meta?.statuses || {}).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="button" className="tender-btn tender-btn-secondary" onClick={load}>Оновити</button>
      </div>

      <div className="tender-search-layout">
        <div className="tender-list-wrap">
          {loading ? (
            <div className="tender-loading">Завантаження...</div>
          ) : items.length === 0 ? (
            <div className="tender-empty">Робочий список порожній. Знайдіть тендери на вкладці «Пошук Prozorro».</div>
          ) : (
            <ul className="tender-list">
              {items.map((t) => (
                <li key={t._id}>
                  <button
                    type="button"
                    className={`tender-list-item ${selected?._id === t._id ? 'active' : ''}`}
                    onClick={() => {
                      setSelected(t);
                      setAssignLogin(t.assignedManagerLogin || '');
                    }}
                  >
                    <div className="tender-list-item-top">
                      <span className={`tender-score tender-score--${t.analysis?.recommendation || 'mid'}`}>
                        {t.analysis?.score ?? '—'}
                      </span>
                      <span className="tender-list-status">{meta?.statuses?.[t.status] || t.status}</span>
                    </div>
                    <div className="tender-list-title">{t.title || t.tenderNumber}</div>
                    <div className="tender-list-meta">
                      <span>{t.budgetFormatted || '—'}</span>
                      <span>{t.region || '—'}</span>
                      {t.assignedManagerName && <span>👤 {t.assignedManagerName}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tender-detail-wrap">
          {selected ? (
            <>
              <TenderDetailPanel
                tender={selected}
                analysis={selected.analysis}
                mode="watchlist"
              />
              <div className="tender-workflow">
                <h4>Передача менеджеру</h4>
                <div className="tender-workflow-row">
                  <select
                    className="tender-select"
                    value={assignLogin}
                    onChange={(e) => setAssignLogin(e.target.value)}
                  >
                    <option value="">— Оберіть менеджера —</option>
                    {managers.map((m) => (
                      <option key={m.login} value={m.login}>{m.name || m.login}</option>
                    ))}
                  </select>
                  <button type="button" className="tender-btn tender-btn-secondary" onClick={handleAssign} disabled={saving || !assignLogin}>
                    Призначити
                  </button>
                  <button type="button" className="tender-btn tender-btn-primary" onClick={handleTransmit} disabled={saving || !selected.assignedManagerLogin}>
                    Передати в роботу
                  </button>
                </div>
                <div className="tender-workflow-row">
                  <select
                    className="tender-select"
                    value={selected.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={saving}
                  >
                    {Object.entries(meta?.statuses || {}).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button type="button" className="tender-btn tender-btn-danger" onClick={handleDelete} disabled={saving}>
                    Видалити
                  </button>
                </div>
                <label className="tender-notes-label">
                  Нотатки тендерного відділу
                  <textarea
                    className="tender-textarea"
                    defaultValue={selected.notes || ''}
                    onBlur={(e) => handleNotesBlur(e.target.value)}
                    rows={3}
                    placeholder="Коментар для колег..."
                  />
                </label>
              </div>
            </>
          ) : (
            <div className="tender-detail-placeholder">
              <p>Оберіть тендер з робочого списку</p>
              <p className="tender-hint">Тут ви аналізуєте, призначаєте менеджера та передаєте в реалізацію.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TenderWatchlistTab;
