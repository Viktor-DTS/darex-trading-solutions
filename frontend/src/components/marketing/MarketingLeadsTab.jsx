import React, { useState, useEffect } from 'react';
import {
  getMarketingLeads,
  getMarketingLeadsMeta,
  getMarketingLeadsStats,
  createMarketingLead,
  assignMarketingLead,
  transmitMarketingLead,
  updateMarketingLead,
} from '../../utils/marketingLeadsAPI';
import { getUsers } from '../../utils/clientsAPI';
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

function MarketingLeadsTab({ user }) {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState({ sources: {}, statuses: {} });
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', source: '', search: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState(null);
  const [assignLogin, setAssignLogin] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.source) params.source = filters.source;
      if (filters.search.trim()) params.search = filters.search.trim();
      const [list, st, m] = await Promise.all([
        getMarketingLeads(params),
        getMarketingLeadsStats().catch(() => null),
        getMarketingLeadsMeta().catch(() => ({ sources: {}, statuses: {} })),
      ]);
      setLeads(Array.isArray(list) ? list : []);
      setStats(st);
      setMeta(m);
    } catch (e) {
      console.error(e);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    getUsers().then((list) => {
      setManagers((list || []).filter((u) => (u.role || '').toLowerCase() === 'manager'));
    });
  }, [filters.status, filters.source]);

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

  const handleReject = async () => {
    if (!selected) return;
    const reason = window.prompt('Причина відхилення (необов’язково):');
    if (reason === null) return;
    setSaving(true);
    try {
      await updateMarketingLead(selected._id, { status: 'rejected', statusNote: reason });
      setSelected(null);
      load();
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => (d ? new Date(d).toLocaleString('uk-UA') : '—');

  return (
    <div className="marketing-leads-tab">
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

      <div className="marketing-toolbar">
        <input
          type="text"
          className="marketing-input"
          placeholder="Пошук: ім’я, телефон, місто..."
          value={filters.search}
          onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && load()}
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
        <button type="button" className="marketing-btn marketing-btn-primary" onClick={() => setShowCreate(true)}>
          + Нова заявка
        </button>
      </div>

      <div className="marketing-leads-layout">
        <div className="marketing-leads-list-wrap">
          {loading ? (
            <div className="marketing-loading">Завантаження...</div>
          ) : leads.length === 0 ? (
            <div className="marketing-empty">Заявок немає</div>
          ) : (
            <table className="marketing-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Дата</th>
                  <th>Джерело</th>
                  <th>Клієнт</th>
                  <th>Телефон</th>
                  <th>Статус</th>
                  <th>Менеджер</th>
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
                    <td>{formatDate(l.createdAt)}</td>
                    <td>{meta.sources?.[l.source] || l.source}</td>
                    <td>{l.clientName || '—'}</td>
                    <td>{l.contactPhone || '—'}</td>
                    <td><span className={`marketing-status marketing-status--${l.status}`}>{meta.statuses?.[l.status] || l.status}</span></td>
                    <td>{l.assignedManagerName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <aside className="marketing-lead-detail card-vip">
            <h3>{selected.requestNumber} · {meta.statuses?.[selected.status]}</h3>
            <p><strong>Клієнт:</strong> {selected.clientName || '—'}</p>
            <p><strong>Тел:</strong> {selected.contactPhone || '—'}</p>
            <p><strong>Email:</strong> {selected.contactEmail || '—'}</p>
            <p><strong>Місто:</strong> {selected.city || '—'}</p>
            <p><strong>Інтерес:</strong> {selected.productInterest || '—'}</p>
            <p><strong>Коментар:</strong> {selected.comment || '—'}</p>
            {(selected.utmCampaign || selected.metaCampaignId) && (
              <div className="marketing-utm-block">
                <strong>Кампанія:</strong> {selected.utmCampaign || selected.metaCampaignId}
              </div>
            )}
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
              <button type="button" className="marketing-btn marketing-btn-ghost" disabled={saving} onClick={handleReject}>
                Відхилити
              </button>
            </div>
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
    </div>
  );
}

export default MarketingLeadsTab;
