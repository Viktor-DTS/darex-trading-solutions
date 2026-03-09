import React, { useState, useEffect } from 'react';
import { getClient } from '../../utils/clientsAPI';
import { getSales } from '../../utils/salesAPI';
import './ClientCardModal.css';

function ClientCardModal({ open, onClose, clientId, onEdit }) {
  const [client, setClient] = useState(null);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && clientId) {
      loadData();
    }
  }, [open, clientId]);

  const loadData = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [clientData, salesData] = await Promise.all([
        getClient(clientId),
        getSales({ clientId })
      ]);
      setClient(clientData);
      setSales(Array.isArray(salesData) ? salesData : salesData.sales || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const formatCurrency = (v) => new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(v || 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content client-card-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>👤 Картка клієнта</h3>
          <div className="modal-header-actions">
            {onEdit && client && !client.limited && (
              <button className="btn-edit" onClick={() => onEdit(client)}>Редагувати</button>
            )}
            <button className="btn-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : client ? (
            <>
              {client.limited && (
                <div className="limited-notice">
                  ⚠️ Клієнт закріплений за іншим менеджером. Показано обмежену інформацію.
                  {client.assignedManagerLogin && (
                    <div className="limited-manager">Менеджер: <strong>{client.assignedManagerLogin}</strong></div>
                  )}
                </div>
              )}
              <div className="client-info-block">
                <h4>{client.name}</h4>
                {!client.limited && client.edrpou && <div><strong>ЄДРПОУ:</strong> {client.edrpou}</div>}
                {!client.limited && client.address && <div><strong>Адреса:</strong> {client.address}</div>}
                {!client.limited && client.contactPerson && <div><strong>Контакт:</strong> {client.contactPerson}</div>}
                {!client.limited && client.contactPhone && <div><strong>Телефон:</strong> {client.contactPhone}</div>}
                {!client.limited && client.email && <div><strong>Email:</strong> {client.email}</div>}
                {!client.limited && client.region && <div><strong>Регіон:</strong> {client.region}</div>}
                {!client.limited && client.notes && <div><strong>Примітки:</strong> {client.notes}</div>}
              </div>

              {!client.limited && (
                <div className="client-sales-block">
                  <h4>Продажі ({sales.length})</h4>
                  {sales.length === 0 ? (
                    <p className="no-data">Немає продажів</p>
                  ) : (
                    <table className="mini-sales-table">
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Продукт</th>
                          <th>Сума</th>
                          <th>Гарантія до</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.slice(0, 10).map(s => (
                          <tr key={s._id}>
                            <td>{s.saleDate ? new Date(s.saleDate).toLocaleDateString('uk-UA') : '—'}</td>
                            <td>{s.mainProductName || '—'}</td>
                            <td>{formatCurrency(s.totalAmount || s.mainProductAmount)}</td>
                            <td>{s.warrantyUntil ? new Date(s.warrantyUntil).toLocaleDateString('uk-UA') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="loading-indicator">Клієнта не знайдено</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClientCardModal;
