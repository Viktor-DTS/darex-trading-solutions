import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './Documents.css';

function ReceiptDocuments({ warehouses }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    warehouse: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const [showModal, setShowModal] = useState(false);
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

      const response = await fetch(`${API_BASE_URL}/documents/receipt?${params}`, {
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

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: { text: 'Чернетка', class: 'status-draft' },
      completed: { text: 'Завершено', class: 'status-completed' },
      cancelled: { text: 'Скасовано', class: 'status-cancelled' }
    };
    const badge = badges[status] || badges.draft;
    return <span className={`status-badge ${badge.class}`}>{badge.text}</span>;
  };

  return (
    <div className="documents-container">
      <div className="documents-header">
        <h2>Документи надходження</h2>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          ➕ Створити документ
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
          <option value="completed">Завершено</option>
          <option value="cancelled">Скасовано</option>
        </select>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
          placeholder="Дата від"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => handleFilterChange('dateTo', e.target.value)}
          placeholder="Дата до"
        />
      </div>

      {loading ? (
        <div className="loading">Завантаження...</div>
      ) : documents.length === 0 ? (
        <div className="empty-state">
          <p>Документів не знайдено</p>
        </div>
      ) : (
        <div className="documents-table">
          <table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Постачальник</th>
                <th>Склад</th>
                <th>Кількість позицій</th>
                <th>Сума</th>
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
                  <td>{doc.supplier || '—'}</td>
                  <td>{doc.warehouseName || '—'}</td>
                  <td>{doc.items?.length || 0}</td>
                  <td>{doc.totalAmount ? `${doc.totalAmount} ${doc.currency || 'грн.'}` : '—'}</td>
                  <td>{getStatusBadge(doc.status)}</td>
                  <td>{doc.createdByName || '—'}</td>
                  <td>
                    <button
                      className="btn-action"
                      onClick={() => {
                        setSelectedDocument(doc);
                        setShowModal(true);
                      }}
                    >
                      Переглянути
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ReceiptDocuments;

