import React, { useState, useEffect, useMemo, useCallback } from 'react';
import API_BASE_URL from '../config.js';
import './ReportBuilder.css';

// Доступні поля для звіту
const AVAILABLE_FIELDS = [
  { key: 'requestNumber', label: 'Номер заявки', type: 'text' },
  { key: 'requestDate', label: 'Дата заявки', type: 'date' },
  { key: 'date', label: 'Дата виконання', type: 'date' },
  { key: 'status', label: 'Статус', type: 'select' },
  { key: 'client', label: 'Замовник', type: 'text' },
  { key: 'edrpou', label: 'ЄДРПОУ', type: 'text' },
  { key: 'address', label: 'Адреса', type: 'text' },
  { key: 'serviceRegion', label: 'Регіон', type: 'select' },
  { key: 'equipment', label: 'Обладнання', type: 'text' },
  { key: 'work', label: 'Найменування робіт', type: 'text' },
  { key: 'engineer1', label: 'Інженер 1', type: 'select' },
  { key: 'engineer2', label: 'Інженер 2', type: 'select' },
  { key: 'company', label: 'Компанія виконавець', type: 'select' },
  { key: 'paymentType', label: 'Тип оплати', type: 'select' },
  { key: 'serviceTotal', label: 'Сума послуг', type: 'number' },
  { key: 'workPrice', label: 'Вартість робіт', type: 'number' },
  { key: 'oilTotal', label: 'Сума оливи', type: 'number' },
  { key: 'filterSum', label: 'Сума фільтрів', type: 'number' },
  { key: 'transportSum', label: 'Транспортні витрати', type: 'number' },
  { key: 'approvedByWarehouse', label: 'Підтвердження складу', type: 'approval' },
  { key: 'approvedByAccountant', label: 'Підтвердження бухгалтера', type: 'approval' },
  { key: 'invoice', label: 'Номер рахунку', type: 'text' },
];

// Готові шаблони звітів
const REPORT_TEMPLATES = [
  {
    id: 'financial',
    name: '💰 Фінансовий звіт',
    description: 'Доходи та витрати по заявках',
    fields: ['requestNumber', 'date', 'client', 'serviceRegion', 'serviceTotal', 'workPrice', 'paymentType'],
    groupBy: 'serviceRegion',
    filters: { status: 'Виконано' }
  },
  {
    id: 'engineers',
    name: '👷 Звіт по інженерах',
    description: 'Роботи виконані інженерами',
    fields: ['requestNumber', 'date', 'engineer1', 'engineer2', 'work', 'client', 'serviceTotal'],
    groupBy: 'engineer1',
    filters: {}
  },
  {
    id: 'clients',
    name: '🏢 Звіт по клієнтах',
    description: 'Заявки згруповані по замовниках',
    fields: ['requestNumber', 'date', 'client', 'edrpou', 'address', 'equipment', 'serviceTotal'],
    groupBy: 'client',
    filters: {}
  },
  {
    id: 'regions',
    name: '🌍 Звіт по регіонах',
    description: 'Статистика по регіонах',
    fields: ['requestNumber', 'date', 'serviceRegion', 'client', 'serviceTotal', 'status'],
    groupBy: 'serviceRegion',
    filters: {}
  },
  {
    id: 'approval',
    name: '✅ Звіт по затвердженнях',
    description: 'Статус підтверджень заявок',
    fields: ['requestNumber', 'date', 'client', 'approvedByWarehouse', 'approvedByAccountant', 'serviceTotal'],
    groupBy: null,
    filters: { status: 'Виконано' }
  },
  {
    id: 'materials',
    name: '🔧 Матеріали та витрати',
    description: 'Використані матеріали',
    fields: ['requestNumber', 'date', 'equipment', 'oilTotal', 'filterSum', 'transportSum', 'serviceTotal'],
    groupBy: 'equipment',
    filters: {}
  }
];

export default function ReportBuilder({ user }) {
  // Стан даних
  const [tasks, setTasks] = useState([]);
  const [regions, setRegions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Стан конструктора
  const [selectedFields, setSelectedFields] = useState(['requestNumber', 'date', 'client', 'serviceTotal']);
  const [groupBy, setGroupBy] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Фільтри
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    status: '',
    serviceRegion: '',
    approvalStatus: 'all' // all, approved, pending, rejected
  });
  
  // Активна вкладка
  const [activeTab, setActiveTab] = useState('builder'); // builder, templates, saved
  
  // Збережені звіти
  const [savedReports, setSavedReports] = useState([]);
  const [reportName, setReportName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Завантаження даних
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [tasksRes, regionsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tasks/filter?showAll=true`, { headers }),
        fetch(`${API_BASE_URL}/regions`, { headers }),
        fetch(`${API_BASE_URL}/users`, { headers })
      ]);
      
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.tasks || data);
      }
      
      if (regionsRes.ok) {
        const data = await regionsRes.json();
        setRegions(data.map(r => r.name || r));
      }
      
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
    } finally {
      setLoading(false);
    }
  };

  // Фільтрація даних
  const filteredData = useMemo(() => {
    return tasks.filter(task => {
      // Фільтр по датах
      if (filters.dateFrom && task.date < filters.dateFrom) return false;
      if (filters.dateTo && task.date > filters.dateTo) return false;
      
      // Фільтр по статусу
      if (filters.status && task.status !== filters.status) return false;
      
      // Фільтр по регіону
      if (filters.serviceRegion && task.serviceRegion !== filters.serviceRegion) return false;
      
      // Фільтр по затвердженню
      if (filters.approvalStatus !== 'all') {
        const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено';
        const isAccountantApproved = task.approvedByAccountant === 'Підтверджено';
        
        if (filters.approvalStatus === 'approved' && (!isWarehouseApproved || !isAccountantApproved)) return false;
        if (filters.approvalStatus === 'pending' && (isWarehouseApproved && isAccountantApproved)) return false;
        if (filters.approvalStatus === 'rejected' && 
            task.approvedByWarehouse !== 'Відмова' && task.approvedByAccountant !== 'Відмова') return false;
      }
      
      // Фільтр по регіону користувача
      if (user?.region && user.region !== 'Україна' && task.serviceRegion !== user.region) {
        return false;
      }
      
      return true;
    });
  }, [tasks, filters, user]);

  // Розрахунок підсумків (повинно бути перед groupedData)
  const calculateTotals = useCallback((items) => {
    const totals = {};
    const numericFields = AVAILABLE_FIELDS.filter(f => f.type === 'number').map(f => f.key);
    
    numericFields.forEach(field => {
      totals[field] = items.reduce((sum, item) => sum + (parseFloat(item[field]) || 0), 0);
    });
    
    totals.count = items.length;
    return totals;
  }, []);

  // Групування даних
  const groupedData = useMemo(() => {
    if (!groupBy) {
      // Сортування без групування
      return [...filteredData].sort((a, b) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      });
    }
    
    // Групування
    const groups = {};
    filteredData.forEach(task => {
      const key = task[groupBy] || 'Не вказано';
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    
    return Object.entries(groups).map(([key, items]) => ({
      groupName: key,
      items: items.sort((a, b) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      }),
      totals: calculateTotals(items)
    }));
  }, [filteredData, groupBy, sortBy, sortOrder, calculateTotals]);

  // Загальні підсумки
  const grandTotals = useMemo(() => calculateTotals(filteredData), [filteredData, calculateTotals]);

  // Застосування шаблону
  const applyTemplate = (template) => {
    setSelectedFields(template.fields);
    setGroupBy(template.groupBy);
    setFilters(prev => ({ ...prev, ...template.filters }));
    setActiveTab('builder');
  };

  // Переключення поля
  const toggleField = (fieldKey) => {
    setSelectedFields(prev => 
      prev.includes(fieldKey) 
        ? prev.filter(f => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  // Форматування значення
  const formatValue = (value, type) => {
    if (value === null || value === undefined) return '-';
    
    if (type === 'number') {
      return Number(value).toLocaleString('uk-UA', { minimumFractionDigits: 2 });
    }
    if (type === 'approval') {
      if (value === 'Підтверджено' || value === true) return '✅ Підтверджено';
      if (value === 'Відмова' || value === false) return '❌ Відмова';
      return '⏳ На розгляді';
    }
    return String(value);
  };

  // Експорт в HTML
  const exportToHTML = () => {
    const html = generateHTMLReport();
    const newWindow = window.open('', '_blank');
    newWindow.document.write(html);
    newWindow.document.close();
  };

  // Генерація HTML звіту
  const generateHTMLReport = () => {
    const selectedFieldsData = AVAILABLE_FIELDS.filter(f => selectedFields.includes(f.key));
    
    return `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <title>Звіт - ${new Date().toLocaleDateString('uk-UA')}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .header { background: linear-gradient(135deg, #1a2636, #22334a); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
          .header h1 { margin: 0 0 8px 0; }
          .stats { display: flex; gap: 24px; margin-top: 16px; flex-wrap: wrap; }
          .stat { background: rgba(255,255,255,0.1); padding: 12px 20px; border-radius: 8px; }
          .stat-value { font-size: 24px; font-weight: bold; }
          .stat-label { font-size: 12px; opacity: 0.8; }
          table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          th { background: #1976d2; color: white; padding: 12px; text-align: left; font-weight: 600; }
          td { padding: 10px 12px; border-bottom: 1px solid #eee; }
          tr:hover { background: #f8f9fa; }
          .group-header { background: #e3f2fd; font-weight: bold; }
          .group-header td { padding: 12px; color: #1565c0; }
          .totals-row { background: #1a2636; color: #4fc3f7; font-weight: bold; }
          .totals-row td { padding: 12px; }
          .print-btn { position: fixed; top: 20px; right: 20px; background: #1976d2; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px; }
          @media print { .print-btn { display: none; } }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">🖨️ Друкувати</button>
        <div class="header">
          <h1>📊 Звіт</h1>
          <p>Сформовано: ${new Date().toLocaleString('uk-UA')}</p>
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${filteredData.length}</div>
              <div class="stat-label">Записів</div>
            </div>
            <div class="stat">
              <div class="stat-value">${grandTotals.serviceTotal?.toLocaleString('uk-UA') || 0} ₴</div>
              <div class="stat-label">Загальна сума</div>
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>№</th>
              ${selectedFieldsData.map(f => `<th>${f.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${groupBy ? groupedData.map((group, gi) => `
              <tr class="group-header">
                <td colspan="${selectedFields.length + 1}">
                  📁 ${AVAILABLE_FIELDS.find(f => f.key === groupBy)?.label}: ${group.groupName} 
                  (${group.items.length} записів, сума: ${(group.totals.serviceTotal || 0).toLocaleString('uk-UA')} ₴)
                </td>
              </tr>
              ${group.items.map((task, ti) => `
                <tr>
                  <td>${gi + 1}.${ti + 1}</td>
                  ${selectedFieldsData.map(f => `<td>${formatValue(task[f.key], f.type)}</td>`).join('')}
                </tr>
              `).join('')}
            `).join('') : filteredData.map((task, i) => `
              <tr>
                <td>${i + 1}</td>
                ${selectedFieldsData.map(f => `<td>${formatValue(task[f.key], f.type)}</td>`).join('')}
              </tr>
            `).join('')}
            <tr class="totals-row">
              <td>Підсумок:</td>
              ${selectedFieldsData.map(f => `
                <td>${f.type === 'number' ? (grandTotals[f.key] || 0).toLocaleString('uk-UA') + ' ₴' : ''}</td>
              `).join('')}
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;
  };

  // Експорт в CSV
  const exportToCSV = () => {
    const selectedFieldsData = AVAILABLE_FIELDS.filter(f => selectedFields.includes(f.key));
    const headers = ['№', ...selectedFieldsData.map(f => f.label)].join(';');
    
    const rows = filteredData.map((task, i) => 
      [i + 1, ...selectedFieldsData.map(f => formatValue(task[f.key], f.type))].join(';')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Збереження звіту
  const saveReport = () => {
    if (!reportName.trim()) return;
    
    const report = {
      id: Date.now(),
      name: reportName,
      date: new Date().toISOString(),
      selectedFields,
      groupBy,
      sortBy,
      sortOrder,
      filters
    };
    
    const saved = JSON.parse(localStorage.getItem('savedReports') || '[]');
    saved.push(report);
    localStorage.setItem('savedReports', JSON.stringify(saved));
    setSavedReports(saved);
    setShowSaveModal(false);
    setReportName('');
  };

  // Завантаження збережених звітів
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('savedReports') || '[]');
    setSavedReports(saved);
  }, []);

  // Застосування збереженого звіту
  const loadSavedReport = (report) => {
    setSelectedFields(report.selectedFields);
    setGroupBy(report.groupBy);
    setSortBy(report.sortBy);
    setSortOrder(report.sortOrder);
    setFilters(report.filters);
    setActiveTab('builder');
  };

  // Видалення збереженого звіту
  const deleteSavedReport = (id) => {
    const saved = savedReports.filter(r => r.id !== id);
    localStorage.setItem('savedReports', JSON.stringify(saved));
    setSavedReports(saved);
  };

  if (loading) {
    return <div className="report-loading">⏳ Завантаження даних...</div>;
  }

  return (
    <div className="report-builder">
      {/* Заголовок */}
      <div className="report-header">
        <h2>📊 Конструктор звітів</h2>
        <div className="report-stats">
          <div className="stat-item">
            <span className="stat-value">{filteredData.length}</span>
            <span className="stat-label">записів</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{(grandTotals.serviceTotal || 0).toLocaleString('uk-UA')} ₴</span>
            <span className="stat-label">загальна сума</span>
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className="report-tabs">
        <button 
          className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          🔧 Конструктор
        </button>
        <button 
          className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          📋 Шаблони
        </button>
        <button 
          className={`tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          💾 Збережені ({savedReports.length})
        </button>
      </div>

      {/* Контент вкладок */}
      {activeTab === 'templates' && (
        <div className="templates-grid">
          {REPORT_TEMPLATES.map(template => (
            <div key={template.id} className="template-card" onClick={() => applyTemplate(template)}>
              <div className="template-icon">{template.name.split(' ')[0]}</div>
              <div className="template-info">
                <h4>{template.name.substring(2)}</h4>
                <p>{template.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'saved' && (
        <div className="saved-reports">
          {savedReports.length === 0 ? (
            <div className="no-saved">Немає збережених звітів</div>
          ) : (
            savedReports.map(report => (
              <div key={report.id} className="saved-report-card">
                <div className="saved-info">
                  <h4>{report.name}</h4>
                  <p>{new Date(report.date).toLocaleDateString('uk-UA')}</p>
                </div>
                <div className="saved-actions">
                  <button onClick={() => loadSavedReport(report)}>📂 Завантажити</button>
                  <button className="delete" onClick={() => deleteSavedReport(report.id)}>🗑️</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'builder' && (
        <>
          {/* Фільтри */}
          <div className="report-filters">
            <h3>🔍 Фільтри</h3>
            <div className="filters-grid">
              <div className="filter-group">
                <label>Період з:</label>
                <input 
                  type="date" 
                  value={filters.dateFrom}
                  onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>Період по:</label>
                <input 
                  type="date" 
                  value={filters.dateTo}
                  onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>Статус:</label>
                <select 
                  value={filters.status}
                  onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">Всі</option>
                  <option value="Заявка">Заявка</option>
                  <option value="В роботі">В роботі</option>
                  <option value="Виконано">Виконано</option>
                  <option value="Заблоковано">Заблоковано</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Регіон:</label>
                <select 
                  value={filters.serviceRegion}
                  onChange={e => setFilters(prev => ({ ...prev, serviceRegion: e.target.value }))}
                  disabled={user?.region && user.region !== 'Україна'}
                >
                  <option value="">Всі регіони</option>
                  {regions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>Затвердження:</label>
                <select 
                  value={filters.approvalStatus}
                  onChange={e => setFilters(prev => ({ ...prev, approvalStatus: e.target.value }))}
                >
                  <option value="all">Всі</option>
                  <option value="approved">✅ Затверджені</option>
                  <option value="pending">⏳ На розгляді</option>
                  <option value="rejected">❌ Відхилені</option>
                </select>
              </div>
            </div>
          </div>

          {/* Вибір полів */}
          <div className="report-fields">
            <h3>📋 Поля звіту</h3>
            <div className="fields-grid">
              {AVAILABLE_FIELDS.map(field => (
                <label key={field.key} className={`field-checkbox ${selectedFields.includes(field.key) ? 'selected' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={selectedFields.includes(field.key)}
                    onChange={() => toggleField(field.key)}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>

          {/* Групування та сортування */}
          <div className="report-options">
            <div className="option-group">
              <label>Групувати по:</label>
              <select value={groupBy || ''} onChange={e => setGroupBy(e.target.value || null)}>
                <option value="">Без групування</option>
                {AVAILABLE_FIELDS.filter(f => f.type !== 'number').map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="option-group">
              <label>Сортувати по:</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                {AVAILABLE_FIELDS.map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="option-group">
              <label>Напрямок:</label>
              <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                <option value="desc">↓ Спадання</option>
                <option value="asc">↑ Зростання</option>
              </select>
            </div>
          </div>

          {/* Кнопки дій */}
          <div className="report-actions">
            <button className="btn-primary" onClick={exportToHTML}>
              📄 Відкрити звіт
            </button>
            <button className="btn-secondary" onClick={exportToCSV}>
              📥 Експорт CSV
            </button>
            <button className="btn-save" onClick={() => setShowSaveModal(true)}>
              💾 Зберегти шаблон
            </button>
          </div>

          {/* Попередній перегляд */}
          <div className="report-preview">
            <h3>👁️ Попередній перегляд ({filteredData.length} записів)</h3>
            <div className="preview-table-wrapper">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>№</th>
                    {AVAILABLE_FIELDS.filter(f => selectedFields.includes(f.key)).map(f => (
                      <th key={f.key}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(groupBy ? groupedData.slice(0, 5) : filteredData.slice(0, 10)).map((item, i) => 
                    groupBy ? (
                      <React.Fragment key={item.groupName}>
                        <tr className="group-row">
                          <td colSpan={selectedFields.length + 1}>
                            📁 {item.groupName} ({item.items.length} записів)
                          </td>
                        </tr>
                        {item.items.slice(0, 3).map((task, ti) => (
                          <tr key={task._id || ti}>
                            <td>{i + 1}.{ti + 1}</td>
                            {AVAILABLE_FIELDS.filter(f => selectedFields.includes(f.key)).map(f => (
                              <td key={f.key}>{formatValue(task[f.key], f.type)}</td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ) : (
                      <tr key={item._id || i}>
                        <td>{i + 1}</td>
                        {AVAILABLE_FIELDS.filter(f => selectedFields.includes(f.key)).map(f => (
                          <td key={f.key}>{formatValue(item[f.key], f.type)}</td>
                        ))}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
              {filteredData.length > 10 && (
                <div className="preview-more">... та ще {filteredData.length - 10} записів</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Модальне вікно збереження */}
      {showSaveModal && (
        <div className="modal-overlay">
          <div className="save-modal">
            <h3>💾 Зберегти шаблон звіту</h3>
            <input 
              type="text" 
              placeholder="Назва шаблону"
              value={reportName}
              onChange={e => setReportName(e.target.value)}
            />
            <div className="modal-actions">
              <button onClick={() => setShowSaveModal(false)}>Скасувати</button>
              <button className="btn-primary" onClick={saveReport}>Зберегти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
