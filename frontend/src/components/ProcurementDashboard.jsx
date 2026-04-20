import React, { useCallback, useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import { tryHandleUnauthorizedResponse } from '../utils/authSession';
import './ProcurementDashboard.css';

const PRIORITY_OPTIONS = [
  { value: '1_workday', label: 'На протязі 1 робочого дня' },
  { value: '5_workdays', label: 'На протязі 5 робочих днів' },
  { value: '7_workdays', label: 'На протязі 7 робочих днів' },
  { value: 'more_than_7_workdays', label: 'Більше 7 робочих днів' }
];

const STATUS_LABELS = {
  pending_review: 'Очікує розгляду',
  in_progress: 'Взята в роботу',
  awaiting_warehouse: 'Чекає відвантаження на склад',
  completed: 'Повністю виконана'
};

function formatDt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

function priorityLabel(v) {
  return PRIORITY_OPTIONS.find((p) => p.value === v)?.label || v || '—';
}

function ProcurementDashboard({ user }) {
  const [activeSection, setActiveSection] = useState('active');
  const [requests, setRequests] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const [createForm, setCreateForm] = useState({
    description: '',
    priority: '5_workdays',
    desiredWarehouse: '',
    files: []
  });

  const [executorWarehouse, setExecutorWarehouse] = useState('');

  const role = String(user?.role || '').toLowerCase();
  const isVidZakupok = ['vidzakupok', 'admin', 'administrator'].includes(role);
  const isWarehouseConfirmer = ['warehouse', 'zavsklad', 'admin', 'administrator'].includes(role);

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('token');
    const h = { Authorization: `Bearer ${token}` };
    return h;
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setRequests(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadWarehouses = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/warehouses`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setWarehouses(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadRequests();
    loadWarehouses();
  }, [loadRequests, loadWarehouses]);

  const warehouseOptions = useMemo(() => {
    return warehouses
      .filter((w) => w.isActive !== false)
      .map((w) => ({ value: w.name || w._id, label: w.name || String(w._id) }));
  }, [warehouses]);

  const resetCreateForm = () => {
    setCreateForm({
      description: '',
      priority: '5_workdays',
      desiredWarehouse: '',
      files: []
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const desc = String(createForm.description || '').trim();
    if (!desc) {
      alert('Вкажіть опис заявки');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('description', desc);
      fd.append('priority', createForm.priority);
      fd.append('desiredWarehouse', String(createForm.desiredWarehouse || '').trim());
      (createForm.files || []).forEach((f) => fd.append('files', f));

      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/procurement-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося створити заявку');
        return;
      }
      setCreateOpen(false);
      resetCreateForm();
      await loadRequests();
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const downloadAttachment = async (requestId, att) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/procurement-requests/${requestId}/attachments/${att._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        alert('Не вдалося завантажити файл');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.originalName || 'file';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || 'Помилка завантаження');
    }
  };

  const takeInWork = async (id) => {
    if (!window.confirm('Взяти цю заявку в роботу?')) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${id}/take-in-work`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' }
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Помилка');
        return;
      }
      const updated = await res.json();
      setDetail(updated);
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const completeExecutor = async (id) => {
    const aw = String(executorWarehouse || '').trim();
    if (!aw) {
      alert('Оберіть або вкажіть фактичний склад відвантаження');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${id}/complete-executor`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualWarehouse: aw })
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Помилка');
        return;
      }
      const updated = await res.json();
      setDetail(updated);
      setExecutorWarehouse('');
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const warehouseConfirm = async (id) => {
    if (!window.confirm('Підтвердити надходження товару на склад?')) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${id}/warehouse-confirm`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' }
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Помилка');
        return;
      }
      const updated = await res.json();
      setDetail(updated);
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (row) => {
    setDetail(row);
    setExecutorWarehouse(row.actualWarehouse || '');
  };

  return (
    <div className="procurement-dashboard">
      <div className="procurement-dashboard-main">
        <aside className="procurement-sidebar">
          <div className="procurement-sidebar-inner">
            <nav className="procurement-sidebar-nav">
              <div className="procurement-sidebar-section-title">Відділ закупівель</div>
              <button
                type="button"
                className={`procurement-sidebar-tab ${activeSection === 'active' ? 'active' : ''}`}
                onClick={() => setActiveSection('active')}
              >
                <span className="tab-icon">📋</span>
                <span className="tab-label">Активні заявки на закупівлю</span>
              </button>
            </nav>
          </div>
        </aside>

        <main className="procurement-main-content">
          {activeSection === 'active' && (
            <div className="procurement-active-panel">
              <div className="procurement-toolbar">
                <h1 className="procurement-title">Активні заявки на закупівлю</h1>
                <button
                  type="button"
                  className="procurement-btn-primary"
                  onClick={() => setCreateOpen(true)}
                  disabled={saving}
                >
                  + Подати заявку
                </button>
              </div>
              <p className="procurement-hint">
                Статус заявки змінюється автоматично за подіями (розгляд → робота → очікування на складі →
                виконано). Поле статусу не редагується вручну.
              </p>

              {loading ? (
                <div className="procurement-loading">Завантаження…</div>
              ) : (
                <div className="procurement-table-wrap">
                  <table className="procurement-table">
                    <thead>
                      <tr>
                        <th>Статус</th>
                        <th>Опис</th>
                        <th>Відповідальний (хто подав)</th>
                        <th>Пріоритет</th>
                        <th>Дата подачі</th>
                        <th>Бажаний склад</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r) => (
                        <tr key={r._id}>
                          <td>
                            <span className={`procurement-status procurement-status--${r.status}`}>
                              {STATUS_LABELS[r.status] || r.status}
                            </span>
                          </td>
                          <td className="procurement-desc-cell">{r.description}</td>
                          <td>{r.requesterName || r.requesterLogin || '—'}</td>
                          <td>{priorityLabel(r.priority)}</td>
                          <td>{formatDt(r.createdAt)}</td>
                          <td>{r.desiredWarehouse || '—'}</td>
                          <td>
                            <button type="button" className="procurement-btn-link" onClick={() => openDetail(r)}>
                              Деталі
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!requests.length && (
                    <div className="procurement-empty">Немає заявок. Натисніть «Подати заявку».</div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {createOpen && (
        <div className="procurement-modal-overlay" role="dialog" aria-modal="true">
          <div className="procurement-modal">
            <div className="procurement-modal-header">
              <h2>Нова заявка на закупівлю</h2>
              <button
                type="button"
                className="procurement-modal-close"
                onClick={() => !saving && setCreateOpen(false)}
                aria-label="Закрити"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="procurement-modal-body">
              <label className="procurement-field">
                <span>Опис заявки *</span>
                <textarea
                  required
                  rows={4}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Опишіть товари та умови…"
                />
              </label>
              <label className="procurement-field">
                <span>Пріоритет *</span>
                <select
                  value={createForm.priority}
                  onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="procurement-field">
                <span>Бажаний склад відвантаження</span>
                <select
                  value={createForm.desiredWarehouse}
                  onChange={(e) => setCreateForm({ ...createForm, desiredWarehouse: e.target.value })}
                >
                  <option value="">— Оберіть склад —</option>
                  {warehouseOptions.map((w) => (
                    <option key={w.value} value={w.label}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="procurement-field">
                <span>Файли (Excel, Word, PDF)</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      files: e.target.files ? Array.from(e.target.files) : []
                    })
                  }
                />
                <span className="procurement-field-hint">До 12 файлів, кожен до 15 МБ; зберігаються в базі.</span>
              </label>
              <div className="procurement-modal-actions">
                <button type="button" className="procurement-btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
                  Скасувати
                </button>
                <button type="submit" className="procurement-btn-primary" disabled={saving}>
                  {saving ? 'Збереження…' : 'Подати заявку'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="procurement-modal-overlay" role="dialog" aria-modal="true">
          <div className="procurement-modal procurement-modal--wide">
            <div className="procurement-modal-header">
              <h2>Заявка на закупівлю</h2>
              <button
                type="button"
                className="procurement-modal-close"
                onClick={() => setDetail(null)}
                aria-label="Закрити"
              >
                ×
              </button>
            </div>
            <div className="procurement-modal-body procurement-detail-grid">
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Статус заявки</span>
                <span className="procurement-detail-v">{STATUS_LABELS[detail.status] || detail.status}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Опис заявки</span>
                <span className="procurement-detail-v">{detail.description}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Відповідальний за запит (хто подав)</span>
                <span className="procurement-detail-v">{detail.requesterName || detail.requesterLogin || '—'}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Пріоритет заявки</span>
                <span className="procurement-detail-v">{priorityLabel(detail.priority)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Дата та час подачі заявки</span>
                <span className="procurement-detail-v">{formatDt(detail.createdAt)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Бажаний склад відвантаження</span>
                <span className="procurement-detail-v">{detail.desiredWarehouse || '—'}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Фактичний склад відвантаження</span>
                <span className="procurement-detail-v">{detail.actualWarehouse || '—'}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Дата виконання (відділ закупівель)</span>
                <span className="procurement-detail-v">{formatDt(detail.executorCompletedAt)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">П.І.Б. виконавця заявки (VidZakupok)</span>
                <span className="procurement-detail-v">{detail.executorName || detail.executorLogin || '—'}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Дата відвантаження на склад (затвердження завскладу)</span>
                <span className="procurement-detail-v">{formatDt(detail.warehouseReceivedAt)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">П.І.Б. завскладу (підтвердження надходження)</span>
                <span className="procurement-detail-v">
                  {detail.warehouseConfirmerName || detail.warehouseConfirmerLogin || '—'}
                </span>
              </div>

              <div className="procurement-detail-files">
                <span className="procurement-detail-k">Вкладення</span>
                <div className="procurement-detail-v">
                  {(detail.attachments || []).length === 0 && <span>—</span>}
                  {(detail.attachments || []).map((a) => (
                    <button
                      key={a._id}
                      type="button"
                      className="procurement-file-link"
                      onClick={() => downloadAttachment(detail._id, a)}
                    >
                      {a.originalName}
                      {a.size ? ` (${Math.round(a.size / 1024)} КБ)` : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div className="procurement-detail-actions">
                {detail.status === 'pending_review' && isVidZakupok && (
                  <button
                    type="button"
                    className="procurement-btn-primary"
                    disabled={saving}
                    onClick={() => takeInWork(detail._id)}
                  >
                    Взяти в роботу
                  </button>
                )}
                {detail.status === 'in_progress' && isVidZakupok && (
                  <div className="procurement-executor-block">
                    <label className="procurement-field procurement-field--inline">
                      <span>Фактичний склад відвантаження *</span>
                      <input
                        type="text"
                        list="procurement-wh-executor"
                        value={executorWarehouse}
                        onChange={(e) => setExecutorWarehouse(e.target.value)}
                        placeholder="Оберіть зі списку або введіть назву"
                      />
                      <datalist id="procurement-wh-executor">
                        {warehouseOptions.map((w) => (
                          <option key={w.value} value={w.label} />
                        ))}
                      </datalist>
                    </label>
                    <button
                      type="button"
                      className="procurement-btn-primary"
                      disabled={saving}
                      onClick={() => completeExecutor(detail._id)}
                    >
                      Підтвердити відвантаження (завершити етап закупівель)
                    </button>
                  </div>
                )}
                {detail.status === 'awaiting_warehouse' && isWarehouseConfirmer && (
                  <button
                    type="button"
                    className="procurement-btn-primary"
                    disabled={saving}
                    onClick={() => warehouseConfirm(detail._id)}
                  >
                    Підтвердити надходження на склад
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProcurementDashboard;
