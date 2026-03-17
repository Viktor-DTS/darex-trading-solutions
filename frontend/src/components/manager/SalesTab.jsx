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
  const isAdmin = ['admin', 'administrator', 'mgradm'].includes(user?.role);

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    setLoading(true);
    try {
      const data = await getSales();
      const list = Array.isArray(data) ? data : data.sales || [];
      const inProgress = list.filter(s => ['in_progress', 'draft', 'primary_contact', 'quote_sent', 'pnr'].includes(s.status));
      const success = list.filter(s => ['success', 'confirmed'].includes(s.status));
      const rest = list.filter(s => !['in_progress', 'draft', 'primary_contact', 'quote_sent', 'pnr', 'success', 'confirmed'].includes(s.status));
      setSales([...inProgress, ...success, ...rest]);
    } catch (err) {
      console.error(err);
      setSales([]);
    } finally {
      setLoading(false);
    }
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

  const handleEditSale = (sale) => {
    setEditSale(sale);
    setShowFormModal(true);
  };

  const exportReport = () => {
    const STATUS_LABELS = {
      draft: 'Чернетка', primary_contact: 'Первичний контакт', quote_sent: 'Відправив КП',
      in_progress: 'В процесі', pnr: 'ПНР', success: 'Успішно', confirmed: 'Підтверджено', cancelled: 'Скасовано'
    };
    const cols = [
      'Дата', 'Клієнт', 'ЄДРПОУ', 'Менеджер', 'Менеджер 2', 'Тендер', 'Продукт', 'Серійний №',
      'Сума', 'Гарантія до', 'Статус', 'Платежі', 'Примітки'
    ];
    const rows = sales.map(s => [
      s.saleDate ? new Date(s.saleDate).toLocaleDateString('uk-UA') : '',
      s.clientId?.name || s.clientName || '',
      s.edrpou || s.clientId?.edrpou || '',
      s.managerName || s.managerLogin || '',
      s.managerName2 || s.managerLogin2 || '',
      s.tenderEmployeeName || s.tenderEmployeeLogin || '',
      s.mainProductName || '',
      s.mainProductSerial || '',
      (s.totalAmount || s.mainProductAmount || 0).toString(),
      s.warrantyUntil ? new Date(s.warrantyUntil).toLocaleDateString('uk-UA') : '',
      STATUS_LABELS[s.status] || s.status || '',
      (s.payments || []).map(p => {
        const d = p.date ? new Date(p.date).toLocaleDateString('uk-UA') : '';
        return d ? `${d}: ${p.amount || 0} ${p.currency || 'UAH'}` : `${p.amount || 0} ${p.currency || 'UAH'}`;
      }).join('; ') || '',
      (s.notes || '').replace(/"/g, '""')
    ]);
    const csv = [cols.map(c => `"${c}"`).join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zvit-ugod-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="manager-tab-content manager-crm-tab">
      <div className="manager-header" style={{ flexShrink: 0 }}>
        <h2>💰 Продажі</h2>
        <div className="header-actions">
          <button className="btn-secondary" onClick={exportReport} disabled={loading || sales.length === 0}>📊 Експорт звіту</button>
        </div>
      </div>

      <div className="crm-table-container">
        {loading ? (
          <div className="loading-indicator">Завантаження...</div>
        ) : sales.length === 0 ? (
          <div className="no-history">
            Ще немає продажів. Відкрийте картку клієнта та натисніть «+ Новий продаж».
          </div>
        ) : (
          <table className="history-table crm-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Клієнт</th>
                {isAdmin && <th>Менеджер</th>}
                {isAdmin && <th>Тендер</th>}
                <th>Продукт</th>
                <th>Серійний №</th>
                <th>Сума</th>
                <th>Гарантія до</th>
                <th>Статус</th>
                {isAdmin && <th>Дія</th>}
              </tr>
            </thead>
            <tbody>
              {sales.map(s => {
                const isInProgress = ['in_progress', 'draft', 'primary_contact', 'quote_sent', 'pnr'].includes(s.status);
                const isSuccess = ['success', 'confirmed'].includes(s.status);
                const rowClass = s.status === 'cancelled' ? 'sale-cancelled' : isInProgress ? 'sale-row-in-progress' : isSuccess ? 'sale-row-success' : '';
                return (
                <tr key={s._id} className={rowClass} onClick={() => handleEditSale(s)} style={{ cursor: 'pointer' }}>
                  <td>{s.saleDate ? new Date(s.saleDate).toLocaleDateString('uk-UA') : '—'}</td>
                  <td>{s.clientId?.name || s.clientName || '—'}</td>
                  {isAdmin && (
                    <td>
                      {[s.managerName || s.managerLogin, s.managerName2 || s.managerLogin2]
                        .filter(Boolean)
                        .join(' / ') || '—'}
                    </td>
                  )}
                  {isAdmin && (
                    <td>{s.tenderEmployeeName || s.tenderEmployeeLogin || '—'}</td>
                  )}
                  <td>{s.mainProductName || '—'}</td>
                  <td>{s.mainProductSerial || '—'}</td>
                  <td>{formatCurrency(s.totalAmount || s.mainProductAmount)}</td>
                  <td>{s.warrantyUntil ? new Date(s.warrantyUntil).toLocaleDateString('uk-UA') : '—'}</td>
                  <td>
                    <span className={`sale-status-badge ${s.status || 'in_progress'}`}>
                      {['in_progress', 'draft', 'primary_contact', 'quote_sent', 'pnr'].includes(s.status) ? 'В процесі реалізації' :
                        ['success', 'confirmed'].includes(s.status) ? 'Успішно реалізовано' :
                        s.status === 'cancelled' ? 'Скасовано' : s.status || '—'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      {['confirmed', 'success'].includes(s.status) && (
                        <button
                          className="btn-small btn-cancel-sale"
                          onClick={(e) => { e.stopPropagation(); handleCancelSale(s); }}
                          disabled={cancellingId === s._id}
                        >
                          {cancellingId === s._id ? '...' : 'Скасувати'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
              })}
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
