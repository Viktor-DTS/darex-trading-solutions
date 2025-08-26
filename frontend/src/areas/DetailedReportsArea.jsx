import React, { useState, useEffect } from 'react';
import { analyticsAPI, formatCurrency, formatPercent, getMonthName } from '../utils/analyticsAPI';
import { regionsAPI } from '../utils/regionsAPI';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, ComposedChart
} from 'recharts';

export default function DetailedReportsArea({ user }) {
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uniqueRegions, setUniqueRegions] = useState([]);
  const [uniqueCompanies, setUniqueCompanies] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filters, setFilters] = useState({
    region: '',
    company: '',
    startYear: new Date().getFullYear(),
    endYear: new Date().getFullYear(),
    startMonth: 1,
    endMonth: 12,
    chartType: 'revenue', // revenue, expenses, profit, comparison
    periodType: 'monthly' // monthly, quarterly, yearly
  });

  // Завантаження даних
  useEffect(() => {
    const loadData = async () => {
      try {
        setDataLoading(true);
        console.log('Завантаження даних для детальної звітності...');
        
        // Завантажуємо унікальні регіони та компанії
        const [uniqueRegionsData, uniqueCompaniesData] = await Promise.all([
          analyticsAPI.getUniqueRegions(),
          analyticsAPI.getUniqueCompanies()
        ]);
        
        setUniqueRegions(uniqueRegionsData);
        setUniqueCompanies(uniqueCompaniesData);
        
        console.log('Дані завантажено');
      } catch (error) {
        console.error('Помилка завантаження даних:', error);
      } finally {
        setDataLoading(false);
      }
    };
    loadData();
  }, []);

  // Завантаження аналітики
  const loadAnalytics = async () => {
    setLoading(true);
    try {
      console.log('[DEBUG] Завантаження детальної аналітики з фільтрами:', filters);
      const data = await analyticsAPI.getFullAnalytics(filters);
      console.log('[DEBUG] Отримані дані детальної аналітики:', data);
      setAnalytics(data);
    } catch (error) {
      console.error('Помилка завантаження детальної аналітики:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [filters]);

  // Розрахунок статистики для графіків
  const calculateChartData = () => {
    const monthlyData = {};
    const categories = {};
    
    analytics.forEach(item => {
      const monthKey = `${item.year}-${String(item.month).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: item.month,
          year: item.year,
          workRevenue: 0,
          materialsRevenue: 0,
          totalRevenue: 0,
          expenses: 0,
          profit: 0,
          profitability: 0,
          expenseBreakdown: {}
        };
      }
      
      // Сумуємо доходи
      monthlyData[monthKey].workRevenue += item.workRevenue || 0;
      monthlyData[monthKey].materialsRevenue += item.materialsRevenue || 0;
      monthlyData[monthKey].totalRevenue += item.revenue || 0;
      monthlyData[monthKey].expenses += item.totalExpenses || 0;
      monthlyData[monthKey].profit += item.profit || 0;
      
      // Розбивка витрат по категоріях
      Object.keys(item.expenses || {}).forEach(category => {
        if (!monthlyData[monthKey].expenseBreakdown[category]) {
          monthlyData[monthKey].expenseBreakdown[category] = 0;
        }
        monthlyData[monthKey].expenseBreakdown[category] += item.expenses[category] || 0;
        
        if (!categories[category]) {
          categories[category] = 0;
        }
        categories[category] += item.expenses[category] || 0;
      });
    });
    
    // Розраховуємо рентабельність
    Object.keys(monthlyData).forEach(monthKey => {
      const data = monthlyData[monthKey];
      data.profitability = data.totalRevenue > 0 ? (data.profit / data.totalRevenue) * 100 : 0;
    });
    
    return {
      monthlyData: Object.values(monthlyData).sort((a, b) => 
        new Date(a.year, a.month - 1) - new Date(b.year, b.month - 1)
      ),
      categories
    };
  };

  const { monthlyData, categories } = calculateChartData();

  // Компонент для графіка доходів
  const RevenueChart = () => {
    const chartData = monthlyData.map(data => ({
      name: getMonthName(data.month),
      'Дохід по роботах': data.workRevenue,
      'Дохід по матеріалам': data.materialsRevenue,
      'Загальний дохід': data.totalRevenue
    }));

    const colors = ['#28a745', '#20c997', '#00bfff'];
    
    return (
      <div style={{
        background: '#1a2636',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3 style={{color: '#fff', marginBottom: '16px'}}>Динаміка доходів по місяцях</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#29506a" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#fff', fontSize: 12 }}
              axisLine={{ stroke: '#29506a' }}
            />
            <YAxis 
              tick={{ fill: '#fff', fontSize: 12 }}
              axisLine={{ stroke: '#29506a' }}
              tickFormatter={(value) => formatCurrency(value)}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: '#22334a',
                border: '1px solid #29506a',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value, name) => [formatCurrency(value), name]}
            />
            <Legend 
              wrapperStyle={{ color: '#fff' }}
            />
            <Bar dataKey="Дохід по роботах" fill="#28a745" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Дохід по матеріалам" fill="#20c997" radius={[4, 4, 0, 0]} />
            <Line 
              type="monotone" 
              dataKey="Загальний дохід" 
              stroke="#00bfff" 
              strokeWidth={3}
              dot={{ fill: '#00bfff', strokeWidth: 2, r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Компонент для графіка витрат
  const ExpensesChart = () => {
    const chartData = monthlyData.map(data => ({
      name: getMonthName(data.month),
      'Витрати': data.expenses
    }));
    
    return (
      <div style={{
        background: '#1a2636',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3 style={{color: '#fff', marginBottom: '16px'}}>Динаміка витрат по місяцях</h3>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#29506a" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#fff', fontSize: 12 }}
              axisLine={{ stroke: '#29506a' }}
            />
            <YAxis 
              tick={{ fill: '#fff', fontSize: 12 }}
              axisLine={{ stroke: '#29506a' }}
              tickFormatter={(value) => formatCurrency(value)}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: '#22334a',
                border: '1px solid #29506a',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value, name) => [formatCurrency(value), name]}
            />
            <Area 
              type="monotone" 
              dataKey="Витрати" 
              stroke="#dc3545" 
              fill="#dc3545"
              fillOpacity={0.3}
              strokeWidth={3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Компонент для графіка прибутку
  const ProfitChart = () => {
    const chartData = monthlyData.map(data => ({
      name: getMonthName(data.month),
      'Прибуток': data.profit,
      'Рентабельність': data.profitability
    }));
    
    return (
      <div style={{
        background: '#1a2636',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3 style={{color: '#fff', marginBottom: '16px'}}>Динаміка прибутку по місяцях</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#29506a" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#fff', fontSize: 12 }}
              axisLine={{ stroke: '#29506a' }}
            />
            <YAxis 
              yAxisId="left"
              tick={{ fill: '#fff', fontSize: 12 }}
              axisLine={{ stroke: '#29506a' }}
              tickFormatter={(value) => formatCurrency(value)}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#fff', fontSize: 12 }}
              axisLine={{ stroke: '#29506a' }}
              tickFormatter={(value) => `${value.toFixed(1)}%`}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: '#22334a',
                border: '1px solid #29506a',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value, name) => [
                name === 'Прибуток' ? formatCurrency(value) : `${value.toFixed(1)}%`, 
                name
              ]}
            />
            <Legend 
              wrapperStyle={{ color: '#fff' }}
            />
            <Bar 
              yAxisId="left"
              dataKey="Прибуток" 
              fill={(data) => data.profit >= 0 ? '#28a745' : '#dc3545'}
              radius={[4, 4, 0, 0]}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="Рентабельність" 
              stroke="#ffc107" 
              strokeWidth={3}
              dot={{ fill: '#ffc107', strokeWidth: 2, r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Компонент для кругової діаграми витрат
  const ExpensesPieChart = () => {
    const pieData = Object.entries(categories).map(([category, value], index) => ({
      name: category,
      value: value,
      fill: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'][index % 8]
    }));
    
    const CustomTooltip = ({ active, payload }) => {
      if (active && payload && payload.length) {
        const data = payload[0];
        const totalExpenses = Object.values(categories).reduce((sum, value) => sum + value, 0);
        const percentage = totalExpenses > 0 ? (data.value / totalExpenses) * 100 : 0;
        
        return (
          <div style={{
            backgroundColor: '#22334a',
            border: '1px solid #29506a',
            borderRadius: '8px',
            padding: '12px',
            color: '#fff'
          }}>
            <p style={{ margin: 0, fontWeight: 'bold' }}>{data.name}</p>
            <p style={{ margin: '4px 0 0 0' }}>{formatCurrency(data.value)}</p>
            <p style={{ margin: '4px 0 0 0', color: '#ccc' }}>{percentage.toFixed(1)}% від загальної суми</p>
          </div>
        );
      }
      return null;
    };
    
    return (
      <div style={{
        background: '#1a2636',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3 style={{color: '#fff', marginBottom: '16px'}}>Розподіл витрат по категоріях</h3>
        <div style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
          {/* Кругова діаграма */}
          <div style={{width: '300px', height: '300px'}}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          {/* Легенда */}
          <div style={{flex: 1}}>
            {pieData.map((entry, index) => {
              const totalExpenses = Object.values(categories).reduce((sum, value) => sum + value, 0);
              const percentage = totalExpenses > 0 ? (entry.value / totalExpenses) * 100 : 0;
              
              return (
                <div key={entry.name} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    background: entry.fill,
                    borderRadius: '2px'
                  }} />
                  <span style={{color: '#fff', fontSize: '12px', flex: 1}}>
                    {entry.name}
                  </span>
                  <span style={{color: '#00bfff', fontSize: '12px'}}>
                    {formatCurrency(entry.value)}
                  </span>
                  <span style={{color: '#ccc', fontSize: '12px', minWidth: '40px'}}>
                    ({percentage.toFixed(1)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Компонент для таблиці детальної звітності
  const DetailedTable = () => {
    return (
      <div style={{
        background: '#1a2636',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3 style={{color: '#fff', marginBottom: '16px'}}>Детальна звітність по місяцях</h3>
        <div style={{overflowX: 'auto'}}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            color: '#fff'
          }}>
            <thead>
              <tr>
                <th style={{padding: '12px', textAlign: 'left', background: '#22334a', borderBottom: '1px solid #29506a'}}>
                  Період
                </th>
                <th style={{padding: '12px', textAlign: 'right', background: '#22334a', borderBottom: '1px solid #29506a'}}>
                  Дохід по роботах
                </th>
                <th style={{padding: '12px', textAlign: 'right', background: '#22334a', borderBottom: '1px solid #29506a'}}>
                  Дохід по матеріалам
                </th>
                <th style={{padding: '12px', textAlign: 'right', background: '#22334a', borderBottom: '1px solid #29506a'}}>
                  Загальний дохід
                </th>
                <th style={{padding: '12px', textAlign: 'right', background: '#22334a', borderBottom: '1px solid #29506a'}}>
                  Витрати
                </th>
                <th style={{padding: '12px', textAlign: 'right', background: '#22334a', borderBottom: '1px solid #29506a'}}>
                  Прибуток
                </th>
                <th style={{padding: '12px', textAlign: 'right', background: '#22334a', borderBottom: '1px solid #29506a'}}>
                  Рентабельність
                </th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((data, index) => (
                <tr key={index} style={{
                  background: index % 2 === 0 ? '#22334a' : '#1a2636',
                  borderBottom: '1px solid #29506a'
                }}>
                  <td style={{padding: '12px'}}>
                    {getMonthName(data.month)} {data.year}
                  </td>
                  <td style={{padding: '12px', textAlign: 'right', color: '#28a745'}}>
                    {formatCurrency(data.workRevenue)}
                  </td>
                  <td style={{padding: '12px', textAlign: 'right', color: '#20c997'}}>
                    {formatCurrency(data.materialsRevenue)}
                  </td>
                  <td style={{padding: '12px', textAlign: 'right', color: '#28a745', fontWeight: 'bold'}}>
                    {formatCurrency(data.totalRevenue)}
                  </td>
                  <td style={{padding: '12px', textAlign: 'right', color: '#dc3545'}}>
                    {formatCurrency(data.expenses)}
                  </td>
                  <td style={{padding: '12px', textAlign: 'right', color: data.profit >= 0 ? '#28a745' : '#dc3545'}}>
                    {formatCurrency(data.profit)}
                  </td>
                  <td style={{padding: '12px', textAlign: 'right', color: data.profitability >= 0 ? '#28a745' : '#dc3545'}}>
                    {formatPercent(data.profitability)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      padding: '24px',
      background: '#22334a',
      borderRadius: '12px',
      margin: '32px auto',
      maxWidth: '1400px'
    }}>
      <h2 style={{color: '#fff', marginBottom: '24px'}}>Детальна звітність</h2>
      
      {/* Фільтри */}
      <div style={{marginBottom: '24px', padding: '20px', background: '#1a2636', borderRadius: '8px'}}>
        <h3 style={{color: '#fff', marginBottom: '16px'}}>Фільтри та налаштування</h3>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px'}}>
          <div>
            <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>
              Регіон:
              {dataLoading && <span style={{color: '#ffa500', marginLeft: '8px'}}>(завантаження...)</span>}
            </label>
            <select
              value={filters.region}
              onChange={(e) => setFilters(prev => ({...prev, region: e.target.value}))}
              disabled={dataLoading}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #29506a',
                background: dataLoading ? '#1a1a1a' : '#22334a',
                color: dataLoading ? '#666' : '#fff'
              }}
            >
              <option value="">Всі регіони</option>
              {uniqueRegions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>
              Компанія:
              {dataLoading && <span style={{color: '#ffa500', marginLeft: '8px'}}>(завантаження...)</span>}
            </label>
            <select
              value={filters.company}
              onChange={(e) => setFilters(prev => ({...prev, company: e.target.value}))}
              disabled={dataLoading}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #29506a',
                background: dataLoading ? '#1a1a1a' : '#22334a',
                color: dataLoading ? '#666' : '#fff'
              }}
            >
              <option value="">Всі компанії</option>
              {uniqueCompanies.map(company => (
                <option key={company} value={company}>{company}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Рік з:</label>
            <input
              type="number"
              value={filters.startYear}
              onChange={(e) => setFilters(prev => ({...prev, startYear: parseInt(e.target.value)}))}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #29506a',
                background: '#22334a',
                color: '#fff'
              }}
            />
          </div>
          
          <div>
            <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Рік по:</label>
            <input
              type="number"
              value={filters.endYear}
              onChange={(e) => setFilters(prev => ({...prev, endYear: parseInt(e.target.value)}))}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #29506a',
                background: '#22334a',
                color: '#fff'
              }}
            />
          </div>
          
          <div>
            <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Місяць з:</label>
            <select
              value={filters.startMonth}
              onChange={(e) => setFilters(prev => ({...prev, startMonth: parseInt(e.target.value)}))}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #29506a',
                background: '#22334a',
                color: '#fff'
              }}
            >
              {Array.from({length: 12}, (_, i) => i + 1).map(month => (
                <option key={month} value={month}>{getMonthName(month)}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Місяць по:</label>
            <select
              value={filters.endMonth}
              onChange={(e) => setFilters(prev => ({...prev, endMonth: parseInt(e.target.value)}))}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #29506a',
                background: '#22334a',
                color: '#fff'
              }}
            >
              {Array.from({length: 12}, (_, i) => i + 1).map(month => (
                <option key={month} value={month}>{getMonthName(month)}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div style={{marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap'}}>
          <button
            onClick={() => setFilters({
              region: '', company: '', 
              startYear: new Date().getFullYear(), 
              endYear: new Date().getFullYear(),
              startMonth: 1, endMonth: 12,
              chartType: 'revenue',
              periodType: 'monthly'
            })}
            style={{
              padding: '10px 20px',
              background: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Очистити фільтри
          </button>
          
          <button
            onClick={() => setFilters(prev => ({...prev, chartType: 'revenue'}))}
            style={{
              padding: '10px 20px',
              background: filters.chartType === 'revenue' ? '#28a745' : '#1a2636',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Доходи
          </button>
          
          <button
            onClick={() => setFilters(prev => ({...prev, chartType: 'expenses'}))}
            style={{
              padding: '10px 20px',
              background: filters.chartType === 'expenses' ? '#dc3545' : '#1a2636',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Витрати
          </button>
          
          <button
            onClick={() => setFilters(prev => ({...prev, chartType: 'profit'}))}
            style={{
              padding: '10px 20px',
              background: filters.chartType === 'profit' ? '#ffc107' : '#1a2636',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Прибуток
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{color: '#fff', textAlign: 'center', padding: '40px'}}>
          Завантаження детальної звітності...
        </div>
      ) : (
        <div>
          {/* Графіки */}
          {filters.chartType === 'revenue' && <RevenueChart />}
          {filters.chartType === 'expenses' && <ExpensesChart />}
          {filters.chartType === 'profit' && <ProfitChart />}
          
          {/* Кругова діаграма витрат */}
          <ExpensesPieChart />
          
          {/* Детальна таблиця */}
          <DetailedTable />
        </div>
      )}
    </div>
  );
}
