import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import InventoryDocumentModal from './InventoryDocumentModal';
import './Documents.css';

function InventoryDocuments({ warehouses }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    warehouse: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

  useEffect(() => {
    loadDocuments();
  }, [filters]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.warehouse) params.append('warehouse', filters.warehouse);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);

      const response = await fetch(`${API_BASE_URL}/documents/inventory?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Помилка завантаження документів:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (docId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/documents/inventory/${docId}/complete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        loadDocuments();
      }
    } catch (error) {
      console.error('Помилка завершення інвентаризації:', error);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: { text: 'Чернетка', class: 'status-draft' },
      in_progress: { text: 'В процесі', class: 'status-transit' },
      completed: { text: 'Завершено', class: 'status-completed' },
      cancelled: { text: 'Скасовано', class: 'status-cancelled' }
    };
    const badge = badges[status] || badges.draft;
    return <span className={`status-badge ${badge.class}`}>{badge.text}</span>;
  };

  return (
    <div className="documents-container">
      <div className="documents-header">
        <h2>Документи інвентаризації</h2>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          ➕ Створити інвентаризацію
        </button>
      </div>

      <div className="documents-filters">
        <select
          value={filters.warehouse}
          onChange={(e) => handleFilterChange('warehouse', e.target.value)}
        >
          <option value="">Всі склади</option>
          {warehouses.map(w => (
            <option key={w._id} value={w._id}>{w.name}</option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
        >
          <option value="">Всі статуси</option>
          <option value="draft">Чернетка</option>
          <option value="in_progress">В процесі</option>
          <option value="completed">Завершено</option>
          <option value="cancelled">Скасовано</option>
        </select>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => handleFilterChange('dateTo', e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Завантаження...</div>
      ) : documents.length === 0 ? (
        <div className="empty-state">
          <p>Документів інвентаризації не знайдено</p>
        </div>
      ) : (
        <div className="documents-table">
          <table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Склад</th>
                <th>Дата інвентаризації</th>
                <th>Кількість позицій</th>
                <th>Різниці</th>
                <th>Статус</th>
                <th>Створено</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc._id}>
                  <td>{doc.documentNumber}</td>
                  <td>{new Date(doc.documentDate).toLocaleDateString('uk-UA')}</td>
                  <td>{doc.warehouseName || '—'}</td>
                  <td>{doc.inventoryDate ? new Date(doc.inventoryDate).toLocaleDateString('uk-UA') : '—'}</td>
                  <td>{doc.items?.length || 0}</td>
                  <td>
                    {doc.items?.filter(item => item.difference !== 0).length || 0} з {doc.items?.length || 0}
                  </td>
                  <td>{getStatusBadge(doc.status)}</td>
                  <td>{doc.createdByName || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        className="btn-action"
                        onClick={() => {
                          setSelectedDocument(doc);
                          setShowCreateModal(true);
                        }}
                      >
                        {doc.status === 'draft' || doc.status === 'in_progress' ? 'Редагувати' : 'Переглянути'}
                      </button>
                      {doc.status === 'in_progress' && (
                        <button
                          className="btn-action"
                          onClick={() => handleComplete(doc._id)}
                          style={{ background: '#28a745' }}
                        >
                          Завершити
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <InventoryDocumentModal
          document={selectedDocument}
          warehouses={warehouses}
          user={null}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedDocument(null);
          }}
          onSuccess={() => {
            loadDocuments();
            setShowCreateModal(false);
            setSelectedDocument(null);
          }}
        />
      )}
    </div>
  );
}

export default InventoryDocuments;

