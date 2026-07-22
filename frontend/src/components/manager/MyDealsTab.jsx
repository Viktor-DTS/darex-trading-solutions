import React, { useState, useEffect, useCallback } from 'react';
import { getSales } from '../../utils/salesAPI';
import {
  isClosedSale,
  saleStatusLabel,
  saleBelongsToUser,
  userSeesAllDeals
} from '../../utils/saleStatusUtils';
import SaleFormModal from './SaleFormModal';
import './ManagerTabs.css';

const formatCurrency = (v) =>
  new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(v || 0);

function MyDealsTab({ user }) {
  const seesAllDeals = userSeesAllDeals(user);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editSale, setEditSale] = useState(null);
  const [viewOnly, setViewOnly] = useState(false);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSales();
      let list = Array.isArray(data) ? data : data.sales || [];

      if (!seesAllDeals) {
        list = list.filter((s) => saleBelongsToUser(s, user?.login));
      }

      if (!showAllDeals) {
        list = list.filter((s) => !isClosedSale(s));
      }

      const inNegotiation = list.filter((s) =>
        ['in_negotiation', 'in_progress', 'draft', 'primary_contact', 'quote_sent', 'pnr'].includes(s.status)
      );
      const inRealization = list.filter((s) => s.status === 'in_realization');
      const closed = list.filter((s) => isClosedSale(s));
      const rest = list.filter(
        (s) =>
          !['in_negotiation', 'in_progress', 'in_realization', 'draft', 'primary_contact', 'quote_sent', 'pnr', 'success', 'confirmed', 'cancelled'].includes(
            s.status
          )
      );
      setSales([...inNegotiation, ...inRealization, ...closed, ...rest]);
    } catch (err) {
      console.error(err);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [seesAllDeals, showAllDeals, user?.login]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const handleOpenSale = (sale) => {
    const closed = isClosedSale(sale);
    setEditSale(sale);
    setViewOnly(closed);
    setShowFormModal(true);
  };

  const activeCount = sales.filter((s) => !isClosedSale(s)).length;
  const closedCount = sales.filter((s) => isClosedSale(s)).length;

  return (
    <div className="manager-tab-content manager-crm-tab my-deals-tab">
      <div className="manager-header" style={{ flexShrink: 0 }}>
        <h2>📋 Мої угоди</h2>
        <p className="tab-description">
          {seesAllDeals
            ? 'Регіон «Україна»: відображаються усі угоди. За замовчуванням — лише активні.'
            : 'Відображаються ваші угоди (менеджер 1 або 2). За замовчуванням — лише активні.'}
        </p>
      </div>

      <div className="report-filters my-deals-filters">
        <div className="report-filter-row">
          <label className="my-deals-checkbox-filter">
            <input
              type="checkbox"
              checked={showAllDeals}
              onChange={(e) => setShowAllDeals(e.target.checked)}
            />
            <span>Показати всі угоди (включно з закритими)</span>
          </label>
          <button type="button" className="btn-primary" onClick={loadSales} disabled={loading}>
            {loading ? 'Завантаження...' : '🔄 Оновити'}
          </button>
        </div>
      </div>

      <div className="report-summary">
        Знайдено угод: <strong>{sales.length}</strong>
        {!showAllDeals ? (
          <span className="my-deals-summary-hint"> (лише активні)</span>
        ) : (
          <span className="my-deals-summary-hint">
            {' '}
            — активних: {activeCount}, закритих: {closedCount}
          </span>
        )}
      </div>

      <div className="crm-table-container">
        {loading ? (
          <div className="loading-indicator">Завантаження...</div>
        ) : sales.length === 0 ? (
          <div className="no-history">
            {showAllDeals
              ? 'Немає угод за обраними умовами.'
              : 'Немає активних угод. Увімкніть «Показати всі угоди», щоб переглянути закриті.'}
          </div>
        ) : (
          <table className="history-table crm-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Клієнт</th>
                {seesAllDeals && <th>Менеджер</th>}
                <th>Обладнання</th>
                <th>Серійний №</th>
                <th>Сума</th>
                <th>Статус</th>
                <th>Дія</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const closed = isClosedSale(s);
                const isInNegotiation = ['in_negotiation', 'in_progress', 'draft', 'primary_contact', 'quote_sent', 'pnr'].includes(
                  s.status
                );
                const isInRealization = s.status === 'in_realization';
                const rowClass = closed
                  ? 'sale-row-success sale-row-closed'
                  : isInNegotiation
                    ? 'sale-row-in-progress'
                    : isInRealization
                      ? 'sale-row-in-realization'
                      : '';
                return (
                  <tr
                    key={s._id}
                    className={rowClass}
                    onClick={() => handleOpenSale(s)}
                    style={{ cursor: 'pointer' }}
                    title={closed ? 'Закрита угода — лише перегляд' : 'Відкрити для редагування'}
                  >
                    <td>{s.saleDate ? new Date(s.saleDate).toLocaleDateString('uk-UA') : '—'}</td>
                    <td>{s.clientId?.name || s.clientName || '—'}</td>
                    {seesAllDeals && (
                      <td>
                        {[s.managerName || s.managerLogin, s.managerName2 || s.managerLogin2]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </td>
                    )}
                    <td>{s.mainProductName || '—'}</td>
                    <td>{s.mainProductSerial || '—'}</td>
                    <td>{formatCurrency(s.totalAmount || s.mainProductAmount)}</td>
                    <td>
                      <span className={`sale-status-badge ${s.status || 'in_negotiation'}`}>
                        {saleStatusLabel(s.status)}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-small btn-secondary"
                        onClick={() => handleOpenSale(s)}
                      >
                        {closed ? '👁️ Перегляд' : '✏️ Редагувати'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <SaleFormModal
        open={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditSale(null);
          setViewOnly(false);
        }}
        onSuccess={loadSales}
        onRefreshSale={(s) => setEditSale(s)}
        editSale={editSale}
        user={user}
        viewOnly={viewOnly}
      />
    </div>
  );
}

export default MyDealsTab;
