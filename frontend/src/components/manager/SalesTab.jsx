import React, { useState, useEffect } from 'react';
import { getSales, cancelSale } from '../../utils/salesAPI';
import SaleFormModal from './SaleFormModal';
import './ManagerTabs.css';

function SalesTab({ user }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editSale, setEditSale] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const isAdmin = ['admin', 'administrator'].includes(user?.role);

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

  const handleCancelSale = async (sale) => {
    if (!window.confirm(`Скасувати продаж від ${sale.saleDate ? new Date(sale.saleDate).toLocaleDateString('uk-UA') : ''} для ${sale.clientId?.name || sale.clientName}? Обладнання повернеться на склад.`)) return;
    setCancellingId(sale._id);
    try {
      await cancelSale(sale._id);
      loadSales();
    } catch (err) {
      alert(err.message || 'Помилка скасування');
    } finally {
      setCancellingId(null);
    }
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
                {isAdmin && <th>Дія</th>}
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s._id} className={s.status === 'cancelled' ? 'sale-cancelled' : ''}>
                  <td>{s.saleDate ? new Date(s.saleDate).toLocaleDateString('uk-UA') : '—'}</td>
                  <td>{s.clientId?.name || s.clientName || '—'}</td>
                  <td>{s.mainProductName || '—'}</td>
                  <td>{s.mainProductSerial || '—'}</td>
                  <td>{formatCurrency(s.totalAmount || s.mainProductAmount)}</td>
                  <td>{s.warrantyUntil ? new Date(s.warrantyUntil).toLocaleDateString('uk-UA') : '—'}</td>
                  <td>
                    <span className={`sale-status-badge ${s.status || 'confirmed'}`}>
                      {s.status === 'draft' ? 'Чернетка' : s.status === 'cancelled' ? 'Скасовано' : 'Підтверджено'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      {s.status === 'confirmed' && (
                        <button
                          className="btn-small btn-cancel-sale"
                          onClick={() => handleCancelSale(s)}
                          disabled={cancellingId === s._id}
                        >
                          {cancellingId === s._id ? '...' : 'Скасувати'}
                        </button>
                      )}
                    </td>
                  )}
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
