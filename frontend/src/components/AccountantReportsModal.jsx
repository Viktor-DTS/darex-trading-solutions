import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../config';
import './AccountantReportsModal.css';

function AccountantReportsModal({ isOpen, onClose, user }) {
  const [activeReport, setActiveReport] = useState('financial');
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [regions, setRegions] = useState([]);
  
  // Фільтри фінансового звіту
  const [financialFilters, setFinancialFilters] = useState({
    dateFrom: new Date().toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    region: '',
    detailed: false,
    groupBy: 'region', // 'region', 'client', 'equipment'
    onlyApproved: true // Тільки підтверджені заявки
  });
  
  // Фільтри аналітики
  const [analyticsFilters, setAnalyticsFilters] = useState({
    period: 'month', // 'week', 'month', 'quarter', 'year'
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1
  });

  // Завантаження даних
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [tasksRes, regionsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tasks/filter?status=Виконано`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/regions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data);
      }
      if (regionsRes.ok) {
        const data = await regionsRes.json();
        // Регіони можуть приходити як масив об'єктів {name} або масив рядків
        const regionNames = data.map(r => typeof r === 'object' ? r.name : r);
        setRegions(regionNames);
      }
    } catch (error) {
      console.error('Помилка завантаження даних:', error);
    }
  };

  // Допоміжна функція перевірки затвердження
  const isApproved = (value) => value === true || value === 'Підтверджено';

  // Фільтровані завдання
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Фільтр по статусу затвердження
      if (financialFilters.onlyApproved) {
        // Тільки підтверджені: Виконано + завсклад + бухгалтер
        if (t.status !== 'Виконано') return false;
        if (!isApproved(t.approvedByWarehouse)) return false;
        if (!isApproved(t.approvedByAccountant)) return false;
      }
      
      // Фільтр по даті
      if (financialFilters.dateFrom && t.date) {
        const taskDate = new Date(t.date);
        const fromDate = new Date(financialFilters.dateFrom);
        if (taskDate < fromDate) return false;
      }
      if (financialFilters.dateTo && t.date) {
        const taskDate = new Date(t.date);
        const toDate = new Date(financialFilters.dateTo);
        toDate.setHours(23, 59, 59);
        if (taskDate > toDate) return false;
      }
      // Фільтр по регіону
      if (financialFilters.region && t.serviceRegion !== financialFilters.region) {
        return false;
      }
      return true;
    });
  }, [tasks, financialFilters]);

  // Статистика
  const statistics = useMemo(() => {
    const stats = {
      totalTasks: filteredTasks.length,
      totalServiceAmount: 0,
      totalWorkPrice: 0,
      totalMaterials: 0,
      byRegion: {},
      byClient: {},
      byEquipment: {}
    };

    filteredTasks.forEach(t => {
      const serviceTotal = parseFloat(t.serviceTotal) || 0;
      const workPrice = parseFloat(t.workPrice) || 0;
      const materials = serviceTotal - workPrice;

      stats.totalServiceAmount += serviceTotal;
      stats.totalWorkPrice += workPrice;
      stats.totalMaterials += materials;

      // По регіонах
      const region = t.serviceRegion || 'Не вказано';
      if (!stats.byRegion[region]) {
        stats.byRegion[region] = { count: 0, amount: 0 };
      }
      stats.byRegion[region].count++;
      stats.byRegion[region].amount += serviceTotal;

      // По клієнтах
      const client = t.client || 'Не вказано';
      if (!stats.byClient[client]) {
        stats.byClient[client] = { count: 0, amount: 0 };
      }
      stats.byClient[client].count++;
      stats.byClient[client].amount += serviceTotal;

      // По обладнанню
      const equipment = t.equipment || 'Не вказано';
      if (!stats.byEquipment[equipment]) {
        stats.byEquipment[equipment] = { count: 0, amount: 0 };
      }
      stats.byEquipment[equipment].count++;
      stats.byEquipment[equipment].amount += serviceTotal;
    });

    return stats;
  }, [filteredTasks]);

  // Генерація HTML звіту
  const generateHTMLReport = () => {
    setLoading(true);
    
    const dateRange = `${financialFilters.dateFrom} - ${financialFilters.dateTo}`;
    const regionTitle = financialFilters.region || 'Всі регіони';
    const approvalStatus = financialFilters.onlyApproved 
      ? '✅ Тільки підтверджені' 
      : '📋 Всі виконані';
    
    // Групування по вибраному полю
    let groupedData = {};
    let groupTitle = '';
    
    switch (financialFilters.groupBy) {
      case 'client':
        groupedData = statistics.byClient;
        groupTitle = 'Замовник';
        break;
      case 'equipment':
        groupedData = statistics.byEquipment;
        groupTitle = 'Обладнання';
        break;
      default:
        groupedData = statistics.byRegion;
        groupTitle = 'Регіон';
    }

    // Детальні дані для деталізації
    const detailedRows = financialFilters.detailed ? filteredTasks.map((t, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${t.date || ''}</td>
        <td>${t.requestNumber || ''}</td>
        <td>${t.serviceRegion || ''}</td>
        <td>${t.client || ''}</td>
        <td>${t.equipment || ''}</td>
        <td class="work-name">${t.work || ''}</td>
        <td>${[t.engineer1, t.engineer2].filter(Boolean).join(', ')}</td>
        <td class="amount">${(parseFloat(t.workPrice) || 0).toFixed(2)}</td>
        <td class="amount">${((parseFloat(t.serviceTotal) || 0) - (parseFloat(t.workPrice) || 0)).toFixed(2)}</td>
        <td class="amount total">${(parseFloat(t.serviceTotal) || 0).toFixed(2)}</td>
      </tr>
    `).join('') : '';

    const html = `
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Фінансовий звіт - ${dateRange}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 30px 40px;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header .subtitle {
      opacity: 0.8;
      font-size: 16px;
    }
    .header .date-range {
      display: inline-block;
      background: rgba(255,255,255,0.1);
      padding: 8px 16px;
      border-radius: 20px;
      margin-top: 15px;
      font-size: 14px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      padding: 30px 40px;
      background: #f8f9fa;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
      text-align: center;
    }
    .stat-card .icon {
      font-size: 36px;
      margin-bottom: 10px;
    }
    .stat-card .value {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a2e;
    }
    .stat-card .label {
      font-size: 13px;
      color: #666;
      margin-top: 5px;
    }
    .stat-card.highlight {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .stat-card.highlight .value,
    .stat-card.highlight .label {
      color: white;
    }
    .content {
      padding: 30px 40px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 600;
      color: #1a1a2e;
      margin: 30px 0 20px 0;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
      font-size: 13px;
    }
    th {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 14px 12px;
      text-align: left;
      font-weight: 600;
      white-space: nowrap;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    tr:hover td {
      background: #f8f9fa;
    }
    .amount {
      text-align: right;
      font-family: 'Consolas', monospace;
      font-weight: 500;
    }
    .total {
      font-weight: 700;
      color: #667eea;
    }
    .work-name {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .summary-row {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      font-weight: 700;
    }
    .summary-row td {
      border-bottom: none;
      color: white;
    }
    .print-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 25px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(102,126,234,0.4);
      z-index: 100;
    }
    .print-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102,126,234,0.5);
    }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; }
      .print-btn { display: none; }
    }
    .chart-container {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 30px;
      margin-top: 20px;
    }
    .chart-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    }
    .chart-title {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 15px;
    }
    .bar-chart .bar-item {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    }
    .bar-chart .bar-label {
      width: 120px;
      font-size: 12px;
      color: #666;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bar-chart .bar-track {
      flex: 1;
      height: 24px;
      background: #f0f0f0;
      border-radius: 12px;
      overflow: hidden;
      margin: 0 10px;
    }
    .bar-chart .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      transition: width 0.5s ease;
    }
    .bar-chart .bar-value {
      width: 80px;
      text-align: right;
      font-size: 12px;
      font-weight: 600;
      color: #1a1a2e;
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Друкувати</button>
  
  <div class="container">
    <div class="header">
      <h1>📊 Фінансовий звіт</h1>
      <div class="subtitle">Регіон: ${regionTitle} | ${approvalStatus}</div>
      <div class="date-range">📅 ${dateRange}</div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="icon">📋</div>
        <div class="value">${statistics.totalTasks}</div>
        <div class="label">Всього заявок</div>
      </div>
      <div class="stat-card">
        <div class="icon">🔧</div>
        <div class="value">${statistics.totalWorkPrice.toFixed(0)}</div>
        <div class="label">Вартість робіт, грн</div>
      </div>
      <div class="stat-card">
        <div class="icon">📦</div>
        <div class="value">${statistics.totalMaterials.toFixed(0)}</div>
        <div class="label">Матеріали, грн</div>
      </div>
      <div class="stat-card highlight">
        <div class="icon">💰</div>
        <div class="value">${statistics.totalServiceAmount.toFixed(0)}</div>
        <div class="label">Загальна сума, грн</div>
      </div>
    </div>
    
    <div class="content">
      <h2 class="section-title">📈 Розподіл по ${groupTitle.toLowerCase()}х</h2>
      
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>${groupTitle}</th>
            <th style="text-align:center">Кількість заявок</th>
            <th style="text-align:right">Сума, грн</th>
            <th style="text-align:right">% від загального</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(groupedData)
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([name, data], index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${name}</td>
                <td style="text-align:center">${data.count}</td>
                <td class="amount">${data.amount.toFixed(2)}</td>
                <td class="amount">${((data.amount / statistics.totalServiceAmount) * 100).toFixed(1)}%</td>
              </tr>
            `).join('')}
          <tr class="summary-row">
            <td colspan="2"><strong>ВСЬОГО</strong></td>
            <td style="text-align:center"><strong>${statistics.totalTasks}</strong></td>
            <td class="amount"><strong>${statistics.totalServiceAmount.toFixed(2)}</strong></td>
            <td class="amount"><strong>100%</strong></td>
          </tr>
        </tbody>
      </table>
      
      ${financialFilters.detailed ? `
        <h2 class="section-title">📝 Деталізація по заявках</h2>
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Дата</th>
              <th>№ заявки</th>
              <th>Регіон</th>
              <th>Замовник</th>
              <th>Обладнання</th>
              <th>Роботи</th>
              <th>Інженери</th>
              <th>Роботи, грн</th>
              <th>Матеріали, грн</th>
              <th>Всього, грн</th>
            </tr>
          </thead>
          <tbody>
            ${detailedRows}
            <tr class="summary-row">
              <td colspan="8"><strong>ПІДСУМОК</strong></td>
              <td class="amount"><strong>${statistics.totalWorkPrice.toFixed(2)}</strong></td>
              <td class="amount"><strong>${statistics.totalMaterials.toFixed(2)}</strong></td>
              <td class="amount"><strong>${statistics.totalServiceAmount.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
      ` : ''}
      
      <div class="chart-container">
        <div class="chart-card">
          <div class="chart-title">🏢 Топ-5 по сумі (${groupTitle})</div>
          <div class="bar-chart">
            ${Object.entries(groupedData)
              .sort((a, b) => b[1].amount - a[1].amount)
              .slice(0, 5)
              .map(([name, data]) => {
                const maxAmount = Math.max(...Object.values(groupedData).map(d => d.amount));
                const width = (data.amount / maxAmount) * 100;
                return `
                  <div class="bar-item">
                    <div class="bar-label" title="${name}">${name}</div>
                    <div class="bar-track">
                      <div class="bar-fill" style="width: ${width}%"></div>
                    </div>
                    <div class="bar-value">${data.amount.toFixed(0)} грн</div>
                  </div>
                `;
              }).join('')}
          </div>
        </div>
        
        <div class="chart-card">
          <div class="chart-title">📊 Топ-5 по кількості заявок (${groupTitle})</div>
          <div class="bar-chart">
            ${Object.entries(groupedData)
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 5)
              .map(([name, data]) => {
                const maxCount = Math.max(...Object.values(groupedData).map(d => d.count));
                const width = (data.count / maxCount) * 100;
                return `
                  <div class="bar-item">
                    <div class="bar-label" title="${name}">${name}</div>
                    <div class="bar-track">
                      <div class="bar-fill" style="width: ${width}%"></div>
                    </div>
                    <div class="bar-value">${data.count} шт</div>
                  </div>
                `;
              }).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <p style="text-align: center; color: rgba(255,255,255,0.6); margin-top: 20px; font-size: 12px;">
    Звіт сформовано: ${new Date().toLocaleString('uk-UA')} | Користувач: ${user?.name || user?.login}
  </p>
</body>
</html>
    `;

    const newWindow = window.open('', '_blank');
    newWindow.document.write(html);
    newWindow.document.close();
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="reports-modal-overlay" onClick={onClose}>
      <div className="reports-modal" onClick={e => e.stopPropagation()}>
        <div className="reports-modal-header">
          <h2>📊 Бухгалтерські звіти</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="reports-tabs">
          <button 
            className={`report-tab ${activeReport === 'financial' ? 'active' : ''}`}
            onClick={() => setActiveReport('financial')}
          >
            💰 Фінансовий звіт
          </button>
          <button 
            className={`report-tab ${activeReport === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveReport('analytics')}
          >
            📈 Аналітика
          </button>
        </div>

        <div className="reports-content">
          {activeReport === 'financial' && (
            <div className="report-section">
              <h3>Загальний звіт по руху фінансів</h3>
              
              <div className="filters-grid">
                <div className="filter-group">
                  <label>📅 Період з:</label>
                  <input
                    type="date"
                    value={financialFilters.dateFrom}
                    onChange={e => setFinancialFilters({...financialFilters, dateFrom: e.target.value})}
                  />
                </div>
                <div className="filter-group">
                  <label>📅 Період по:</label>
                  <input
                    type="date"
                    value={financialFilters.dateTo}
                    onChange={e => setFinancialFilters({...financialFilters, dateTo: e.target.value})}
                  />
                </div>
                <div className="filter-group">
                  <label>🌍 Регіон:</label>
                  <select
                    value={financialFilters.region}
                    onChange={e => setFinancialFilters({...financialFilters, region: e.target.value})}
                  >
                    <option value="">Всі регіони</option>
                    {regions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="filter-group">
                  <label>📊 Групувати по:</label>
                  <select
                    value={financialFilters.groupBy}
                    onChange={e => setFinancialFilters({...financialFilters, groupBy: e.target.value})}
                  >
                    <option value="region">Регіонам</option>
                    <option value="client">Замовникам</option>
                    <option value="equipment">Обладнанню</option>
                  </select>
                </div>
              </div>

              <div className="checkbox-filters-row">
                <label className="checkbox-filter">
                  <input
                    type="checkbox"
                    checked={financialFilters.onlyApproved}
                    onChange={e => setFinancialFilters({...financialFilters, onlyApproved: e.target.checked})}
                  />
                  <span>✅ Тільки підтверджені (завсклад + бухгалтер)</span>
                </label>
                
                <label className="checkbox-filter">
                  <input
                    type="checkbox"
                    checked={financialFilters.detailed}
                    onChange={e => setFinancialFilters({...financialFilters, detailed: e.target.checked})}
                  />
                  <span>📝 Деталізація по заявках</span>
                </label>
              </div>

              {/* Preview статистика */}
              <div className="preview-stats">
                <div className="stat-item">
                  <span className="stat-icon">📋</span>
                  <span className="stat-value">{statistics.totalTasks}</span>
                  <span className="stat-label">Заявок</span>
                </div>
                <div className="stat-item">
                  <span className="stat-icon">🔧</span>
                  <span className="stat-value">{statistics.totalWorkPrice.toFixed(0)}</span>
                  <span className="stat-label">Роботи, грн</span>
                </div>
                <div className="stat-item">
                  <span className="stat-icon">📦</span>
                  <span className="stat-value">{statistics.totalMaterials.toFixed(0)}</span>
                  <span className="stat-label">Матеріали, грн</span>
                </div>
                <div className="stat-item highlight">
                  <span className="stat-icon">💰</span>
                  <span className="stat-value">{statistics.totalServiceAmount.toFixed(0)}</span>
                  <span className="stat-label">Всього, грн</span>
                </div>
              </div>

              <div className="report-actions">
                <button 
                  className="btn-generate"
                  onClick={generateHTMLReport}
                  disabled={loading}
                >
                  {loading ? '⏳ Формування...' : '📄 Сформувати HTML звіт'}
                </button>
              </div>
            </div>
          )}

          {activeReport === 'analytics' && (
            <div className="report-section">
              <h3>Аналітичний дашборд</h3>
              
              <div className="analytics-preview">
                <div className="analytics-card">
                  <h4>🏆 Топ-5 регіонів по сумі</h4>
                  <div className="mini-chart">
                    {Object.entries(statistics.byRegion)
                      .sort((a, b) => b[1].amount - a[1].amount)
                      .slice(0, 5)
                      .map(([name, data], index) => (
                        <div key={name} className="mini-bar">
                          <span className="rank">#{index + 1}</span>
                          <span className="name">{name}</span>
                          <span className="value">{data.amount.toFixed(0)} грн</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="analytics-card">
                  <h4>👥 Топ-5 замовників</h4>
                  <div className="mini-chart">
                    {Object.entries(statistics.byClient)
                      .sort((a, b) => b[1].amount - a[1].amount)
                      .slice(0, 5)
                      .map(([name, data], index) => (
                        <div key={name} className="mini-bar">
                          <span className="rank">#{index + 1}</span>
                          <span className="name" title={name}>{name.length > 20 ? name.substring(0, 20) + '...' : name}</span>
                          <span className="value">{data.amount.toFixed(0)} грн</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="analytics-card wide">
                  <h4>📊 Розподіл доходів</h4>
                  <div className="pie-legend">
                    <div className="pie-item">
                      <span className="color-dot work"></span>
                      <span className="pie-label">Роботи:</span>
                      <span className="pie-value">{statistics.totalWorkPrice.toFixed(0)} грн ({((statistics.totalWorkPrice / statistics.totalServiceAmount) * 100 || 0).toFixed(1)}%)</span>
                    </div>
                    <div className="pie-item">
                      <span className="color-dot materials"></span>
                      <span className="pie-label">Матеріали:</span>
                      <span className="pie-value">{statistics.totalMaterials.toFixed(0)} грн ({((statistics.totalMaterials / statistics.totalServiceAmount) * 100 || 0).toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="report-actions">
                <button 
                  className="btn-generate"
                  onClick={generateHTMLReport}
                  disabled={loading}
                >
                  {loading ? '⏳ Формування...' : '📊 Сформувати аналітичний звіт'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AccountantReportsModal;
