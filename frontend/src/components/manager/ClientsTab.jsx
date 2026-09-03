import React, { useState, useEffect, useCallback } from 'react';
import {
  getClients,
  getClientsFilters,
  getClientsStats,
  addClientInteraction,
} from '../../utils/clientsAPI';
import ClientFormModal from './ClientFormModal';
import ClientCardModal from './ClientCardModal';
import SaleFormModal from './SaleFormModal';
import './ManagerTabs.css';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 400;

const FOLLOW_UP_OPTIONS = [
  { value: '', label: 'Усі клієнти' },
  { value: 'overdue', label: 'Прострочений follow-up' },
  { value: 'today', label: 'Follow-up сьогодні' },
  { value: 'upcoming', label: 'Запланований' },
  { value: 'stale', label: 'Без контакту >7 днів' },
];

function formatShortDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function followUpTone(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  if (d < start) return 'overdue';
  if (d <= end) return 'today';
  return 'upcoming';
}

function ClientsTab({ user }) {
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [followUpFilter, setFollowUpFilter] = useState('');
  const [filterOptions, setFilterOptions] = useState({ regions: [], managers: [] });
  const [showFormModal, setShowFormModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [saleInitialClient, setSaleInitialClient] = useState(null);
  const [quickActionClient, setQuickActionClient] = useState(null);
  const [quickActionType, setQuickActionType] = useState('note');
  const [quickNotes, setQuickNotes] = useState('');
  const [quickFollowUp, setQuickFollowUp] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const isAdmin = user?.role && ['admin', 'administrator', 'mgradm'].includes(user.role);

  const loadFilters = useCallback(async () => {
    if (!isAdmin) return;
    const opts = await getClientsFilters();
    setFilterOptions(opts);
  }, [isAdmin]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchApplied(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        q: searchApplied || undefined,
        region: isAdmin ? (regionFilter || undefined) : undefined,
        manager: isAdmin ? (managerFilter || undefined) : undefined,
        followUp: followUpFilter || undefined,
      };
      const [data, statsData] = await Promise.all([
        getClients(params),
        getClientsStats({
          region: isAdmin ? (regionFilter || undefined) : undefined,
          manager: isAdmin ? (managerFilter || undefined) : undefined,
        }),
      ]);
      const list = Array.isArray(data) ? data : (data.clients || []);
      setClients(list);
      setTotal(data.total ?? list.length);
      setStats(statsData);
    } catch (err) {
      console.error(err);
      setClients([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, searchApplied, regionFilter, managerFilter, followUpFilter, isAdmin]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleOpenCard = (id) => {
    setSelectedClientId(id);
    setShowCardModal(true);
  };

  const handleEdit = (client) => {
    setEditClient(client);
    setShowCardModal(false);
    setShowFormModal(true);
  };

  const handleAddNew = () => {
    setEditClient(null);
    setShowFormModal(true);
  };

  const openQuickAction = (e, client, type) => {
    e.stopPropagation();
    setQuickActionClient(client);
    setQuickActionType(type);
    setQuickNotes('');
    setQuickFollowUp('');
  };

  const openNewDeal = (e, client) => {
    e.stopPropagation();
    setSaleInitialClient(client);
    setShowSaleModal(true);
  };

  const submitQuickAction = async (e) => {
    e?.preventDefault();
    if (!quickActionClient?._id) return;
    setQuickSaving(true);
    try {
      await addClientInteraction(quickActionClient._id, {
        type: quickActionType,
        notes: quickNotes,
        nextFollowUpAt: quickFollowUp || undefined,
      });
      setQuickActionClient(null);
      loadClients();
    } catch (err) {
      alert(err.message || 'Помилка збереження');
    } finally {
      setQuickSaving(false);
    }
  };

  const showManagerColumn = user?.role !== 'manager';
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="manager-tab-content manager-crm-tab">
      <div className="clients-toolbar">
        <h2 className="clients-toolbar-title">Мої клієнти</h2>
        <input
          type="text"
          className="search-input clients-search"
          placeholder="Пошук: назва, ЄДРПОУ, телефон..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={followUpFilter}
          onChange={(e) => { setFollowUpFilter(e.target.value); setPage(1); }}
          title="Черга контакту"
        >
          {FOLLOW_UP_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
          ))}
        </select>
        {isAdmin && filterOptions.regions?.length > 0 && (
          <select
            className="filter-select"
            value={regionFilter}
            onChange={(e) => { setRegionFilter(e.target.value); setPage(1); }}
            title="Регіон"
          >
            <option value="">Усі регіони</option>
            {filterOptions.regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
        {isAdmin && filterOptions.managers?.length > 0 && (
          <select
            className="filter-select"
            value={managerFilter}
            onChange={(e) => { setManagerFilter(e.target.value); setPage(1); }}
            title="Менеджер"
          >
            <option value="">Усі менеджери</option>
            {filterOptions.managers.map((m) => (
              <option key={m.login} value={m.login}>{m.name}</option>
            ))}
          </select>
        )}
        <button type="button" className="btn-primary" onClick={handleAddNew}>+ Клієнт</button>
      </div>

      {stats && (
        <div className="clients-stats-strip">
          <button type="button" className={`clients-stat ${!followUpFilter ? 'active' : ''}`} onClick={() => { setFollowUpFilter(''); setPage(1); }}>
            <span className="clients-stat-value">{stats.total ?? 0}</span>
            <span className="clients-stat-label">Усього</span>
          </button>
          <button type="button" className={`clients-stat ${followUpFilter === 'overdue' ? 'active' : ''}`} onClick={() => { setFollowUpFilter('overdue'); setPage(1); }}>
            <span className="clients-stat-value">{stats.overdueFollowUp ?? 0}</span>
            <span className="clients-stat-label">Прострочено</span>
          </button>
          <button type="button" className={`clients-stat ${followUpFilter === 'today' ? 'active' : ''}`} onClick={() => { setFollowUpFilter('today'); setPage(1); }}>
            <span className="clients-stat-value">{stats.todayFollowUp ?? 0}</span>
            <span className="clients-stat-label">Сьогодні</span>
          </button>
          <button type="button" className={`clients-stat ${followUpFilter === 'stale' ? 'active' : ''}`} onClick={() => { setFollowUpFilter('stale'); setPage(1); }}>
            <span className="clients-stat-value">{stats.staleNoContact ?? 0}</span>
            <span className="clients-stat-label">Без контакту</span>
          </button>
          <div className="clients-stat clients-stat-static">
            <span className="clients-stat-value">{stats.openDealsClients ?? 0}</span>
            <span className="clients-stat-label">З угодами</span>
          </div>
          <div className="clients-stat clients-stat-static">
            <span className="clients-stat-value">{stats.newThisWeek ?? 0}</span>
            <span className="clients-stat-label">Нові / тиждень</span>
          </div>
        </div>
      )}

      <div className="crm-table-container clients-table-wrap">
        {loading ? (
          <div className="loading-indicator">Завантаження...</div>
        ) : clients.length === 0 ? (
          <div className="no-history">
            {searchApplied || regionFilter || managerFilter || followUpFilter
              ? 'Клієнтів за фільтрами не знайдено'
              : 'Ще немає клієнтів. Додайте першого.'}
          </div>
        ) : (
          <>
            <table className="history-table crm-table crm-table-dense">
              <thead>
                <tr>
                  <th>Назва</th>
                  <th>Регіон</th>
                  <th>Контакт</th>
                  <th>Останній контакт</th>
                  <th>Follow-up</th>
                  <th>Угоди</th>
                  {showManagerColumn && <th>Менеджер</th>}
                  <th className="clients-actions-col">Дії</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const fuTone = followUpTone(c.nextFollowUpAt);
                  return (
                    <tr key={c._id} onClick={() => handleOpenCard(c._id)} className="clickable-row">
                      <td className="clients-name-cell" title={c.name || ''}>
                        <span className="clients-name">{c.name || '—'}</span>
                        {c.edrpou ? <span className="clients-edrpou">{c.edrpou}</span> : null}
                      </td>
                      <td title={c.region || ''}>{c.region || '—'}</td>
                      <td title={[c.contactPerson, c.contactPhone].filter(Boolean).join(' · ')}>
                        <div className="clients-contact-stack">
                          <span>{c.contactPerson || '—'}</span>
                          <span className="clients-phone">{c.contactPhone || ''}</span>
                        </div>
                      </td>
                      <td>{formatShortDate(c.lastInteractionAt)}</td>
                      <td>
                        <span className={`clients-followup clients-followup--${fuTone || 'none'}`}>
                          {formatShortDate(c.nextFollowUpAt)}
                        </span>
                      </td>
                      <td>
                        {(c.openDealsCount || 0) > 0 ? (
                          <span className="clients-deals-badge">{c.openDealsCount}</span>
                        ) : '—'}
                      </td>
                      {showManagerColumn && (
                        <td>
                          {[c.assignedManagerName || c.assignedManagerLogin, c.assignedManagerName2 || c.assignedManagerLogin2]
                            .filter(Boolean)
                            .join(' / ') || '—'}
                        </td>
                      )}
                      <td className="clients-actions-col" onClick={(e) => e.stopPropagation()}>
                        <div className="clients-row-actions">
                          <button type="button" className="btn-tiny" title="Дзвінок" onClick={(e) => openQuickAction(e, c, 'call')}>Дзв</button>
                          <button type="button" className="btn-tiny" title="Примітка" onClick={(e) => openQuickAction(e, c, 'note')}>Нот</button>
                          <button type="button" className="btn-tiny" title="Нова угода" onClick={(e) => openNewDeal(e, c)}>Угода</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="pagination-controls">
                <span className="pagination-info">
                  Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} з {total}
                </span>
                <div className="pagination-buttons">
                  <button type="button" className="btn-small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    ← Попередня
                  </button>
                  <span className="page-num">Сторінка {page} з {totalPages}</span>
                  <button type="button" className="btn-small" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Наступна →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {quickActionClient && (
        <div className="modal-overlay" onClick={() => setQuickActionClient(null)}>
          <div className="modal-content clients-quick-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{quickActionType === 'call' ? 'Дзвінок' : 'Примітка'}: {quickActionClient.name}</h3>
              <button type="button" className="btn-close" onClick={() => setQuickActionClient(null)}>×</button>
            </div>
            <form className="modal-body" onSubmit={submitQuickAction}>
              <label>
                Нотатка
                <textarea
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                  rows={3}
                  placeholder="Коротко про результат контакту"
                  autoFocus
                />
              </label>
              <label>
                Наступний контакт
                <input
                  type="date"
                  value={quickFollowUp}
                  onChange={(e) => setQuickFollowUp(e.target.value)}
                />
              </label>
              <div className="clients-quick-actions">
                <button type="button" className="btn-secondary" onClick={() => setQuickActionClient(null)}>Скасувати</button>
                <button type="submit" className="btn-primary" disabled={quickSaving}>
                  {quickSaving ? 'Збереження...' : 'Зберегти'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ClientFormModal
        open={showFormModal}
        onClose={() => { setShowFormModal(false); setEditClient(null); }}
        onSuccess={loadClients}
        editClient={editClient}
        user={user}
      />

      <ClientCardModal
        open={showCardModal}
        onClose={() => { setShowCardModal(false); setSelectedClientId(null); loadClients(); }}
        clientId={selectedClientId}
        onEdit={handleEdit}
        user={user}
      />

      <SaleFormModal
        open={showSaleModal}
        onClose={() => { setShowSaleModal(false); setSaleInitialClient(null); }}
        onSuccess={() => { setShowSaleModal(false); setSaleInitialClient(null); loadClients(); }}
        initialClient={saleInitialClient}
        user={user}
      />
    </div>
  );
}

export default ClientsTab;
