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
  const [users, setUsers] = useState([]);
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
        const usersData = await usersRes.json();
        // Фільтруємо тільки активних користувачів (не звільнених)
        const activeUsers = usersData.filter(u => !u.dismissed);
        setUsers(activeUsers);
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

  // Генерація рекомендацій
  const recommendations = useMemo(() => {
    // Функція для перевірки, чи інженер активний (не звільнений)
    const isEngineerActive = (engineerName) => {
      if (!engineerName || !users.length) return true; // Якщо немає даних, припускаємо активний
      
      // Перевіряємо по login (якщо engineerName - це login)
      const userByLogin = users.find(u => u.login === engineerName);
      if (userByLogin) return !userByLogin.dismissed;
      
      // Перевіряємо по імені (якщо engineerName - це ім'я)
      const userByName = users.find(u => {
        const userName = (u.name || '').toLowerCase().trim();
        const engineerNameLower = engineerName.toLowerCase().trim();
        // Точне співпадіння або часткове
        return userName === engineerNameLower || 
               userName.includes(engineerNameLower) ||
               engineerNameLower.includes(userName);
      });
      
      // Якщо знайдено користувача, перевіряємо статус
      if (userByName) return !userByName.dismissed;
      
      // Якщо не знайдено в списку користувачів, припускаємо активний
      // (може бути зовнішній інженер або старий запис)
      return true;
    };

    const recs = [];
    
    // 1. Аналіз конверсії
    if (kpiData.conversionRate < 70 && filteredTasks.length > 10) {
      recs.push({
        category: 'Загальні',
        priority: 'high',
        icon: '📉',
        title: 'Низька конверсія заявок',
        description: `Конверсія становить ${kpiData.conversionRate.toFixed(1)}%, що нижче рекомендованого рівня 70%`,
        action: 'Проаналізуйте причини незавершених заявок та впровадьте систему контролю якості',
        impact: 'Потенційне збільшення доходу на ' + formatCurrency(kpiData.totalRevenue * 0.3),
        metrics: {
          current: `${kpiData.conversionRate.toFixed(1)}%`,
          target: '70%+',
          improvement: `+${(70 - kpiData.conversionRate).toFixed(1)}%`
        }
      });
    }

    // 2. Аналіз часу виконання
    if (parseFloat(kpiData.avgCompletionTime) > 7) {
      recs.push({
        category: 'Продуктивність',
        priority: 'high',
        icon: '⏱️',
        title: 'Тривалий час виконання заявок',
        description: `Середній час виконання становить ${kpiData.avgCompletionTime} днів, що перевищує оптимальний рівень`,
        action: 'Оптимізуйте процеси обробки заявок, впровадьте пріоритизацію термінових заявок',
        impact: 'Зменшення часу виконання на 20% може збільшити кількість оброблених заявок',
        metrics: {
          current: `${kpiData.avgCompletionTime} днів`,
          target: '< 5 днів',
          improvement: `-${(parseFloat(kpiData.avgCompletionTime) - 5).toFixed(1)} днів`
        }
      });
    }

    // 3. Аналіз часу підтвердження
    if (parseFloat(kpiData.avgApprovalTime) > 3) {
      recs.push({
        category: 'Процеси',
        priority: 'medium',
        icon: '⚡',
        title: 'Повільне підтвердження заявок',
        description: `Середній час підтвердження становить ${kpiData.avgApprovalTime} днів після виконання`,
        action: 'Автоматизуйте процес підтвердження, впровадьте систему нагадувань для бухгалтерії',
        impact: 'Прискорення обігу коштів та покращення cash flow',
        metrics: {
          current: `${kpiData.avgApprovalTime} днів`,
          target: '< 2 дні',
          improvement: `-${(parseFloat(kpiData.avgApprovalTime) - 2).toFixed(1)} днів`
        }
      });
    }

    // 4. Аналіз регіонів - найслабший регіон
    if (regionData.length > 1) {
      const weakestRegion = regionData[regionData.length - 1];
      const avgRevenue = regionData.reduce((sum, r) => sum + r.revenue, 0) / regionData.length;
      
      if (weakestRegion.revenue < avgRevenue * 0.5 && weakestRegion.revenue > 0) {
        recs.push({
          category: 'Регіони',
          priority: 'high',
          icon: '🌍',
          title: `Потенціал для покращення: ${weakestRegion.name}`,
          description: `Регіон має дохід ${formatCurrency(weakestRegion.revenue)}, що значно нижче середнього`,
          action: `Проведіть аналіз причин низької продуктивності в регіоні ${weakestRegion.name}, розгляньте додаткову підтримку або навчання`,
          impact: `Потенційне збільшення доходу на ${formatCurrency(avgRevenue - weakestRegion.revenue)} при вирівнюванні показників`,
          metrics: {
            current: formatCurrency(weakestRegion.revenue),
            target: formatCurrency(avgRevenue),
            improvement: `+${((avgRevenue - weakestRegion.revenue) / weakestRegion.revenue * 100).toFixed(0)}%`
          }
        });
      }
    }

    // 5. Аналіз інженерів - найменш продуктивні
    if (engineerData.length > 3) {
      const avgTasks = engineerData.reduce((sum, e) => sum + e.tasks, 0) / engineerData.length;
      
      // Фільтруємо тільки активних інженерів (виключаємо звільнених)
      const activeEngineers = engineerData.filter(e => isEngineerActive(e.name));
      const lowPerformers = activeEngineers.filter(e => e.tasks < avgTasks * 0.6);
      
      if (lowPerformers.length > 0) {
        recs.push({
          category: 'Команда',
          priority: 'medium',
          icon: '👥',
          title: 'Інженери потребують підтримки',
          description: `${lowPerformers.length} інженер(ів) мають продуктивність нижче середньої`,
          action: `Організуйте навчання або менторинг для: ${lowPerformers.slice(0, 3).map(e => e.name).join(', ')}`,
          impact: 'Підвищення продуктивності команди та збільшення загального доходу',
          metrics: {
            current: `${lowPerformers.length} інженерів`,
            target: 'Середня продуктивність',
            improvement: `+${((avgTasks - (lowPerformers[0]?.tasks || 0)) / (lowPerformers[0]?.tasks || 1) * 100).toFixed(0)}%`
          }
        });
      }
    }

    // 6. Аналіз типів робіт - найдовші
    if (workTypeData.length > 0) {
      const longestWork = workTypeData
        .filter(w => parseFloat(w.avgTime) > 10)
        .sort((a, b) => parseFloat(b.avgTime) - parseFloat(a.avgTime))[0];
      
      if (longestWork) {
        recs.push({
          category: 'Продуктивність',
          priority: 'medium',
          icon: '🔧',
          title: `Оптимізація типу робіт: ${longestWork.name}`,
          description: `Середній час виконання "${longestWork.name}" становить ${longestWork.avgTime} днів`,
          action: 'Проаналізуйте процес виконання цього типу робіт, виявіть вузькі місця та оптимізуйте',
          impact: `Зменшення часу на ${(parseFloat(longestWork.avgTime) - 5).toFixed(1)} днів може збільшити пропускну здатність`,
          metrics: {
            current: `${longestWork.avgTime} днів`,
            target: '< 5 днів',
            improvement: `-${(parseFloat(longestWork.avgTime) - 5).toFixed(1)} днів`
          }
        });
      }
    }

    // 7. Аналіз клієнтів - можливості для зростання
    if (topClients.length > 0) {
      const topClient = topClients[0];
      const avgClientRevenue = topClients.reduce((sum, c) => sum + c.revenue, 0) / topClients.length;
      
      if (topClient.revenue > avgClientRevenue * 2) {
        recs.push({
          category: 'Клієнти',
          priority: 'low',
          icon: '🏢',
          title: 'Розширення роботи з ключовими клієнтами',
          description: `Клієнт "${topClient.name}" генерує ${formatCurrency(topClient.revenue)} - значно більше середнього`,
          action: `Розробіть індивідуальну програму лояльності для "${topClient.name}", запропонуйте додаткові послуги`,
          impact: `Потенційне збільшення доходу від ключового клієнта на 15-20%`,
          metrics: {
            current: formatCurrency(topClient.revenue),
            target: formatCurrency(topClient.revenue * 1.2),
            improvement: '+20%'
          }
        });
      }
    }

    // 8. Аналіз відхилених заявок
    if (kpiData.rejectedTasks > 0) {
      const rejectionRate = (kpiData.rejectedTasks / filteredTasks.length) * 100;
      if (rejectionRate > 5) {
        recs.push({
          category: 'Якість',
          priority: 'high',
          icon: '❌',
          title: 'Висока кількість відхилених заявок',
          description: `${kpiData.rejectedTasks} заявок було відхилено (${rejectionRate.toFixed(1)}% від загальної кількості)`,
          action: 'Проведіть аналіз причин відхилення, впровадьте систему перевірки перед відправкою на затвердження',
          impact: 'Зменшення відхилень може зберегти дохід та покращити репутацію',
          metrics: {
            current: `${rejectionRate.toFixed(1)}%`,
            target: '< 3%',
            improvement: `-${(rejectionRate - 3).toFixed(1)}%`
          }
        });
      }
    }

    // 9. Аналіз матеріалів - оптимізація витрат
    const materialsToRevenueRatio = kpiData.totalMaterials / (kpiData.totalRevenue || 1);
    if (materialsToRevenueRatio > 0.4) {
      recs.push({
        category: 'Витрати',
        priority: 'medium',
        icon: '📦',
        title: 'Високі витрати на матеріали',
        description: `Витрати на матеріали становлять ${(materialsToRevenueRatio * 100).toFixed(1)}% від доходу`,
        action: 'Оптимізуйте закупівлю матеріалів, розгляньте оптові закупівлі або альтернативні постачальники',
        impact: `Зменшення витрат на 10% може зберегти ${formatCurrency(kpiData.totalMaterials * 0.1)}`,
        metrics: {
          current: `${(materialsToRevenueRatio * 100).toFixed(1)}%`,
          target: '< 35%',
          improvement: `-${((materialsToRevenueRatio - 0.35) * 100).toFixed(1)}%`
        }
      });
    }

    // 10. Прогноз та цілі
    if (monthlyData.length > 0) {
      const last3Months = monthlyData.slice(-3);
      const avgLast3Revenue = last3Months.reduce((sum, m) => sum + m.revenue, 0) / 3;
      const projectedYearRevenue = avgLast3Revenue * 12;
      
      if (projectedYearRevenue > kpiData.totalRevenue * 1.1) {
        recs.push({
          category: 'Прогноз',
          priority: 'low',
          icon: '📈',
          title: 'Позитивна динаміка доходу',
          description: `За останні 3 місяці середній дохід становить ${formatCurrency(avgLast3Revenue)}/міс`,
          action: 'Підтримайте поточну динаміку, розгляньте можливість розширення команди для обробки зростаючого навантаження',
          impact: `Прогнозований річний дохід: ${formatCurrency(projectedYearRevenue)}`,
          metrics: {
            current: formatCurrency(kpiData.totalRevenue),
            target: formatCurrency(projectedYearRevenue),
            improvement: `+${((projectedYearRevenue - kpiData.totalRevenue) / kpiData.totalRevenue * 100).toFixed(0)}%`
          }
        });
      }
    }

    // Сортування за пріоритетом
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return recs.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
  }, [kpiData, filteredTasks, regionData, engineerData, workTypeData, topClients, monthlyData, users]);

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
        <button 
          className={`tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommendations')}
        >
          💡 Рекомендації
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
            <div className="chart-card" title="Візуалізація розподілу заявок за статусами. Показує кількість заявок для кожного статусу (Заявка, В роботі, Виконано, Заблоковано)">
              <h3>📊 Розподіл по статусах</h3>
              <SimplePieChart data={statusData} dataKey="value" nameKey="name" />
            </div>
            <div className="chart-card" title="Візуалізація розподілу доходу за типами оплати. Показує загальний дохід для кожного типу оплати (готівка, безготівка, картка тощо)">
              <h3>💳 Типи оплати</h3>
              <SimplePieChart data={paymentTypeData} dataKey="revenue" nameKey="name" />
            </div>
          </div>
        </div>
      )}

      {/* ТРЕНДИ */}
      {activeTab === 'trends' && (
        <div className="tab-content">
          <div className="chart-card full-width" title="Лінійний графік, що показує динаміку зміни доходу та вартості робіт по місяцях обраного року. Зелена лінія - загальний дохід (сума всіх виконаних заявок), синя лінія - вартість робіт">
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
          
          <div className="chart-card full-width" title="Стовпчастий графік, що показує загальну кількість заявок (всіх статусів) по кожному місяцю обраного року">
            <h3>📊 Заявки по місяцях</h3>
            <SimpleBarChart data={monthlyData} dataKey="tasks" nameKey="month" color="#8884d8" />
          </div>
          
          <div className="chart-card full-width" title="Стовпчастий графік, що показує кількість виконаних заявок (статус 'Виконано') по кожному місяцю обраного року">
            <h3>✅ Виконані заявки по місяцях</h3>
            <SimpleBarChart data={monthlyData} dataKey="completed" nameKey="month" color="#4CAF50" />
          </div>
        </div>
      )}

      {/* РЕГІОНИ */}
      {activeTab === 'regions' && (
        <div className="tab-content">
          <div className="chart-card full-width" title="Горизонтальний стовпчастий графік, що показує загальний дохід від виконаних заявок для кожного регіону. Дані відсортовані за величиною доходу">
            <h3>🌍 Дохід по регіонах</h3>
            <SimpleBarChart data={regionData} dataKey="revenue" nameKey="name" horizontal={true} />
          </div>
          
          <div className="charts-row">
            <div className="chart-card" title="Кругова діаграма, що показує розподіл загальної кількості заявок (всіх статусів) між регіонами. Відображає відсоток заявок для кожного регіону">
              <h3>📊 Заявки по регіонах</h3>
              <SimplePieChart data={regionData} dataKey="tasks" nameKey="name" />
            </div>
            <div className="chart-card" title="Кругова діаграма, що показує розподіл загального доходу від виконаних заявок між регіонами. Відображає відсоток доходу для кожного регіону з доходом більше нуля">
              <h3>💰 Розподіл доходу</h3>
              <SimplePieChart data={regionData.filter(r => r.revenue > 0)} dataKey="revenue" nameKey="name" />
            </div>
          </div>
        </div>
      )}

      {/* КОМАНДА */}
      {activeTab === 'team' && (
        <div className="tab-content">
          <div className="chart-card full-width" title="Горизонтальний стовпчастий графік, що показує топ-10 інженерів за кількістю виконаних завдань. Для заявок з двома інженерами кожен отримує 0.5 завдання">
            <h3>👥 Топ-10 інженерів по кількості завдань</h3>
            <SimpleBarChart data={engineerData} dataKey="tasks" nameKey="name" horizontal={true} />
          </div>
          
          <div className="chart-card full-width" title="Горизонтальний стовпчастий графік, що показує дохід, згенерований кожним інженером. Для заявок з двома інженерами дохід ділиться порівну між ними">
            <h3>💰 Дохід по інженерах</h3>
            <SimpleBarChart data={engineerData} dataKey="revenue" nameKey="name" horizontal={true} />
          </div>

          <div className="data-table-card" title="Детальна таблиця зі статистикою по кожному інженеру: кількість виконаних завдань, загальний дохід та середній чек (дохід поділений на кількість завдань)">
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
          <div className="chart-card full-width" title="Горизонтальний стовпчастий графік, що показує топ-10 клієнтів за загальним доходом від виконаних заявок. Дані відсортовані за величиною доходу">
            <h3>🏢 Топ-10 клієнтів по доходу</h3>
            <SimpleBarChart data={topClients} dataKey="revenue" nameKey="name" horizontal={true} />
          </div>

          <div className="data-table-card" title="Детальна таблиця зі статистикою по кожному клієнту: загальна кількість заявок, загальний дохід від виконаних заявок та середній чек (дохід поділений на кількість заявок)">
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
            <div className="chart-card" title="Горизонтальний стовпчастий графік, що показує середній час виконання (в днях) для топ-10 типів робіт. Час розраховується як середнє значення різниці між датою створення та датою виконання заявок">
              <h3>⏱️ Середній час виконання по типах робіт</h3>
              <SimpleBarChart 
                data={workTypeData.slice(0, 10)} 
                dataKey="avgTime" 
                nameKey="name" 
                horizontal={true}
                showValues={true}
              />
            </div>
            <div className="chart-card" title="Кругова діаграма, що показує розподіл кількості виконаних заявок між топ-8 типами робіт. Відображає відсоток заявок для кожного типу робіт">
              <h3>📊 Кількість заявок по типах робіт</h3>
              <SimplePieChart data={workTypeData.slice(0, 8)} dataKey="tasks" nameKey="name" />
            </div>
          </div>
          
          <div className="data-table-card" title="Детальна таблиця зі статистикою по кожному типу робіт: кількість виконаних заявок, загальний дохід, середній чек та середній час виконання в днях">
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
          <div className="chart-card full-width" title="Горизонтальний стовпчастий графік, що показує топ-15 типів обладнання за кількістю виконаних заявок. Дані відсортовані за кількістю заявок">
            <h3>🔧 Топ-15 типів обладнання по кількості заявок</h3>
            <SimpleBarChart data={equipmentData} dataKey="tasks" nameKey="name" horizontal={true} />
          </div>
          
          <div className="chart-card full-width" title="Горизонтальний стовпчастий графік, що показує загальний дохід від виконаних заявок для кожного типу обладнання">
            <h3>💰 Дохід по типах обладнання</h3>
            <SimpleBarChart data={equipmentData} dataKey="revenue" nameKey="name" horizontal={true} />
          </div>

          <div className="data-table-card" title="Детальна таблиця зі статистикою по кожному типу обладнання: кількість виконаних заявок, загальний дохід та середня вартість однієї заявки (дохід поділений на кількість заявок)">
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
            <div className="kpi-card blue" title="Кількість заявок (всіх статусів) за поточний рік порівняно з попереднім роком. Відображає відсоток зміни (↑ зростання, ↓ зниження)">
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
            <div className="kpi-card gold" title="Загальний дохід від виконаних заявок за поточний рік порівняно з попереднім роком. Відображає відсоток зміни доходу (↑ зростання, ↓ зниження)">
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
            <div className="kpi-card green" title="Кількість виконаних заявок (статус 'Виконано') за поточний рік порівняно з попереднім роком. Показує абсолютну різницю">
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
            <div className="chart-card" title="Стовпчастий графік, що порівнює загальну кількість заявок (всіх статусів) між поточним та попереднім роком">
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
            <div className="chart-card" title="Стовпчастий графік, що порівнює загальний дохід від виконаних заявок між поточним та попереднім роком">
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

      {/* РЕКОМЕНДАЦІЇ */}
      {activeTab === 'recommendations' && (
        <div className="tab-content">
          <div className="recommendations-header">
            <h3>💡 Інтелектуальні рекомендації для покращення показників</h3>
            <p>На основі аналізу ваших даних система пропонує наступні рекомендації:</p>
          </div>

          {recommendations.length === 0 ? (
            <div className="no-recommendations">
              <div className="success-icon">✅</div>
              <h4>Відмінні показники!</h4>
              <p>Всі ключові метрики знаходяться в оптимальному діапазоні. Продовжуйте підтримувати високий рівень продуктивності.</p>
            </div>
          ) : (
            <div className="recommendations-grid">
              {recommendations.map((rec, index) => (
                <div key={index} className={`recommendation-card priority-${rec.priority}`}>
                  <div className="recommendation-header">
                    <span className="rec-icon">{rec.icon}</span>
                    <div className="rec-title-section">
                      <h4>{rec.title}</h4>
                      <span className={`rec-category category-${rec.category.toLowerCase().replace(/\s+/g, '-')}`}>
                        {rec.category}
                      </span>
                    </div>
                    <span className={`priority-badge priority-${rec.priority}`}>
                      {rec.priority === 'high' ? '🔴 Високий' : rec.priority === 'medium' ? '🟡 Середній' : '🟢 Низький'}
                    </span>
                  </div>
                  
                  <div className="recommendation-body">
                    <p className="rec-description">{rec.description}</p>
                    
                    <div className="rec-action">
                      <strong>Рекомендована дія:</strong>
                      <p>{rec.action}</p>
                    </div>
                    
                    <div className="rec-impact">
                      <strong>Потенційний ефект:</strong>
                      <p>{rec.impact}</p>
                    </div>
                    
                    <div className="rec-metrics">
                      <div className="metric-item">
                        <span className="metric-label">Поточне значення:</span>
                        <span className="metric-value current">{rec.metrics.current}</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">Цільове значення:</span>
                        <span className="metric-value target">{rec.metrics.target}</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">Потенційне покращення:</span>
                        <span className="metric-value improvement">{rec.metrics.improvement}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
