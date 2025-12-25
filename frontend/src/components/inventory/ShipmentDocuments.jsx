import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import ShipmentDocumentModal from './ShipmentDocumentModal';
import './Documents.css';

function ShipmentDocuments({ warehouses }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    warehouse: '',
    status: '',
    client: '',
    dateFrom: '',
    dateTo: ''
  });
  const [showModal, setShowModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [equipment, setEquipment] = useState([]);

  useEffect(() => {
    loadDocuments();
    loadEquipment();
  }, [filters]);

  const loadEquipment = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEquipment(data);
      }
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.warehouse) params.append('warehouse', filters.warehouse);
      if (filters.status) params.append('status', filters.status);
      if (filters.client) params.append('client', filters.client);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);

      const response = await fetch(`${API_BASE_URL}/documents/shipment?${params}`, {
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
      shipped: { text: 'Відвантажено', class: 'status-shipped' },
      delivered: { text: 'Доставлено', class: 'status-delivered' },
      cancelled: { text: 'Скасовано', class: 'status-cancelled' }
    };
    const badge = badges[status] || badges.draft;
    return <span className={`status-badge ${badge.class}`}>{badge.text}</span>;
  };

  return (
    <div className="documents-container">
      <div className="documents-header">
        <h2>Документи відвантаження</h2>
        <button className="btn-primary" onClick={() => {
          setSelectedDocument(null);
          setShowModal(true);
        }}>
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
          <option value="shipped">Відвантажено</option>
          <option value="delivered">Доставлено</option>
          <option value="cancelled">Скасовано</option>
        </select>
        <input
          type="text"
          value={filters.client}
          onChange={(e) => handleFilterChange('client', e.target.value)}
          placeholder="Пошук по клієнту"
        />
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
          <p>Документів не знайдено</p>
        </div>
      ) : (
        <div className="documents-table">
          <table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Клієнт</th>
                <th>Склад</th>
                <th>Номер замовлення</th>
                <th>Номер рахунку</th>
                <th>Сума</th>
                <th>Статус</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc._id}>
                  <td>{doc.documentNumber}</td>
                  <td>{new Date(doc.documentDate).toLocaleDateString('uk-UA')}</td>
                  <td>{doc.shippedTo || '—'}</td>
                  <td>{doc.warehouseName || '—'}</td>
                  <td>{doc.orderNumber || '—'}</td>
                  <td>{doc.invoiceNumber || '—'}</td>
                  <td>{doc.totalAmount ? `${doc.totalAmount} ${doc.currency || 'грн.'}` : '—'}</td>
                  <td>{getStatusBadge(doc.status)}</td>
                  <td>
                    <button
                      className="btn-action"
                      onClick={() => {
                        setSelectedDocument(doc);
                        setShowModal(true);
                      }}
                    >
                      {doc.status === 'draft' ? 'Редагувати' : 'Переглянути'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ShipmentDocumentModal
          document={selectedDocument}
          warehouses={warehouses}
          user={null}
          onClose={() => {
            setShowModal(false);
            setSelectedDocument(null);
          }}
          onSuccess={() => {
            loadDocuments();
            setShowModal(false);
            setSelectedDocument(null);
          }}
        />
      )}
    </div>
  );
}

export default ShipmentDocuments;

