import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API_BASE_URL from '../config';
import { tryHandleUnauthorizedResponse } from '../utils/authSession';
import './ProcurementDashboard.css';

const PRIORITY_OPTIONS = [
  { value: '1_workday', label: 'На протязі 1 робочого дня' },
  { value: '5_workdays', label: 'На протязі 5 робочих днів' },
  { value: '7_workdays', label: 'На протязі 7 робочих днів' },
  { value: 'more_than_7_workdays', label: 'Більше 7 робочих днів' }
];

const APPLICATION_KIND_OPTIONS = [
  { value: 'purchase', label: 'Закупівля' },
  { value: 'price_determination', label: 'Визначення ціни' }
];

const STATUS_LABELS = {
  pending_review: 'Очікує розгляду',
  in_progress: 'Взята в роботу',
  awaiting_warehouse: 'Чекає відвантаження на склад',
  completed: 'Повністю виконана'
};

const PAYER_COMPANY_OPTIONS = [
  { value: 'dts', label: 'ДТС' },
  { value: 'dareks_energo', label: 'Дарекс Енерго' }
];

function payerCompanyLabel(v) {
  return PAYER_COMPANY_OPTIONS.find((p) => p.value === v)?.label || v || '—';
}

function applicationKindLabel(row) {
  if (row.applicationKind) {
    return APPLICATION_KIND_OPTIONS.find((p) => p.value === row.applicationKind)?.label || row.applicationKind;
  }
  const legacy = String(row.description || '').trim();
  if (legacy) return legacy.length > 120 ? `${legacy.slice(0, 120)}…` : legacy;
  return '—';
}

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

function emptyMaterialRow() {
  return { name: '', quantity: '', price: '', productId: '' };
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
    applicationKind: 'purchase',
    payerCompany: '',
    priority: '5_workdays',
    desiredWarehouse: '',
    materials: [emptyMaterialRow()],
    notes: '',
    files: []
  });

  const [executorWarehouse, setExecutorWarehouse] = useState('');
  const [nomenclatureHints, setNomenclatureHints] = useState([]);
  const [hintsForRow, setHintsForRow] = useState(null);
  const hintDebounceRef = useRef(null);

  const role = String(user?.role || '').toLowerCase();
  const isVidZakupok = ['vidzakupok', 'admin', 'administrator'].includes(role);
  const isWarehouseConfirmer = ['warehouse', 'zavsklad', 'admin', 'administrator'].includes(role);
  const isAdmin = ['admin', 'administrator'].includes(role);

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
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
      applicationKind: 'purchase',
      payerCompany: '',
      priority: '5_workdays',
      desiredWarehouse: '',
      materials: [emptyMaterialRow()],
      notes: '',
      files: []
    });
    setNomenclatureHints([]);
    setHintsForRow(null);
  };

  const requestNomenclatureHints = useCallback(
    (rowIndex, query) => {
      if (hintDebounceRef.current) clearTimeout(hintDebounceRef.current);
      const q = String(query || '').trim();
      if (q.length < 2) {
        setNomenclatureHints([]);
        setHintsForRow(null);
        return;
      }
      hintDebounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/procurement-requests/nomenclature-hints?q=${encodeURIComponent(q)}`,
            { headers: authHeaders }
          );
          if (tryHandleUnauthorizedResponse(res)) return;
          if (res.ok) {
            const data = await res.json();
            setNomenclatureHints(Array.isArray(data) ? data : []);
            setHintsForRow(rowIndex);
          }
        } catch (e) {
          console.error(e);
        }
      }, 320);
    },
    [authHeaders]
  );

  const updateMaterialRow = (idx, patch) => {
    setCreateForm((prev) => {
      const materials = [...prev.materials];
      materials[idx] = { ...materials[idx], ...patch };
      return { ...prev, materials };
    });
  };

  const addMaterialRow = () => {
    setCreateForm((prev) => ({ ...prev, materials: [...prev.materials, emptyMaterialRow()] }));
  };

  const removeMaterialRow = (idx) => {
    setCreateForm((prev) => {
      if (prev.materials.length <= 1) return prev;
      const materials = prev.materials.filter((_, i) => i !== idx);
      return { ...prev, materials };
    });
  };

  const pickNomenclatureHint = (rowIndex, hint) => {
    updateMaterialRow(rowIndex, {
      name: hint.label,
      productId: hint.id ? String(hint.id) : ''
    });
    setNomenclatureHints([]);
    setHintsForRow(null);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.applicationKind) {
      alert('Оберіть тип заявки');
      return;
    }
    if (!createForm.payerCompany) {
      alert('Оберіть компанію платника');
      return;
    }
    const dw = String(createForm.desiredWarehouse || '').trim();
    if (!dw) {
      alert('Оберіть бажаний склад відвантаження');
      return;
    }
    const materialsPayload = createForm.materials
      .filter((m) => m && String(m.name || '').trim())
      .map((m) => ({
        name: String(m.name).trim(),
        quantity: m.quantity === '' ? null : Number(m.quantity),
        price: m.price === '' ? null : Number(m.price),
        productId: m.productId || null
      }));

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('applicationKind', createForm.applicationKind);
      fd.append('payerCompany', createForm.payerCompany);
      fd.append('priority', createForm.priority);
      fd.append('desiredWarehouse', dw);
      fd.append('notes', String(createForm.notes || '').trim());
      fd.append('materials', JSON.stringify(materialsPayload));
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

  const downloadAttachment = async (requestId, att, kind = 'requester') => {
    try {
      const token = localStorage.getItem('token');
      const path =
        kind === 'executor'
          ? `${API_BASE_URL}/procurement-requests/${requestId}/executor-attachments/${att._id}`
          : `${API_BASE_URL}/procurement-requests/${requestId}/attachments/${att._id}`;
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
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

  const uploadExecutorFiles = async (requestId, fileList) => {
    if (!fileList || !fileList.length) return;
    setSaving(true);
    try {
      const fd = new FormData();
      Array.from(fileList).forEach((f) => fd.append('files', f));
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${requestId}/executor-attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося завантажити файли');
        return;
      }
      const updated = await res.json();
      setDetail(updated);
      await loadRequests();
    } finally {
      setSaving(false);
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

  const canUploadExecutorFiles = (d) => {
    if (!d || d.applicationKind !== 'price_determination' || d.status !== 'in_progress') return false;
    if (!isVidZakupok) return false;
    if (isAdmin) return true;
    return String(d.executorLogin || '') === String(user?.login || '');
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
                        <th>Тип заявки</th>
                        <th>Компанія платник</th>
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
                          <td className="procurement-desc-cell">{applicationKindLabel(r)}</td>
                          <td>{payerCompanyLabel(r.payerCompany)}</td>
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
          <div className="procurement-modal procurement-modal--xlarge">
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
                <span>Тип заявки *</span>
                <select
                  required
                  value={createForm.applicationKind}
                  onChange={(e) => setCreateForm({ ...createForm, applicationKind: e.target.value })}
                >
                  {APPLICATION_KIND_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="procurement-field">
                <span>Компанія платник *</span>
                <select
                  required
                  value={createForm.payerCompany}
                  onChange={(e) => setCreateForm({ ...createForm, payerCompany: e.target.value })}
                >
                  <option value="" disabled>
                    — Оберіть компанію —
                  </option>
                  {PAYER_COMPANY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
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
                <span>Бажаний склад відвантаження *</span>
                <select
                  required
                  value={createForm.desiredWarehouse}
                  onChange={(e) => setCreateForm({ ...createForm, desiredWarehouse: e.target.value })}
                >
                  <option value="" disabled>
                    — Оберіть склад —
                  </option>
                  {warehouseOptions.map((w) => (
                    <option key={w.value} value={w.label}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="procurement-field procurement-materials-block">
                <span>Найменування матеріалів</span>
                <p className="procurement-field-hint">
                  Підказки з номенклатури складу (карточки продуктів). Введіть від 2 символів для пошуку.
                </p>
                <div className="procurement-materials-head">
                  <span>Найменування</span>
                  <span>Кількість</span>
                  <span>Ціна</span>
                  <span></span>
                </div>
                {createForm.materials.map((row, idx) => (
                  <div key={idx} className="procurement-material-row">
                    <div className="procurement-material-cell procurement-material-cell--name">
                      <input
                        type="text"
                        value={row.name}
                        autoComplete="off"
                        onChange={(e) => {
                          const v = e.target.value;
                          updateMaterialRow(idx, { name: v, productId: '' });
                          requestNomenclatureHints(idx, v);
                        }}
                        onFocus={() => {
                          if (String(row.name || '').trim().length >= 2) {
                            requestNomenclatureHints(idx, row.name);
                          }
                        }}
                        placeholder="Пошук з бази або вручну"
                      />
                      {hintsForRow === idx && nomenclatureHints.length > 0 && (
                        <ul className="procurement-hints-list" role="listbox">
                          {nomenclatureHints.map((h) => (
                            <li key={String(h.id)}>
                              <button
                                type="button"
                                className="procurement-hint-item"
                                onClick={() => pickNomenclatureHint(idx, h)}
                              >
                                <span className="procurement-hint-label">{h.label}</span>
                                {h.subtitle ? (
                                  <span className="procurement-hint-sub">{h.subtitle}</span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="procurement-material-cell">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(e) => updateMaterialRow(idx, { quantity: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="procurement-material-cell">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.price}
                        onChange={(e) => updateMaterialRow(idx, { price: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="procurement-material-cell procurement-material-cell--actions">
                      <button
                        type="button"
                        className="procurement-btn-icon"
                        title="Видалити рядок"
                        onClick={() => removeMaterialRow(idx)}
                        disabled={createForm.materials.length <= 1}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="procurement-btn-secondary procurement-add-line" onClick={addMaterialRow}>
                  + Додати матеріал
                </button>
              </div>

              <label className="procurement-field">
                <span>Файли заявника (Excel, Word, PDF)</span>
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

              <label className="procurement-field">
                <span>Примітки</span>
                <textarea
                  rows={5}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Додаткові коментарі до заявки…"
                />
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
                <span className="procurement-detail-k">Тип заявки</span>
                <span className="procurement-detail-v">{applicationKindLabel(detail)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Компанія платник</span>
                <span className="procurement-detail-v">{payerCompanyLabel(detail.payerCompany)}</span>
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

              {(detail.materials || []).length > 0 && (
                <div className="procurement-detail-materials">
                  <span className="procurement-detail-k">Матеріали</span>
                  <div className="procurement-detail-v">
                    <table className="procurement-mini-table">
                      <thead>
                        <tr>
                          <th>Найменування</th>
                          <th>Кількість</th>
                          <th>Ціна</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.materials.map((m, i) => (
                          <tr key={i}>
                            <td>{m.name}</td>
                            <td>{m.quantity != null && m.quantity !== '' ? m.quantity : '—'}</td>
                            <td>{m.price != null && m.price !== '' ? m.price : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {String(detail.notes || '').trim() ? (
                <div className="procurement-detail-row procurement-detail-row--block">
                  <span className="procurement-detail-k">Примітки</span>
                  <span className="procurement-detail-v procurement-detail-notes">{detail.notes}</span>
                </div>
              ) : null}

              <div className="procurement-detail-files">
                <span className="procurement-detail-k">Файли заявника</span>
                <div className="procurement-detail-v">
                  {(detail.attachments || []).length === 0 && <span>—</span>}
                  {(detail.attachments || []).map((a) => (
                    <button
                      key={a._id}
                      type="button"
                      className="procurement-file-link"
                      onClick={() => downloadAttachment(detail._id, a, 'requester')}
                    >
                      {a.originalName}
                      {a.size ? ` (${Math.round(a.size / 1024)} КБ)` : ''}
                    </button>
                  ))}
                </div>
              </div>

              {(detail.applicationKind === 'price_determination' || (detail.executorAttachments || []).length > 0) && (
                <div className="procurement-detail-files">
                  <span className="procurement-detail-k">Файли виконавця (перевірка / кошторис)</span>
                  <div className="procurement-detail-v">
                    {(detail.executorAttachments || []).length === 0 && <span>—</span>}
                    {(detail.executorAttachments || []).map((a) => (
                      <button
                        key={a._id}
                        type="button"
                        className="procurement-file-link procurement-file-link--executor"
                        onClick={() => downloadAttachment(detail._id, a, 'executor')}
                      >
                        {a.originalName}
                        {a.size ? ` (${Math.round(a.size / 1024)} КБ)` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {canUploadExecutorFiles(detail) && (
                <div className="procurement-executor-upload">
                  <span className="procurement-detail-k">Завантажити файли виконавця</span>
                  <div className="procurement-detail-v">
                    <input
                      type="file"
                      multiple
                      disabled={saving}
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => {
                        const fl = e.target.files;
                        if (fl && fl.length) uploadExecutorFiles(detail._id, fl);
                        e.target.value = '';
                      }}
                    />
                    <span className="procurement-field-hint">
                      Після перевірки кошторису завантажте відредагований файл (до 12 файлів за раз).
                    </span>
                  </div>
                </div>
              )}

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
