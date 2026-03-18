import React, { useState, useEffect } from 'react';
import { getSales } from '../../utils/salesAPI';
import { getUsers } from '../../utils/clientsAPI';
import './ManagerTabs.css';

const STATUS_LABELS = {
  draft: 'Чернетка',
  primary_contact: 'Первичний контакт',
  quote_sent: 'Відправив КП',
  in_negotiation: 'В процесі домовленості',
  in_progress: 'В процесі',
  in_realization: 'Реалізація угоди',
  pnr: 'ПНР',
  success: 'Успішно реалізовано',
  confirmed: 'Підтверджено',
  cancelled: 'Скасовано'
};

const statusLabel = (v) => STATUS_LABELS[v] || v || '—';

const formatCurrency = (v) => new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(v || 0);

const formatDate = (d) => d ? new Date(d).toLocaleDateString('uk-UA') : '—';

function SalesReportTab({ user }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    managerLogin: '',
    dateFrom: '',
    dateTo: ''
  });
  const [groupBy, setGroupBy] = useState('');
  const isAdmin = ['admin', 'administrator', 'mgradm'].includes(user?.role);

  useEffect(() => {
    getUsers().then(list => {
      const users = list || [];
      setManagers(users.filter(u => (u.role || '').toLowerCase() === 'manager'));
    });
  }, []);

  useEffect(() => {
    loadSales();
  }, [filters]);

  const loadSales = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.managerLogin && isAdmin) params.managerLogin = filters.managerLogin;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      const data = await getSales(params);
      const list = Array.isArray(data) ? data : data.sales || [];
      setSales(list);
    } catch (err) {
      console.error(err);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  const groupedData = () => {
    if (!groupBy) return { '': sales };
    const groups = {};
    sales.forEach(s => {
      let key = '—';
      if (groupBy === 'status') key = statusLabel(s.status);
      else if (groupBy === 'manager') key = s.managerName || s.managerLogin || '—';
      else if (groupBy === 'client') key = s.clientId?.name || s.clientName || '—';
      else if (groupBy === 'partner') key = s.partner || '—';
      else if (groupBy === 'engineer') key = s.engineer || '—';
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (groupBy === 'status') {
        const order = ['В процесі домовленості', 'Реалізація угоди', 'Успішно реалізовано', 'Скасовано'];
        return order.indexOf(a) - order.indexOf(b) || a.localeCompare(b);
      }
      return a.localeCompare(b);
    });
    const result = {};
    sortedKeys.forEach(k => { result[k] = groups[k]; });
    return result;
  };

  const exportReport = () => {
    const cols = [
      'Дата', 'Статус', 'Менеджер', 'Менеджер 2', 'Тендер', 'Клієнт', 'ЄДРПОУ', 'Покупатель',
      'Адрес ММ', 'Номер видаткової накладної', 'Обладнання', 'Серійний №', 'Спосіб оплати',
      'Сума', 'Транспорт', 'ПНР', 'Представницькі', 'Інші', 'Знижка %', 'Премія', 'Чиста вартість',
      'Інженер', 'Склад', 'Партнер', 'Контакт партнера', 'Платежі', 'Гарантія до', 'Примітки'
    ];
    const rows = sales.map(s => [
      formatDate(s.saleDate),
      statusLabel(s.status),
      s.managerName || s.managerLogin || '',
      s.managerName2 || s.managerLogin2 || '',
      s.tenderEmployeeName || s.tenderEmployeeLogin || '',
      s.clientId?.name || s.clientName || '',
      s.edrpou || s.clientId?.edrpou || '',
      s.buyer || '',
      s.addressMM || '',
      s.invoiceNumber || '',
      s.mainProductName || '',
      s.mainProductSerial || '',
      s.paymentMethod || '',
      (s.totalAmount || s.mainProductAmount || 0).toString(),
      (s.transportCosts || 0).toString(),
      (s.pnrCosts || 0).toString(),
      (s.representativeCosts || 0).toString(),
      (s.otherCosts || 0).toString(),
      (s.discountPercent || 0).toString(),
      (s.managerPremium || 0).toString(),
      (s.totalAmount || 0).toString(),
      s.engineer || '',
      s.warehouseName || '',
      s.partner || '',
      s.partnerContactName || '',
      (s.payments || []).map(p => `${formatDate(p.date)}: ${p.amount || 0} ₴`).join('; ') || '',
      formatDate(s.warrantyUntil),
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

  const data = groupedData();

  return (
    <div className="manager-tab-content manager-crm-tab sales-report-tab">
      <div className="manager-header" style={{ flexShrink: 0 }}>
        <h2>📊 Звіт по угодах</h2>
        <p className="tab-description">
          Звіт з відборами та групуваннями. Виберіть фільтри та групування, потім експортуйте в CSV.
        </p>
      </div>

      <div className="report-filters">
        <div className="report-filter-row">
          <div className="filter-group">
            <label>Статус</label>
            <select
              value={filters.status}
              onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="">— Всі —</option>
              <option value="in_negotiation">В процесі домовленості</option>
              <option value="in_realization">Реалізація угоди</option>
              <option value="success">Успішно реалізовано</option>
              <option value="confirmed">Підтверджено</option>
              <option value="cancelled">Скасовано</option>
            </select>
          </div>
          {isAdmin && (
            <div className="filter-group">
              <label>Менеджер</label>
              <select
                value={filters.managerLogin}
                onChange={e => setFilters(prev => ({ ...prev, managerLogin: e.target.value }))}
              >
                <option value="">— Всі —</option>
                {managers.map(m => (
                  <option key={m.login} value={m.login}>{m.name || m.login}</option>
                ))}
              </select>
            </div>
          )}
          <div className="filter-group">
            <label>Дата з</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label>Дата по</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label>Групувати по</label>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value)}
            >
              <option value="">— Без групування —</option>
              <option value="status">Статус</option>
              <option value="manager">Менеджер</option>
              <option value="client">Клієнт</option>
              <option value="partner">Партнер</option>
              <option value="engineer">Інженер</option>
            </select>
          </div>
          <button className="btn-primary" onClick={loadSales} disabled={loading}>
            {loading ? 'Завантаження...' : '🔄 Оновити'}
          </button>
          <button className="btn-secondary" onClick={exportReport} disabled={loading || sales.length === 0}>
            📥 Експорт CSV
          </button>
        </div>
      </div>

      <div className="report-summary">
        Знайдено угод: <strong>{sales.length}</strong>
      </div>

      <div className="report-table-container">
        {loading ? (
          <div className="loading-indicator">Завантаження...</div>
        ) : sales.length === 0 ? (
          <div className="no-history">Немає угод за обраними фільтрами</div>
        ) : (
          Object.entries(data).map(([groupKey, items]) => (
            <div key={groupKey || 'all'} className="report-group">
              {groupBy && <h3 className="report-group-title">{groupKey}</h3>}
              <table className="history-table crm-table report-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Клієнт</th>
                    <th>ЄДРПОУ</th>
                    {isAdmin && <th>Менеджер</th>}
                    <th>Обладнання</th>
                    <th>Серійний №</th>
                    <th>Адрес ММ</th>
                    <th>Номер видаткової накладної</th>
                    <th>Спосіб оплати</th>
                    <th>Сума</th>
                    <th>Транспорт</th>
                    <th>ПНР</th>
                    <th>Знижка %</th>
                    <th>Премія</th>
                    <th>Інженер</th>
                    <th>Партнер</th>
                    <th>Платежі</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(s => (
                    <tr key={s._id}>
                      <td>{formatDate(s.saleDate)}</td>
                      <td>{s.clientId?.name || s.clientName || '—'}</td>
                      <td>{s.edrpou || s.clientId?.edrpou || '—'}</td>
                      {isAdmin && (
                        <td>
                          {[s.managerName || s.managerLogin, s.managerName2 || s.managerLogin2]
                            .filter(Boolean)
                            .join(' / ') || '—'}
                        </td>
                      )}
                      <td>{s.mainProductName || '—'}</td>
                      <td>{s.mainProductSerial || '—'}</td>
                      <td>{s.addressMM || '—'}</td>
                      <td>{s.invoiceNumber || '—'}</td>
                      <td>{s.paymentMethod || '—'}</td>
                      <td>{formatCurrency(s.totalAmount || s.mainProductAmount)}</td>
                      <td>{formatCurrency(s.transportCosts)}</td>
                      <td>{formatCurrency(s.pnrCosts)}</td>
                      <td>{s.discountPercent != null ? `${s.discountPercent}%` : '—'}</td>
                      <td>{formatCurrency(s.managerPremium)}</td>
                      <td>{s.engineer || '—'}</td>
                      <td>{s.partner || '—'}</td>
                      <td>
                        {(s.payments || []).map(p => `${formatDate(p.date)}: ${p.amount || 0}`).join('; ') || '—'}
                      </td>
                      <td>
                        <span className={`sale-status-badge ${s.status || 'in_negotiation'}`}>
                          {statusLabel(s.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default SalesReportTab;
