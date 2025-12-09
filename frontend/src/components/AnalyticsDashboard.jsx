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
    month: '',
    region: '',
    period: 'year' // year, month, quarter
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
        const date = new Date(taskDate);
        const taskYear = date.getFullYear();
        const taskMonth = date.getMonth() + 1;
        const taskQuarter = Math.floor(taskMonth / 3) + 1;
        
        if (taskYear !== filters.year) return false;
        
        if (filters.period === 'month' && filters.month && taskMonth !== parseInt(filters.month)) {
          return false;
        }
        
        if (filters.period === 'quarter') {
          const currentQuarter = Math.floor((new Date().getMonth() + 1) / 3) + 1;
          if (taskQuarter !== currentQuarter) return false;
        }
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
    const totalMaterials = completed.reduce((sum, t) => {
      const materials = (parseFloat(t.oilTotal) || 0) + (parseFloat(t.filterSum) || 0) + 
                       (parseFloat(t.fuelFilterSum) || 0) + (parseFloat(t.airFilterSum) || 0) +
                       (parseFloat(t.antifreezeSum) || 0) + (parseFloat(t.otherSum) || 0);
      return sum + materials;
    }, 0);
    const avgTaskValue = completed.length > 0 ? totalRevenue / completed.length : 0;
    
    const approvedByAll = completed.filter(t => 
      t.approvedByWarehouse === 'Підтверджено' && t.approvedByAccountant === 'Підтверджено'
    ).length;
    
    const conversionRate = filteredTasks.length > 0 
      ? (completed.length / filteredTasks.length) * 100 
      : 0;

    // Середній час виконання (від створення до виконання)
    let avgCompletionTime = 0;
    if (completed.length > 0) {
      const times = completed
        .filter(t => t.autoCreatedAt && t.autoCompletedAt)
        .map(t => {
          const created = new Date(t.autoCreatedAt);
          const completed = new Date(t.autoCompletedAt);
          return (completed - created) / (1000 * 60 * 60 * 24); // дні
        });
      if (times.length > 0) {
        avgCompletionTime = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }

    // Швидкість підтвердження (від виконання до підтвердження)
    let avgApprovalTime = 0;
    const approvedTasks = completed.filter(t => 
      t.autoCompletedAt && t.autoAccountantApprovedAt
    );
    if (approvedTasks.length > 0) {
      const times = approvedTasks.map(t => {
        const completed = new Date(t.autoCompletedAt);
        const approved = new Date(t.autoAccountantApprovedAt);
        return (approved - completed) / (1000 * 60 * 60 * 24); // дні
      });
      if (times.length > 0) {
        avgApprovalTime = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }

    // Відхилені заявки
    const rejectedTasks = filteredTasks.filter(t => 
      t.approvedByWarehouse === 'Відмова' || t.approvedByAccountant === 'Відмова'
    ).length;

    // Термінові заявки
    const urgentTasks = filteredTasks.filter(t => t.urgentRequest === true).length;

    return {
      totalTasks: filteredTasks.length,
      completedTasks: completed.length,
      totalRevenue,
      totalWorkPrice,
      totalMaterials,
      avgTaskValue,
      approvedByAll,
      conversionRate,
      avgCompletionTime: avgCompletionTime.toFixed(1),
      avgApprovalTime: avgApprovalTime.toFixed(1),
      rejectedTasks,
      urgentTasks,
      pendingTasks: filteredTasks.filter(t => t.status === 'В роботі' || t.status === 'Заявка').length
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

  // Статистика по типах робіт
  const workTypeData = useMemo(() => {
    const works = {};
    
    filteredTasks.filter(t => t.status === 'Виконано').forEach(task => {
      const work = task.work || 'Не вказано';
      if (!works[work]) {
        works[work] = { name: work, tasks: 0, revenue: 0, avgTime: 0, times: [] };
      }
      works[work].tasks++;
      works[work].revenue += parseFloat(task.serviceTotal) || 0;
      
      if (task.autoCreatedAt && task.autoCompletedAt) {
        const created = new Date(task.autoCreatedAt);
        const completed = new Date(task.autoCompletedAt);
        const days = (completed - created) / (1000 * 60 * 60 * 24);
        works[work].times.push(days);
      }
    });
    
    return Object.values(works).map(w => ({
      ...w,
      avgTime: w.times.length > 0 ? (w.times.reduce((a, b) => a + b, 0) / w.times.length).toFixed(1) : 0
    })).sort((a, b) => b.tasks - a.tasks);
  }, [filteredTasks]);

  // Статистика по обладнанню
  const equipmentData = useMemo(() => {
    const equipment = {};
    
    filteredTasks.filter(t => t.status === 'Виконано').forEach(task => {
      const eq = task.equipment || 'Не вказано';
      if (!equipment[eq]) {
        equipment[eq] = { name: eq, tasks: 0, revenue: 0, avgCost: 0 };
      }
      equipment[eq].tasks++;
      equipment[eq].revenue += parseFloat(task.serviceTotal) || 0;
    });
    
    return Object.values(equipment)
      .map(eq => ({
        ...eq,
        avgCost: eq.tasks > 0 ? eq.revenue / eq.tasks : 0
      }))
      .sort((a, b) => b.tasks - a.tasks)
      .slice(0, 15);
  }, [filteredTasks]);

  // Порівняльна аналітика (попередній період)
  const comparisonData = useMemo(() => {
    const currentYear = filters.year;
    const prevYear = currentYear - 1;
    
    const currentPeriod = filteredTasks.filter(t => {
      const date = t.date || t.requestDate;
      if (!date) return false;
      const year = new Date(date).getFullYear();
      return year === currentYear;
    });
    
    const prevPeriod = tasks.filter(t => {
      const date = t.date || t.requestDate;
      if (!date) return false;
      const year = new Date(date).getFullYear();
      return year === prevYear;
    });
    
    const currentCompleted = currentPeriod.filter(t => t.status === 'Виконано');
    const prevCompleted = prevPeriod.filter(t => t.status === 'Виконано');
    
    const currentRevenue = currentCompleted.reduce((sum, t) => sum + (parseFloat(t.serviceTotal) || 0), 0);
    const prevRevenue = prevCompleted.reduce((sum, t) => sum + (parseFloat(t.serviceTotal) || 0), 0);
    
    const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue * 100) : 0;
    const tasksChange = prevPeriod.length > 0 ? ((currentPeriod.length - prevPeriod.length) / prevPeriod.length * 100) : 0;
    
    return {
      currentYear,
      prevYear,
      currentTasks: currentPeriod.length,
      prevTasks: prevPeriod.length,
      tasksChange: tasksChange.toFixed(1),
      currentRevenue,
      prevRevenue,
      revenueChange: revenueChange.toFixed(1),
      currentCompleted: currentCompleted.length,
      prevCompleted: prevCompleted.length
    };
  }, [filteredTasks, filters.year, tasks]);

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
            value={filters.period} 
            onChange={e => setFilters(prev => ({ ...prev, period: e.target.value }))}
          >
            <option value="year">Рік</option>
            <option value="quarter">Квартал</option>
            <option value="month">Місяць</option>
          </select>
          <select 
            value={filters.year} 
            onChange={e => setFilters(prev => ({ ...prev, year: parseInt(e.target.value) }))}
          >
            {[2023, 2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {filters.period === 'month' && (
            <select 
              value={filters.month} 
              onChange={e => setFilters(prev => ({ ...prev, month: e.target.value }))}
            >
              <option value="">Всі місяці</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>{getMonthName(m)}</option>
              ))}
            </select>
          )}
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
        <button 
          className={`tab-btn ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance')}
        >
          ⚡ Продуктивність
        </button>
        <button 
          className={`tab-btn ${activeTab === 'equipment' ? 'active' : ''}`}
          onClick={() => setActiveTab('equipment')}
        >
          🔧 Обладнання
        </button>
        <button 
          className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          📊 Порівняння
        </button>
      </div>

      {/* ОГЛЯД */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          {/* KPI картки */}
          <div className="kpi-grid">
            <div className="kpi-card blue" title="Загальна кількість заявок з урахуванням обраних фільтрів (рік, регіон)">
              <div className="kpi-icon">📋</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.totalTasks}</div>
                <div className="kpi-label">Всього заявок</div>
              </div>
            </div>
            <div className="kpi-card green" title="Кількість заявок зі статусом 'Виконано'">
              <div className="kpi-icon">✅</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.completedTasks}</div>
                <div className="kpi-label">Виконано</div>
              </div>
            </div>
            <div className="kpi-card gold" title="Сума всіх виконаних заявок. Розраховується як сума загальної суми послуги для всіх заявок зі статусом 'Виконано'">
              <div className="kpi-icon">💰</div>
              <div className="kpi-info">
                <div className="kpi-value">{formatCurrency(kpiData.totalRevenue)}</div>
                <div className="kpi-label">Загальний дохід</div>
              </div>
            </div>
            <div className="kpi-card purple" title="Відсоток виконаних заявок від загальної кількості. Формула: (Виконано / Всього заявок) × 100%">
              <div className="kpi-icon">📊</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.conversionRate.toFixed(1)}%</div>
                <div className="kpi-label">Конверсія</div>
              </div>
            </div>
            <div className="kpi-card orange" title="Середня вартість однієї виконаної заявки. Формула: Загальний дохід / Кількість виконаних заявок">
              <div className="kpi-icon">⭐</div>
              <div className="kpi-info">
                <div className="kpi-value">{formatCurrency(kpiData.avgTaskValue)}</div>
                <div className="kpi-label">Середній чек</div>
              </div>
            </div>
            <div className="kpi-card teal" title="Кількість заявок, які підтверджені і завскладом, і бухгалтером (обидва мають статус 'Підтверджено')">
              <div className="kpi-icon">🔒</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.approvedByAll}</div>
                <div className="kpi-label">Підтверджено</div>
              </div>
            </div>
            <div className="kpi-card cyan" title="Середній час від створення заявки до її виконання. Розраховується як середнє значення різниці між датою створення та датою виконання для всіх виконаних заявок. Результат у днях">
              <div className="kpi-icon">⏱️</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.avgCompletionTime}</div>
                <div className="kpi-label">Сер. час виконання (дні)</div>
              </div>
            </div>
            <div className="kpi-card pink" title="Середній час від виконання заявки до її підтвердження бухгалтером. Розраховується як середнє значення різниці між датою виконання та датою підтвердження бухгалтером. Результат у днях">
              <div className="kpi-icon">⚡</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.avgApprovalTime}</div>
                <div className="kpi-label">Сер. час підтвердження (дні)</div>
              </div>
            </div>
            <div className="kpi-card red" title="Кількість заявок, які були відхилені завскладом або бухгалтером (статус 'Відмова' в одному з полів підтвердження)">
              <div className="kpi-icon">❌</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.rejectedTasks}</div>
                <div className="kpi-label">Відхилено</div>
              </div>
            </div>
            <div className="kpi-card yellow" title="Кількість заявок, позначених як термінові">
              <div className="kpi-icon">🚨</div>
              <div className="kpi-info">
                <div className="kpi-value">{kpiData.urgentTasks}</div>
                <div className="kpi-label">Термінові</div>
              </div>
            </div>
            <div className="kpi-card indigo" title="Загальна сума витрат на матеріали для всіх виконаних заявок. Включає: оливу, масляні фільтри, паливні фільтри, повітряні фільтри, антифриз та інші матеріали">
              <div className="kpi-icon">📦</div>
              <div className="kpi-info">
                <div className="kpi-value">{formatCurrency(kpiData.totalMaterials)}</div>
                <div className="kpi-label">Матеріали</div>
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

      {/* ПРОДУКТИВНІСТЬ */}
      {activeTab === 'performance' && (
        <div className="tab-content">
          <div className="charts-row">
            <div className="chart-card">
              <h3>⏱️ Середній час виконання по типах робіт</h3>
              <SimpleBarChart 
                data={workTypeData.slice(0, 10)} 
                dataKey="avgTime" 
                nameKey="name" 
                horizontal={true}
                showValues={true}
              />
            </div>
            <div className="chart-card">
              <h3>📊 Кількість заявок по типах робіт</h3>
              <SimplePieChart data={workTypeData.slice(0, 8)} dataKey="tasks" nameKey="name" />
            </div>
          </div>
          
          <div className="data-table-card">
            <h3>📋 Детальна статистика по типах робіт</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Тип робіт</th>
                  <th>Виконано</th>
                  <th>Дохід</th>
                  <th>Сер. чек</th>
                  <th>Сер. час (дні)</th>
                </tr>
              </thead>
              <tbody>
                {workTypeData.map((work, i) => (
                  <tr key={work.name}>
                    <td>{i + 1}</td>
                    <td>{work.name}</td>
                    <td>{work.tasks}</td>
                    <td>{formatCurrency(work.revenue)}</td>
                    <td>{formatCurrency(work.tasks > 0 ? work.revenue / work.tasks : 0)}</td>
                    <td>{work.avgTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ОБЛАДНАННЯ */}
      {activeTab === 'equipment' && (
        <div className="tab-content">
          <div className="chart-card full-width">
            <h3>🔧 Топ-15 типів обладнання по кількості заявок</h3>
            <SimpleBarChart data={equipmentData} dataKey="tasks" nameKey="name" horizontal={true} />
          </div>
          
          <div className="chart-card full-width">
            <h3>💰 Дохід по типах обладнання</h3>
            <SimpleBarChart data={equipmentData} dataKey="revenue" nameKey="name" horizontal={true} />
          </div>

          <div className="data-table-card">
            <h3>📋 Детальна статистика по обладнанню</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Тип обладнання</th>
                  <th>Заявок</th>
                  <th>Дохід</th>
                  <th>Сер. вартість</th>
                </tr>
              </thead>
              <tbody>
                {equipmentData.map((eq, i) => (
                  <tr key={eq.name}>
                    <td>{i + 1}</td>
                    <td>{eq.name}</td>
                    <td>{eq.tasks}</td>
                    <td>{formatCurrency(eq.revenue)}</td>
                    <td>{formatCurrency(eq.avgCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ПОРІВНЯННЯ */}
      {activeTab === 'comparison' && (
        <div className="tab-content">
          <div className="kpi-grid">
            <div className="kpi-card blue">
              <div className="kpi-icon">📊</div>
              <div className="kpi-info">
                <div className="kpi-value">{comparisonData.currentTasks}</div>
                <div className="kpi-label">Заявок {comparisonData.currentYear}</div>
                <div className="kpi-change" style={{ 
                  color: parseFloat(comparisonData.tasksChange) >= 0 ? '#4CAF50' : '#f44336' 
                }}>
                  {parseFloat(comparisonData.tasksChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(comparisonData.tasksChange))}% vs {comparisonData.prevYear}
                </div>
              </div>
            </div>
            <div className="kpi-card gold">
              <div className="kpi-icon">💰</div>
              <div className="kpi-info">
                <div className="kpi-value">{formatCurrency(comparisonData.currentRevenue)}</div>
                <div className="kpi-label">Дохід {comparisonData.currentYear}</div>
                <div className="kpi-change" style={{ 
                  color: parseFloat(comparisonData.revenueChange) >= 0 ? '#4CAF50' : '#f44336' 
                }}>
                  {parseFloat(comparisonData.revenueChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(comparisonData.revenueChange))}% vs {comparisonData.prevYear}
                </div>
              </div>
            </div>
            <div className="kpi-card green">
              <div className="kpi-icon">✅</div>
              <div className="kpi-info">
                <div className="kpi-value">{comparisonData.currentCompleted}</div>
                <div className="kpi-label">Виконано {comparisonData.currentYear}</div>
                <div className="kpi-change" style={{ 
                  color: comparisonData.currentCompleted >= comparisonData.prevCompleted ? '#4CAF50' : '#f44336' 
                }}>
                  {comparisonData.currentCompleted >= comparisonData.prevCompleted ? '↑' : '↓'} {comparisonData.prevCompleted} в {comparisonData.prevYear}
                </div>
              </div>
            </div>
          </div>

          <div className="charts-row">
            <div className="chart-card">
              <h3>📊 Порівняння заявок</h3>
              <SimpleBarChart 
                data={[
                  { name: `${comparisonData.prevYear}`, value: comparisonData.prevTasks },
                  { name: `${comparisonData.currentYear}`, value: comparisonData.currentTasks }
                ]} 
                dataKey="value" 
                nameKey="name" 
              />
            </div>
            <div className="chart-card">
              <h3>💰 Порівняння доходу</h3>
              <SimpleBarChart 
                data={[
                  { name: `${comparisonData.prevYear}`, value: comparisonData.prevRevenue },
                  { name: `${comparisonData.currentYear}`, value: comparisonData.currentRevenue }
                ]} 
                dataKey="value" 
                nameKey="name" 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
