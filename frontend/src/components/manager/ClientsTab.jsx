import React, { useState, useEffect } from 'react';
import { getClients } from '../../utils/clientsAPI';
import ClientFormModal from './ClientFormModal';
import ClientCardModal from './ClientCardModal';
import './ManagerTabs.css';

function ClientsTab({ user }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await getClients();
      setClients(Array.isArray(data) ? data : data.clients || []);
    } catch (err) {
      console.error(err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.edrpou || '').includes(search) ||
    (c.contactPhone || '').includes(search)
  );

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
          />
          <button className="btn-primary" onClick={handleAddNew}>+ Додати клієнта</button>
        </div>
      </div>

      <div className="crm-table-container">
        {loading ? (
          <div className="loading-indicator">Завантаження...</div>
        ) : filteredClients.length === 0 ? (
          <div className="no-history">
            {search ? 'Клієнтів за пошуком не знайдено' : 'Ще немає клієнтів. Додайте першого.'}
          </div>
        ) : (
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
              {filteredClients.map(c => (
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
