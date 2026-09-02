import React, { useState, useEffect, useCallback } from 'react';
import {
  getMarketingLeadsPage,
  getMarketingLeadsMeta,
  getMarketingLeadsStats,
  createMarketingLead,
  assignMarketingLead,
  transmitMarketingLead,
  updateMarketingLead,
  archiveMarketingLead,
  restoreMarketingLead,
} from '../../utils/marketingLeadsAPI';
import { getUsers } from '../../utils/clientsAPI';
import MarketingLeadAttribution from './MarketingLeadAttribution';
import MarketingLeadRejectModal from './MarketingLeadRejectModal';
import './MarketingLeads.css';

const EMPTY_FORM = {
  source: 'manual',
  clientName: '',
  contactPhone: '',
  contactEmail: '',
  city: '',
  region: '',
  productInterest: '',
  powerRequired: '',
  budget: '',
  comment: '',
  priority: 'normal',
  marketingNotes: '',
};

const ARCHIVABLE_STATUSES = ['in_progress', 'rejected', 'converted'];
const PAGE_SIZE = 50;

function MarketingLeadsTab({ user, mode = 'active', onArchiveChange }) {
  const isArchiveMode = mode === 'archive';
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState({ sources: {}, statuses: {}, interactionTypes: {} });
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', source: '', search: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState(null);
  const [assignLogin, setAssignLogin] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = isArchiveMode ? { archived: '1' } : {};
      if (filters.status) params.status = filters.status;
      if (filters.source) params.source = filters.source;
      if (debouncedSearch) params.search = debouncedSearch;
      const requests = [
        getMarketingLeadsPage({ ...params, limit: PAGE_SIZE, skip: page * PAGE_SIZE }),
        getMarketingLeadsMeta(),
      ];
      if (!isArchiveMode) {
        requests.splice(1, 0, getMarketingLeadsStats().catch(() => null));
      }
      const results = await Promise.all(requests);
      const pageData = results[0];
      const st = isArchiveMode ? null : results[1];
      const m = isArchiveMode ? results[1] : results[2];
      setLeads(pageData.items);
      setTotal(pageData.total);
      setStats(st);
      setMeta(m || { sources: {}, statuses: {} });
      if (!isArchiveMode && st && typeof onArchiveChange === 'function') {
        onArchiveChange(st.archivedCount ?? 0);
      }
      // сторінка могла спорожніти після архівації останнього ліда
      if (pageData.items.length === 0 && page > 0) {
        setPage((p) => Math.max(p - 1, 0));
      }
    } catch (e) {
      console.error(e);
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [isArchiveMode, filters.status, filters.source, debouncedSearch, page, onArchiveChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 1000);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    setPage(0);
  }, [filters.status, filters.source, debouncedSearch, isArchiveMode]);

  useEffect(() => {
    load();
    if (!isArchiveMode) {
      getUsers().then((list) => {
        setManagers((list || []).filter((u) => (u.role || '').toLowerCase() === 'manager'));
      });
    }
  }, [load, isArchiveMode]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createMarketingLead(form);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      alert(err.message || 'Помилка створення');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!selected || !assignLogin) return;
    setSaving(true);
    try {
      const updated = await assignMarketingLead(selected._id, assignLogin);
      setSelected(updated);
      load();
    } catch (err) {
      alert(err.message || 'Помилка призначення');
    } finally {
      setSaving(false);
    }
  };

  const handleTransmit = async () => {
    if (!selected) return;
    if (!window.confirm('Передати заявку менеджеру в роботу?')) return;
    setSaving(true);
    try {
      const updated = await transmitMarketingLead(selected._id);
      setSelected(updated);
      load();
    } catch (err) {
      alert(err.message || 'Помилка передачі');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (reason) => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateMarketingLead(selected._id, {
        status: 'rejected',
        rejectionReason: reason,
        statusNote: reason,
      });
      setShowRejectModal(false);
      setSelected(null);
      load();
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (lead, e) => {
    e?.stopPropagation?.();
    const target = lead || selected;
    if (!target) return;
    if (!window.confirm(`Відправити заявку ${target.requestNumber || ''} в архів?`)) return;
    setSaving(true);
    try {
      await archiveMarketingLead(target._id);
      if (selected?._id === target._id) setSelected(null);
      load();
    } catch (err) {
      alert(err.message || 'Помилка архівації');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (lead, e) => {
    e?.stopPropagation?.();
    const target = lead || selected;
    if (!target) return;
    if (!window.confirm(`Повернути заявку ${target.requestNumber || ''} з архіву?`)) return;
    setSaving(true);
    try {
      await restoreMarketingLead(target._id);
      if (selected?._id === target._id) setSelected(null);
      load();
      if (typeof onArchiveChange === 'function') {
        getMarketingLeadsStats().then((st) => onArchiveChange(st?.archivedCount ?? 0)).catch(() => {});
      }
    } catch (err) {
      alert(err.message || 'Помилка повернення');
    } finally {
      setSaving(false);
    }
  };

  const canArchiveLead = (lead) => !isArchiveMode && ARCHIVABLE_STATUSES.includes(lead?.status) && !lead?.archived;

  const managerWorkStatusClass = (lead) => {
    if (lead?.status === 'transmitted') return 'waiting';
    if (lead?.status === 'in_progress') return 'in_progress';
    if (lead?.status === 'rejected') return 'rejected';
    if (lead?.status === 'converted') return 'converted';
    return 'none';
  };

  const formatDate = (d) => (d ? new Date(d).toLocaleString('uk-UA') : '—');

  return (
    <div className="marketing-leads-tab">
      {isArchiveMode ? (
        <div className="marketing-archive-intro">
          <p>Заявки, відхилені маркетингом або перенесені в архів після роботи менеджера.</p>
        </div>
      ) : (
        <div className="marketing-stats-grid">
          <div className="marketing-stat-card">
            <span className="marketing-stat-label">Сьогодні</span>
            <strong>{stats?.todayCount ?? '—'}</strong>
          </div>
          <div className="marketing-stat-card">
            <span className="marketing-stat-label">Нові</span>
            <strong>{stats?.byStatus?.new ?? '—'}</strong>
          </div>
          <div className="marketing-stat-card">
            <span className="marketing-stat-label">Передано</span>
            <strong>{stats?.byStatus?.transmitted ?? '—'}</strong>
          </div>
          <div className="marketing-stat-card">
            <span className="marketing-stat-label">В роботі</span>
            <strong>{stats?.byStatus?.in_progress ?? '—'}</strong>
          </div>
          <div className="marketing-stat-card">
            <span className="marketing-stat-label">Конвертовано</span>
            <strong>{stats?.byStatus?.converted ?? '—'}</strong>
          </div>
        </div>
      )}

      <div className="marketing-toolbar">
        <input
          type="text"
          className="marketing-input"
          placeholder="Пошук: ім’я, телефон, місто..."
          value={filters.search}
          onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setDebouncedSearch(filters.search.trim());
          }}
        />
        <select
          className="marketing-select"
          value={filters.status}
          onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
        >
          <option value="">— Статус —</option>
          {Object.entries(meta.statuses || {}).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          className="marketing-select"
          value={filters.source}
          onChange={(e) => setFilters((p) => ({ ...p, source: e.target.value }))}
        >
          <option value="">— Джерело —</option>
          {Object.entries(meta.sources || {}).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="button" className="marketing-btn marketing-btn-secondary" onClick={load}>Оновити</button>
        {!isArchiveMode && (
          <button type="button" className="marketing-btn marketing-btn-primary" onClick={() => setShowCreate(true)}>
            + Нова заявка
          </button>
        )}
      </div>

      <div className="marketing-leads-layout">
        <div className="marketing-leads-list-wrap">
          {loading ? (
            <div className="marketing-loading">Завантаження...</div>
          ) : leads.length === 0 ? (
            <div className="marketing-empty">{isArchiveMode ? 'Архів порожній' : 'Заявок немає'}</div>
          ) : (
            <table className="marketing-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>{isArchiveMode ? 'Дата архівації' : 'Дата'}</th>
                  <th>Джерело</th>
                  <th>Клієнт</th>
                  <th>Телефон</th>
                  <th>Статус</th>
                  {!isArchiveMode && <th>Менеджер</th>}
                  <th>Статус роботи</th>
                  <th>Коментар</th>
                  {!isArchiveMode && <th>Кому належить клієнт</th>}
                  <th>Дії</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l._id}
                    className={selected?._id === l._id ? 'selected' : ''}
                    onClick={() => { setSelected(l); setAssignLogin(l.assignedManagerLogin || ''); }}
                  >
                    <td>{l.requestNumber || '—'}</td>
                    <td>{formatDate(isArchiveMode ? (l.archivedAt || l.updatedAt) : l.createdAt)}</td>
                    <td>{meta.sources?.[l.source] || l.source}</td>
                    <td>{l.clientName || '—'}</td>
                    <td>{l.contactPhone || '—'}</td>
                    <td><span className={`marketing-status marketing-status--${l.status}`}>{meta.statuses?.[l.status] || l.status}</span></td>
                    {!isArchiveMode && <td>{l.assignedManagerName || '—'}</td>}
                    <td>
                      <span className={`marketing-work-status marketing-work-status--${managerWorkStatusClass(l)}`}>
                        {l.managerWorkStatusLabel || '—'}
                      </span>
                    </td>
                    <td className="marketing-table-comment">{l.managerWorkComment || l.archiveNote || '—'}</td>
                    {!isArchiveMode && <td>{l.clientOwnerName || '—'}</td>}
                    <td className="marketing-table-actions" onClick={(e) => e.stopPropagation()}>
                      {isArchiveMode ? (
                        <button type="button" className="marketing-btn marketing-btn-secondary marketing-btn-compact" disabled={saving} onClick={(e) => handleRestore(l, e)}>
                          Повернути
                        </button>
                      ) : canArchiveLead(l) ? (
                        <button type="button" className="marketing-btn marketing-btn-ghost marketing-btn-compact" disabled={saving} onClick={(e) => handleArchive(l, e)}>
                          В архів
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && total > 0 && (
            <div className="marketing-pagination">
              <button
                type="button"
                className="marketing-btn marketing-btn-secondary marketing-btn-compact"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
              >
                ← Назад
              </button>
              <span className="marketing-pagination-info">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} з {total}
              </span>
              <button
                type="button"
                className="marketing-btn marketing-btn-secondary marketing-btn-compact"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Далі →
              </button>
            </div>
          )}
        </div>

        {selected && (
          <aside className="marketing-lead-detail card-vip">
            <h3>{selected.requestNumber} · {meta.statuses?.[selected.status]}</h3>
            {isArchiveMode && (
              <>
                <p><strong>Архівовано:</strong> {formatDate(selected.archivedAt)}</p>
                <p><strong>Ким:</strong> {selected.archivedByName || selected.archivedByLogin || '—'}</p>
              </>
            )}
            <p><strong>Клієнт:</strong> {selected.clientName || '—'}</p>
            <p><strong>Тел:</strong> {selected.contactPhone || '—'}</p>
            <p><strong>Email:</strong> {selected.contactEmail || '—'}</p>
            <p><strong>Місто:</strong> {selected.city || '—'}</p>
            <p><strong>Інтерес:</strong> {selected.productInterest || '—'}</p>
            <p><strong>Коментар роботи:</strong> {selected.managerWorkComment || '—'}</p>
            {!isArchiveMode && <p><strong>Кому належить клієнт:</strong> {selected.clientOwnerName || '—'}</p>}
            <p><strong>Коментар:</strong> {selected.comment || '—'}</p>
            <MarketingLeadAttribution lead={selected} interactionLabels={meta.interactionTypes} />
            {!isArchiveMode && (
              <>
                <div className="marketing-assign-row">
                  <select
                    className="marketing-select"
                    value={assignLogin}
                    onChange={(e) => setAssignLogin(e.target.value)}
                  >
                    <option value="">— Менеджер —</option>
                    {managers.map((m) => (
                      <option key={m.login} value={m.login}>{m.name || m.login}</option>
                    ))}
                  </select>
                  <button type="button" className="marketing-btn marketing-btn-secondary" disabled={!assignLogin || saving} onClick={handleAssign}>
                    Призначити
                  </button>
                </div>
                <div className="marketing-detail-actions">
                  <button type="button" className="marketing-btn marketing-btn-primary" disabled={!selected.assignedManagerLogin || saving || selected.status === 'transmitted'} onClick={handleTransmit}>
                    Передати менеджеру
                  </button>
                  <button type="button" className="marketing-btn marketing-btn-ghost" disabled={saving} onClick={() => setShowRejectModal(true)}>
                    Відхилити
                  </button>
                  {canArchiveLead(selected) && (
                    <button type="button" className="marketing-btn marketing-btn-secondary" disabled={saving} onClick={() => handleArchive(selected)}>
                      В архів
                    </button>
                  )}
                </div>
              </>
            )}
            {isArchiveMode && (
              <div className="marketing-detail-actions">
                <button type="button" className="marketing-btn marketing-btn-primary" disabled={saving} onClick={() => handleRestore(selected)}>
                  Повернути з архіву
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      {showCreate && (
        <div className="marketing-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="marketing-modal card-vip" onClick={(e) => e.stopPropagation()}>
            <h3>Нова заявка (телефон / вручну)</h3>
            <form onSubmit={handleCreate} className="marketing-form">
              <label>Ім’я / компанія<input className="marketing-input" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></label>
              <label>Телефон *<input className="marketing-input" required value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></label>
              <label>Email<input className="marketing-input" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></label>
              <label>Місто<input className="marketing-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
              <label>Інтерес (продукт)<input className="marketing-input" value={form.productInterest} onChange={(e) => setForm({ ...form, productInterest: e.target.value })} /></label>
              <label>Коментар<textarea className="marketing-input" rows={3} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></label>
              <div className="marketing-modal-actions">
                <button type="button" className="marketing-btn marketing-btn-ghost" onClick={() => setShowCreate(false)}>Скасувати</button>
                <button type="submit" className="marketing-btn marketing-btn-primary" disabled={saving}>{saving ? '...' : 'Створити'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MarketingLeadRejectModal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={handleReject}
        saving={saving}
      />
    </div>
  );
}

export default MarketingLeadsTab;
