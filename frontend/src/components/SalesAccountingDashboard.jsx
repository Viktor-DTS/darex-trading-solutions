import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API_BASE_URL from '../config';
import { getSalesPremiumQueue, approveSalePremium } from '../utils/salesAPI';
import './manager/ManagerTabs.css';
import './Dashboard.css';

const SALES_BONUS_PCT_ID = 'sales_bonus';

function roundMoney(n) {
  const x = typeof n === 'number' ? n : parseFloat(String(n).replace(',', '.'));
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function suggestedPremiumForSale(sale, bonusPct) {
  const pct = typeof bonusPct === 'number' && !Number.isNaN(bonusPct) ? bonusPct : 0;
  let mainAmount = parseFloat(sale.mainProductAmount) || 0;
  if (sale.equipmentItems && sale.equipmentItems.length > 0) {
    mainAmount = sale.equipmentItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  }
  const addSum = (sale.additionalCosts || []).reduce(
    (s, c) => s + (parseFloat(c.amount) || 0) * (parseInt(c.quantity, 10) || 1),
    0
  );
  const transport = parseFloat(sale.transportCosts) || 0;
  const pnr = parseFloat(sale.pnrCosts) || 0;
  const representative = parseFloat(sale.representativeCosts) || 0;
  const totalWithAllExpenses = mainAmount - transport - pnr - representative - addSum;
  return roundMoney((pct / 100) * totalWithAllExpenses);
}

/**
 * Панель «Відділ продаж — бухгалтерія»: угоди зі статусом «Успішно реалізовано»
 * до затвердження премії; після затвердження — перехід у «Підтверджено» та фіксація суми премії.
 */
function SalesAccountingDashboard() {
  const [tab, setTab] = useState('pending');
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bonusPct, setBonusPct] = useState(0);
  const [approveModal, setApproveModal] = useState({ open: false, sale: null });
  const [approveAmount, setApproveAmount] = useState('');
  const [approvePeriod, setApprovePeriod] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadBonusPercent = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/global-calculation-coefficients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const salesRows = data.sales?.rows || [];
      const row = salesRows.find((r) => r.id === SALES_BONUS_PCT_ID);
      if (row != null && typeof row.value === 'number' && !Number.isNaN(row.value)) {
        setBonusPct(roundMoney(row.value));
      } else {
        setBonusPct(0);
      }
    } catch {
      setBonusPct(0);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const q = tab === 'pending' ? 'pending' : 'archived';
      const data = await getSalesPremiumQueue(q);
      const list = Array.isArray(data) ? data : data.sales || [];
      setSales(list);
    } catch {
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    loadBonusPercent();
  }, [loadBonusPercent]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const formatCurrency = (v) =>
    new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(v || 0);

  const openApprove = (sale) => {
    const suggested = suggestedPremiumForSale(sale, bonusPct);
    const existing = parseFloat(sale.managerPremium) || 0;
    const defaultAmt = suggested > 0 ? suggested : existing;
    const d = new Date();
    const period = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    setApproveAmount(String(roundMoney(defaultAmt)));
    setApprovePeriod(period);
    setApproveModal({ open: true, sale });
  };

  const closeApprove = () => {
    setApproveModal({ open: false, sale: null });
    setApproveAmount('');
    setApprovePeriod('');
  };

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    const sale = approveModal.sale;
    if (!sale?._id) return;
    const amt = roundMoney(parseFloat(String(approveAmount).replace(',', '.')));
    if (Number.isNaN(amt) || amt < 0) {
      alert('Вкажіть коректну суму премії');
      return;
    }
    let period = (approvePeriod || '').trim();
    if (!/^\d{2}-\d{4}$/.test(period)) {
      alert('Період начислення: формат ММ-РРРР (наприклад 04-2026)');
      return;
    }
    setSubmitting(true);
    try {
      await approveSalePremium(sale._id, { managerPremium: amt, premiumAccrualPeriod: period });
      closeApprove();
      await loadList();
    } catch (err) {
      alert(err.message || 'Помилка затвердження');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingHint = useMemo(
    () =>
      `Коефіцієнт «Премія від продажів»: ${bonusPct}%. Розрахунок: (сума відвантаження − витрати) × коефіцієнт — як у картці угоди менеджера.`,
    [bonusPct]
  );

  return (
    <div className="dashboard manager-dashboard">
      <div className="manager-tab-content manager-crm-tab" style={{ maxWidth: '100%' }}>
        <div className="manager-header" style={{ flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2>📒 Відділ продаж — бухгалтерія</h2>
            <p className="dashboard-subtitle" style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
              Успішно реалізовані угоди очікують затвердження премії менеджерам. Після затвердження угода отримує статус «Підтверджено».
            </p>
          </div>
        </div>

        <div className="sales-accounting-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={tab === 'pending' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTab('pending')}
          >
            На затвердженні
          </button>
          <button
            type="button"
            className={tab === 'archived' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTab('archived')}
          >
            Затверджені премії
          </button>
        </div>

        {tab === 'pending' && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{pendingHint}</p>
        )}

        <div className="crm-table-container">
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : sales.length === 0 ? (
            <div className="no-history">
              {tab === 'pending'
                ? 'Немає угод у статусі «Успішно реалізовано» без затвердженої премії.'
                : 'Ще немає затверджених премій у цьому списку.'}
            </div>
          ) : (
            <table className="history-table crm-table">
              <thead>
                <tr>
                  <th>Дата угоди</th>
                  <th>Клієнт</th>
                  <th>Менеджер(и)</th>
                  <th>Сума</th>
                  {tab === 'pending' && <th>Рекоменд. премія</th>}
                  <th>Премія, ₴</th>
                  {tab === 'archived' && <th>Період</th>}
                  {tab === 'archived' && <th>Затверджено</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const suggested = suggestedPremiumForSale(s, bonusPct);
                  const managers = [s.managerName || s.managerLogin, s.managerName2 || s.managerLogin2]
                    .filter(Boolean)
                    .join(' / ');
                  return (
                    <tr key={s._id} className="sale-row-success">
                      <td>{s.saleDate ? new Date(s.saleDate).toLocaleDateString('uk-UA') : '—'}</td>
                      <td>{s.clientId?.name || s.clientName || '—'}</td>
                      <td>{managers || '—'}</td>
                      <td>{formatCurrency(s.totalAmount || s.mainProductAmount)}</td>
                      {tab === 'pending' && <td>{formatCurrency(suggested)}</td>}
                      <td>{formatCurrency(s.managerPremium)}</td>
                      {tab === 'archived' && <td>{s.premiumAccrualPeriod || '—'}</td>}
                      {tab === 'archived' && (
                        <td>
                          {s.premiumAccruedAt
                            ? new Date(s.premiumAccruedAt).toLocaleString('uk-UA')
                            : '—'}
                          {s.premiumAccruedByLogin ? (
                            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>
                              {s.premiumAccruedByLogin}
                            </span>
                          ) : null}
                        </td>
                      )}
                      <td>
                        {tab === 'pending' ? (
                          <button type="button" className="btn-primary btn-small" onClick={() => openApprove(s)}>
                            Затвердити премію
                          </button>
                        ) : (
                          <span className="sale-status-badge confirmed">Підтверджено</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {approveModal.open && approveModal.sale && (
        <div className="modal-overlay" onClick={closeApprove}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Затвердження премії</h3>
              <button type="button" className="btn-close" onClick={closeApprove}>
                ×
              </button>
            </div>
            <form onSubmit={handleApproveSubmit}>
              <div className="modal-body">
                <p style={{ marginBottom: 12 }}>
                  <strong>Клієнт:</strong> {approveModal.sale.clientId?.name || approveModal.sale.clientName || '—'}
                </p>
                <p style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
                  Рекомендована сума (за коефіцієнтом {bonusPct}%):{' '}
                  <strong>{formatCurrency(suggestedPremiumForSale(approveModal.sale, bonusPct))}</strong>
                </p>
                <div className="form-group">
                  <label>Премія до начислення, ₴</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={approveAmount}
                    onChange={(e) => setApproveAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Період начислення (ММ-РРРР)</label>
                  <input
                    type="text"
                    placeholder="04-2026"
                    value={approvePeriod}
                    onChange={(e) => setApprovePeriod(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={closeApprove} disabled={submitting}>
                  Скасувати
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Збереження...' : 'Затвердити'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SalesAccountingDashboard;
