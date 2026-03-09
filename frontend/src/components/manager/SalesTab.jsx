import React, { useState, useEffect } from 'react';
import { getSales } from '../../utils/salesAPI';
import SaleFormModal from './SaleFormModal';
import './ManagerTabs.css';

function SalesTab({ user }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editSale, setEditSale] = useState(null);

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    setLoading(true);
    try {
      const data = await getSales();
      setSales(Array.isArray(data) ? data : data.sales || []);
    } catch (err) {
      console.error(err);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditSale(null);
    setShowFormModal(true);
  };

  const formatCurrency = (v) => new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(v || 0);

  return (
    <div className="manager-tab-content manager-crm-tab">
      <div className="manager-header" style={{ flexShrink: 0 }}>
        <h2>💰 Продажі</h2>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleAddNew}>+ Новий продаж</button>
        </div>
      </div>

      <div className="crm-table-container">
        {loading ? (
          <div className="loading-indicator">Завантаження...</div>
        ) : sales.length === 0 ? (
          <div className="no-history">
            Ще немає продажів. Створіть перший.
          </div>
        ) : (
          <table className="history-table crm-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Клієнт</th>
                <th>Продукт</th>
                <th>Серійний №</th>
                <th>Сума</th>
                <th>Гарантія до</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s._id}>
                  <td>{s.saleDate ? new Date(s.saleDate).toLocaleDateString('uk-UA') : '—'}</td>
                  <td>{s.clientId?.name || s.clientName || '—'}</td>
                  <td>{s.mainProductName || '—'}</td>
                  <td>{s.mainProductSerial || '—'}</td>
                  <td>{formatCurrency(s.totalAmount || s.mainProductAmount)}</td>
                  <td>{s.warrantyUntil ? new Date(s.warrantyUntil).toLocaleDateString('uk-UA') : '—'}</td>
                  <td>
                    <span className={`sale-status-badge ${s.status || 'confirmed'}`}>
                      {s.status === 'draft' ? 'Чернетка' : 'Підтверджено'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SaleFormModal
        open={showFormModal}
        onClose={() => { setShowFormModal(false); setEditSale(null); }}
        onSuccess={loadSales}
        editSale={editSale}
        user={user}
      />
    </div>
  );
}

export default SalesTab;
