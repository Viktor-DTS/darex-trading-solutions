import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../config.js';
import './AnalyticsDashboard.css';

// Кольори
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7300'];
const STATUS_COLORS = {
  'Заявка': '#2196F3',
  'В роботі': '#FF9800',
  'Виконано': '#4CAF50',
  'Заблоковано': '#f44336'
};

// Функція форматування валюти
const formatCurrency = (value) => {
  if (!value && value !== 0) return '0 ₴';
  return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(value);
};

// Функція для отримання назви місяця
const getMonthName = (month) => {
  const months = ['', 'Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
  return months[month] || '';
};

// Простий Bar Chart компонент
const SimpleBarChart = ({ data, dataKey, nameKey, color = '#4CAF50', showValues = true, horizontal = false }) => {
  const maxValue = Math.max(...data.map(d => d[dataKey] || 0), 1);
  
  if (horizontal) {
    return (
      <div className="simple-bar-chart horizontal">
        {data.map((item, index) => (
          <div key={index} className="bar-row">
            <div className="bar-label">{item[nameKey]}</div>
            <div className="bar-container">
              <div 
                className="bar" 
                style={{ 
                  width: `${(item[dataKey] / maxValue) * 100}%`,
                  backgroundColor: COLORS[index % COLORS.length] || color
                }}
              />
              {showValues && (
                <span className="bar-value">
                  {typeof item[dataKey] === 'number' && item[dataKey] > 1000 
                    ? formatCurrency(item[dataKey]) 
                    : item[dataKey]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <div className="simple-bar-chart vertical">
      {data.map((item, index) => (
        <div key={index} className="bar-column">
          <div className="bar-value-top">
            {typeof item[dataKey] === 'number' && item[dataKey] > 1000 
              ? `${(item[dataKey] / 1000).toFixed(0)}k` 
              : item[dataKey]}
          </div>
          <div className="bar-wrapper">
            <div 
              className="bar" 
              style={{ 
                height: `${(item[dataKey] / maxValue) * 100}%`,
                backgroundColor: COLORS[index % COLORS.length] || color
              }}
            />
          </div>
          <div className="bar-label">{item[nameKey]}</div>
        </div>
      ))}
    </div>
  );
};

// Простий Pie Chart компонент (з CSS)
const SimplePieChart = ({ data, dataKey, nameKey }) => {
  const total = data.reduce((sum, item) => sum + (item[dataKey] || 0), 0);
  let currentAngle = 0;
  
  const segments = data.map((item, index) => {
    const value = item[dataKey] || 0;
    const percentage = total > 0 ? (value / total) * 100 : 0;
    const angle = (percentage / 100) * 360;
    const segment = {
      ...item,
      percentage,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: COLORS[index % COLORS.length]
    };
    currentAngle += angle;
    return segment;
  });
  
  // Створюємо conic-gradient
  let gradientParts = [];
  segments.forEach((seg, i) => {
    if (seg.percentage > 0) {
      gradientParts.push(`${seg.color} ${seg.startAngle}deg ${seg.endAngle}deg`);
    }
  });
  
  const gradient = gradientParts.length > 0 
    ? `conic-gradient(${gradientParts.join(', ')})` 
    : 'conic-gradient(#333 0deg 360deg)';
  
  return (
    <div className="simple-pie-chart">
      <div className="pie" style={{ background: gradient }}>
        <div className="pie-center">
          <span className="pie-total">{total > 1000 ? formatCurrency(total) : total}</span>
        </div>
      </div>
      <div className="pie-legend">
        {segments.filter(s => s.percentage > 0).map((seg, index) => (
          <div key={index} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: seg.color }} />
            <span className="legend-name">{seg[nameKey]}</span>
            <span className="legend-value">{seg.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Лінійний графік (спрощений)
const SimpleLineChart = ({ data, lines, nameKey }) => {
  const allValues = lines.flatMap(l => data.map(d => d[l.dataKey] || 0));
  const maxValue = Math.max(...allValues, 1);
  
  return (
    <div className="simple-line-chart">
      <div className="line-chart-area">
        {lines.map((line, li) => (
          <svg key={li} className="line-svg" viewBox={`0 0 ${data.length * 60} 200`} preserveAspectRatio="none">
            <path
              d={data.map((d, i) => {
                const x = i * 60 + 30;
                const y = 200 - ((d[line.dataKey] || 0) / maxValue) * 180;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}
              fill="none"
              stroke={line.color}
              strokeWidth="3"
            />
            {data.map((d, i) => (
              <circle
                key={i}
                cx={i * 60 + 30}
                cy={200 - ((d[line.dataKey] || 0) / maxValue) * 180}
                r="5"
                fill={line.color}
              />
            ))}
          </svg>
        ))}
        <div className="line-labels">
          {data.map((d, i) => (
            <div key={i} className="line-label">{d[nameKey]}</div>
          ))}
        </div>
      </div>
      <div className="line-legend">
        {lines.map((line, i) => (
          <div key={i} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: line.color }} />
            <span className="legend-name">{line.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function AnalyticsDashboard({ user }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Фільтри
  const [filters, setFilters] = useState({
    year: new Date().getFullYear(),
    region: ''
  });

  // Завантаження даних
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [tasksRes, regionsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tasks/filter?showAll=true`, { headers }),
        fetch(`${API_BASE_URL}/regions`, { headers })
      ]);
      
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.tasks || data);
      }
      
      if (regionsRes.ok) {
        const data = await regionsRes.json();
        setRegions(data.map(r => r.name || r));
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
    } finally {
      setLoading(false);
    }
  };

  // Фільтрація даних
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filters.region && task.serviceRegion !== filters.region) return false;
      
      const taskDate = task.date || task.requestDate;
      if (taskDate) {
        const taskYear = new Date(taskDate).getFullYear();
        if (taskYear !== filters.year) return false;
      }
      
      if (user?.region && user.region !== 'Україна' && task.serviceRegion !== user.region) {
        return false;
      }
      
      return true;
    });
  }, [tasks, filters, user]);

  // KPI Показники
  const kpiData = useMemo(() => {
    const completed = filteredTasks.filter(t => t.status === 'Виконано');
    const totalRevenue = completed.reduce((sum, t) => sum + (parseFloat(t.serviceTotal) || 0), 0);
    const totalWorkPrice = completed.reduce((sum, t) => sum + (parseFloat(t.workPrice) || 0), 0);
    const avgTaskValue = completed.length > 0 ? totalRevenue / completed.length : 0;
    
    const approvedByAll = completed.filter(t => 
      t.approvedByWarehouse === 'Підтверджено' && t.approvedByAccountant === 'Підтверджено'
    ).length;
    
    const conversionRate = filteredTasks.length > 0 
      ? (completed.length / filteredTasks.length) * 100 
      : 0;

    return {
      totalTasks: filteredTasks.length,
      completedTasks: completed.length,
      totalRevenue,
      totalWorkPrice,
      avgTaskValue,
      approvedByAll,
      conversionRate
    };
  }, [filteredTasks]);

  // Дані по місяцях
  const monthlyData = useMemo(() => {
    const months = {};
    
    for (let i = 1; i <= 12; i++) {
      months[i] = {
        month: getMonthName(i),
        monthNum: i,
        tasks: 0,
        completed: 0,
        revenue: 0,
        workPrice: 0
      };
    }
    
    filteredTasks.forEach(task => {
      const date = task.date || task.requestDate;
      if (!date) return;
      
      const month = new Date(date).getMonth() + 1;
      if (months[month]) {
        months[month].tasks++;
        if (task.status === 'Виконано') {
          months[month].completed++;
          months[month].revenue += parseFloat(task.serviceTotal) || 0;
          months[month].workPrice += parseFloat(task.workPrice) || 0;
        }
      }
    });
    
    return Object.values(months);
  }, [filteredTasks]);

  // Статистика по статусах
  const statusData = useMemo(() => {
    const statuses = {};
    
    filteredTasks.forEach(task => {
      const status = task.status || 'Невідомо';
      if (!statuses[status]) {
        statuses[status] = { name: status, value: 0, revenue: 0 };
      }
      statuses[status].value++;
      statuses[status].revenue += parseFloat(task.serviceTotal) || 0;
    });
    
    return Object.values(statuses);
  }, [filteredTasks]);

  // Статистика по регіонах
  const regionData = useMemo(() => {
    const regionsMap = {};
    
    filteredTasks.forEach(task => {
      const region = task.serviceRegion || 'Не вказано';
      if (!regionsMap[region]) {
        regionsMap[region] = { name: region, tasks: 0, revenue: 0, completed: 0 };
      }
      regionsMap[region].tasks++;
      if (task.status === 'Виконано') {
        regionsMap[region].completed++;
        regionsMap[region].revenue += parseFloat(task.serviceTotal) || 0;
      }
    });
    
    return Object.values(regionsMap).sort((a, b) => b.revenue - a.revenue);
  }, [filteredTasks]);

  // Топ клієнтів
  const topClients = useMemo(() => {
    const clients = {};
    
    filteredTasks.forEach(task => {
      const client = task.client || 'Невідомий';
      if (!clients[client]) {
        clients[client] = { name: client, tasks: 0, revenue: 0 };
      }
      clients[client].tasks++;
      if (task.status === 'Виконано') {
        clients[client].revenue += parseFloat(task.serviceTotal) || 0;
      }
    });
    
    return Object.values(clients)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredTasks]);

  // Статистика по інженерах
  const engineerData = useMemo(() => {
    const engineers = {};
    
    filteredTasks.filter(t => t.status === 'Виконано').forEach(task => {
      [task.engineer1, task.engineer2].filter(Boolean).forEach(eng => {
        if (!engineers[eng]) {
          engineers[eng] = { name: eng, tasks: 0, revenue: 0 };
        }
        engineers[eng].tasks++;
        const divisor = task.engineer1 && task.engineer2 ? 2 : 1;
        engineers[eng].revenue += (parseFloat(task.serviceTotal) || 0) / divisor;
      });
    });
    
    return Object.values(engineers).sort((a, b) => b.tasks - a.tasks).slice(0, 10);
  }, [filteredTasks]);

  // Типи оплати
  const paymentTypeData = useMemo(() => {
    const types = {};
    
    filteredTasks.filter(t => t.status === 'Виконано').forEach(task => {
      const type = task.paymentType || 'Не вказано';
      if (!types[type]) {
        types[type] = { name: type, value: 0, revenue: 0 };
      }
      types[type].value++;
      types[type].revenue += parseFloat(task.serviceTotal) || 0;
    });
    
    return Object.values(types);
  }, [filteredTasks]);

  if (loading) {
    return <div className="analytics-loading">⏳ Завантаження аналітики...</div>;
  }

  return (
    <div className="analytics-dashboard">
      {/* Заголовок */}
      <div className="analytics-header">
        <h2>📈 Аналітика та статистика</h2>
        <div className="header-filters">
          <select 
            value={filters.year} 
            onChange={e => setFilters(prev => ({ ...prev, year: parseInt(e.target.value) }))}
          >
            {[2023, 2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select 
            value={filters.region} 
            onChange={e => setFilters(prev => ({ ...prev, region: e.target.value }))}
            disabled={user?.region && user.region !== 'Україна'}
          >
            <option value="">Всі регіони</option>
            {regions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button className="btn-refresh" onClick={loadData}>🔄 Оновити</button>
        </div>
      </div>

      {/* Вкладки */}
      <div className="analytics-tabs">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Огляд
        </button>
        <button 
          className={`tab-btn ${activeTab === 'trends' ? 'active' : ''}`}
          onClick={() => setActiveTab('trends')}
        >
          📈 Тренди
        </button>
        <button 
          className={`tab-btn ${activeTab === 'regions' ? 'active' : ''}`}
          onClick={() => setActiveTab('regions')}
        >
          🌍 Регіони
        </button>
        <button 
          className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => setActiveTab('team')}
        >
          👥 Команда
        </button>
        <button 
          className={`tab-btn ${activeTab === 'clients' ? 'active' : ''}`}
          onClick={() => setActiveTab('clients')}
        >
          🏢 Клієнти
        </button>
      </div>

      {/* ОГЛЯД */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          {/* KPI картки */}
          <div className="kpi-grid">
            <div className="kpi-card blue">
              <div className="kpi-icon">📋</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.totalTasks}</div>
                <div className="kpi-label">Всього заявок</div>
              </div>
            </div>
            <div className="kpi-card green">
              <div className="kpi-icon">✅</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.completedTasks}</div>
                <div className="kpi-label">Виконано</div>
              </div>
            </div>
            <div className="kpi-card gold">
              <div className="kpi-icon">💰</div>
              <div className="kpi-info">
                <div className="kpi-value">{formatCurrency(kpiData.totalRevenue)}</div>
                <div className="kpi-label">Загальний дохід</div>
              </div>
            </div>
            <div className="kpi-card purple">
              <div className="kpi-icon">📊</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.conversionRate.toFixed(1)}%</div>
                <div className="kpi-label">Конверсія</div>
              </div>
            </div>
            <div className="kpi-card orange">
              <div className="kpi-icon">⭐</div>
              <div className="kpi-info">
                <div className="kpi-value">{formatCurrency(kpiData.avgTaskValue)}</div>
                <div className="kpi-label">Середній чек</div>
              </div>
            </div>
            <div className="kpi-card teal">
              <div className="kpi-icon">🔒</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.approvedByAll}</div>
                <div className="kpi-label">Підтверджено</div>
              </div>
            </div>
          </div>

          {/* Графіки */}
          <div className="charts-row">
            <div className="chart-card">
              <h3>📊 Розподіл по статусах</h3>
              <SimplePieChart data={statusData} dataKey="value" nameKey="name" />
            </div>
            <div className="chart-card">
              <h3>💳 Типи оплати</h3>
              <SimplePieChart data={paymentTypeData} dataKey="revenue" nameKey="name" />
            </div>
          </div>
        </div>
      )}

      {/* ТРЕНДИ */}
      {activeTab === 'trends' && (
        <div className="tab-content">
          <div className="chart-card full-width">
            <h3>📈 Динаміка доходу по місяцях</h3>
            <SimpleLineChart 
              data={monthlyData} 
              nameKey="month"
              lines={[
                { dataKey: 'revenue', name: 'Загальний дохід', color: '#4CAF50' },
                { dataKey: 'workPrice', name: 'Вартість робіт', color: '#2196F3' }
              ]}
            />
          </div>
          
          <div className="chart-card full-width">
            <h3>📊 Заявки по місяцях</h3>
            <SimpleBarChart data={monthlyData} dataKey="tasks" nameKey="month" color="#8884d8" />
          </div>
          
          <div className="chart-card full-width">
            <h3>✅ Виконані заявки по місяцях</h3>
            <SimpleBarChart data={monthlyData} dataKey="completed" nameKey="month" color="#4CAF50" />
          </div>
        </div>
      )}

      {/* РЕГІОНИ */}
      {activeTab === 'regions' && (
        <div className="tab-content">
          <div className="chart-card full-width">
            <h3>🌍 Дохід по регіонах</h3>
            <SimpleBarChart data={regionData} dataKey="revenue" nameKey="name" horizontal={true} />
          </div>
          
          <div className="charts-row">
            <div className="chart-card">
              <h3>📊 Заявки по регіонах</h3>
              <SimplePieChart data={regionData} dataKey="tasks" nameKey="name" />
            </div>
            <div className="chart-card">
              <h3>💰 Розподіл доходу</h3>
              <SimplePieChart data={regionData.filter(r => r.revenue > 0)} dataKey="revenue" nameKey="name" />
            </div>
          </div>
        </div>
      )}

      {/* КОМАНДА */}
      {activeTab === 'team' && (
        <div className="tab-content">
          <div className="chart-card full-width">
            <h3>👥 Топ-10 інженерів по кількості завдань</h3>
            <SimpleBarChart data={engineerData} dataKey="tasks" nameKey="name" horizontal={true} />
          </div>
          
          <div className="chart-card full-width">
            <h3>💰 Дохід по інженерах</h3>
            <SimpleBarChart data={engineerData} dataKey="revenue" nameKey="name" horizontal={true} />
          </div>

          <div className="data-table-card">
            <h3>📋 Детальна статистика інженерів</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Інженер</th>
                  <th>Виконано</th>
                  <th>Дохід</th>
                  <th>Сер. чек</th>
                </tr>
              </thead>
              <tbody>
                {engineerData.map((eng, i) => (
                  <tr key={eng.name}>
                    <td>{i + 1}</td>
                    <td>{eng.name}</td>
                    <td>{eng.tasks}</td>
                    <td>{formatCurrency(eng.revenue)}</td>
                    <td>{formatCurrency(eng.tasks > 0 ? eng.revenue / eng.tasks : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* КЛІЄНТИ */}
      {activeTab === 'clients' && (
        <div className="tab-content">
          <div className="chart-card full-width">
            <h3>🏢 Топ-10 клієнтів по доходу</h3>
            <SimpleBarChart data={topClients} dataKey="revenue" nameKey="name" horizontal={true} />
          </div>

          <div className="data-table-card">
            <h3>📋 Детальна статистика клієнтів</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Клієнт</th>
                  <th>Заявок</th>
                  <th>Дохід</th>
                  <th>Сер. чек</th>
                </tr>
              </thead>
              <tbody>
                {topClients.map((client, i) => (
                  <tr key={client.name}>
                    <td>{i + 1}</td>
                    <td>{client.name}</td>
                    <td>{client.tasks}</td>
                    <td>{formatCurrency(client.revenue)}</td>
                    <td>{formatCurrency(client.tasks > 0 ? client.revenue / client.tasks : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
