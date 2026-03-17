import React, { useState, useEffect, useCallback } from 'react';
import { getClients, getClientsFilters } from '../../utils/clientsAPI';
import ClientFormModal from './ClientFormModal';
import ClientCardModal from './ClientCardModal';
import './ManagerTabs.css';

const PAGE_SIZE = 30;

function ClientsTab({ user }) {
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [filterOptions, setFilterOptions] = useState({ regions: [], managers: [] });
  const [showFormModal, setShowFormModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);

  const loadFilters = useCallback(async () => {
    const opts = await getClientsFilters();
    setFilterOptions(opts);
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        q: searchApplied || undefined,
        region: regionFilter || undefined,
        manager: (user?.role && ['admin', 'administrator', 'mgradm'].includes(user.role)) ? (managerFilter || undefined) : undefined
      };
      const data = await getClients(params);
      const list = Array.isArray(data) ? data : (data.clients || []);
      setClients(list);
      setTotal(data.total ?? list.length);
    } catch (err) {
      console.error(err);
      setClients([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, searchApplied, regionFilter, managerFilter, user?.role]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleSearchApply = () => {
    setSearchApplied(search);
    setPage(1);
  };

  const handleRegionChange = (e) => {
    setRegionFilter(e.target.value);
    setPage(1);
  };

  const handleManagerChange = (e) => {
    setManagerFilter(e.target.value);
    setPage(1);
  };

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

  const formatCurrency = (v) => new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(v || 0);
  const showManagerColumn = user?.role !== 'manager';
  const showManagerFilter = user?.role && ['admin', 'administrator', 'mgradm'].includes(user.role);
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="manager-tab-content manager-crm-tab">
      <div className="manager-header" style={{ flexShrink: 0 }}>
        <h2>👥 Мої клієнти</h2>
        <div className="header-actions">
          <input
            type="text"
            className="search-input"
            placeholder="Пошук за назвою, ЄДРПОУ, телефону..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearchApply()}
          />
          <button type="button" className="btn-secondary" onClick={handleSearchApply}>Шукати</button>
          {filterOptions.regions?.length > 0 && (
            <select
              className="filter-select"
              value={regionFilter}
              onChange={handleRegionChange}
              title="Регіон"
            >
              <option value="">Усі регіони</option>
              {filterOptions.regions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}
          {showManagerFilter && filterOptions.managers?.length > 0 && (
            <select
              className="filter-select"
              value={managerFilter}
              onChange={handleManagerChange}
              title="Менеджер"
            >
              <option value="">Усі менеджери</option>
              {filterOptions.managers.map(m => (
                <option key={m.login} value={m.login}>{m.name}</option>
              ))}
            </select>
          )}
          <button className="btn-primary" onClick={handleAddNew}>+ Додати клієнта</button>
        </div>
      </div>

      <div className="crm-table-container">
        {loading ? (
          <div className="loading-indicator">Завантаження...</div>
        ) : clients.length === 0 ? (
          <div className="no-history">
            {searchApplied || regionFilter || managerFilter ? 'Клієнтів за фільтрами не знайдено' : 'Ще немає клієнтів. Додайте першого.'}
          </div>
        ) : (
          <>
          <table className="history-table crm-table">
            <thead>
              <tr>
                <th>Назва</th>
                <th>ЄДРПОУ</th>
                <th>Контакт</th>
                <th>Телефон</th>
                {showManagerColumn && <th>Менеджер</th>}
                <th>Дія</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c._id} onClick={() => handleOpenCard(c._id)} className="clickable-row">
                  <td>{c.name || '—'}</td>
                  <td>{c.edrpou || '—'}</td>
                  <td>{c.contactPerson || '—'}</td>
                  <td>{c.contactPhone || '—'}</td>
                  {showManagerColumn && (
                <td>
                  {[c.assignedManagerName || c.assignedManagerLogin, c.assignedManagerName2 || c.assignedManagerLogin2]
                    .filter(Boolean)
                    .join(' / ') || '—'}
                </td>
              )}
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn-small" onClick={() => handleOpenCard(c._id)}>Переглянути</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="pagination-controls">
              <span className="pagination-info">
                Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} з {total}
              </span>
              <div className="pagination-buttons">
                <button
                  type="button"
                  className="btn-small"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ← Попередня
                </button>
                <span className="page-num">Сторінка {page} з {totalPages}</span>
                <button
                  type="button"
                  className="btn-small"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Наступна →
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      <ClientFormModal
        open={showFormModal}
        onClose={() => { setShowFormModal(false); setEditClient(null); }}
        onSuccess={loadClients}
        editClient={editClient}
        user={user}
      />

      <ClientCardModal
        open={showCardModal}
        onClose={() => { setShowCardModal(false); setSelectedClientId(null); }}
        clientId={selectedClientId}
        onEdit={handleEdit}
      />
    </div>
  );
}

export default ClientsTab;
