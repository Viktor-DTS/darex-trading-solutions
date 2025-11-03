import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  ComposedChart, Cell 
} from 'recharts';
import { analyticsAPI } from '../utils/analyticsAPI';

const COLORS = {
  revenue: '#4CAF50',
  expenses: '#F44336',
  profit: '#2196F3',
  workRevenue: '#FF9800',
  materialsRevenue: '#9C27B0',
  profitability: '#00BCD4',
  created: '#2196F3',
  inWork: '#FF9800',
  warehouseApproved: '#4CAF50',
  accountantApproved: '#8BC34A',
  notInWork: '#9E9E9E',
  pendingWarehouse: '#FFC107',
  pendingAccountant: '#FF5722'
};

const CHART_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0', 
  '#00BCD4', '#FFC107', '#FF5722', '#9E9E9E', '#E91E63'
];

export default function DetailedReportTab({ 
  filters, 
  uniqueRegions, 
  uniqueCompanies, 
  getMonthName,
  formatCurrency,
  formatPercent
}) {
  const [localFilters, setLocalFilters] = useState({
    region: filters?.region || '',
    company: filters?.company || '',
    startYear: filters?.startYear || new Date().getFullYear(),
    endYear: filters?.endYear || new Date().getFullYear(),
    startMonth: filters?.startMonth || 1,
    endMonth: filters?.endMonth || 12
  });
  
  const [chartData, setChartData] = useState([]);
  const [employeeRating, setEmployeeRating] = useState([]);
  const [tasksStatistics, setTasksStatistics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, [localFilters]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      // Завантажуємо всі дані паралельно
      const [chart, rating, statistics] = await Promise.all([
        analyticsAPI.getDynamicChartData({
          startYear: localFilters.startYear,
          endYear: localFilters.endYear,
          startMonth: localFilters.startMonth,
          endMonth: localFilters.endMonth,
          region: localFilters.region,
          company: localFilters.company
        }),
        analyticsAPI.getEmployeeRating({
          startYear: localFilters.startYear,
          endYear: localFilters.endYear,
          startMonth: localFilters.startMonth,
          endMonth: localFilters.endMonth,
          region: localFilters.region
        }),
        analyticsAPI.getTasksStatistics({
          region: localFilters.region
        })
      ]);

      setChartData(chart || []);
      setEmployeeRating(rating || []);
      setTasksStatistics(statistics || null);
    } catch (error) {
      console.error('Помилка завантаження даних:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
  };

  // Форматування даних для графіків
  const formattedChartData = useMemo(() => {
    return chartData.map(item => ({
      ...item,
      periodLabel: `${getMonthName(item.month)} ${item.year}`
    }));
  }, [chartData, getMonthName]);

  // Форматування рейтингу працівників
  const formattedRating = useMemo(() => {
    return employeeRating.map((emp, index) => ({
      ...emp,
      position: index + 1,
      formattedBonus: formatCurrency(emp.totalBonus)
    }));
  }, [employeeRating, formatCurrency]);


  // Підсумки за період
  const periodTotals = useMemo(() => {
    return formattedChartData.reduce((acc, item) => {
      acc.revenue += item.revenue || 0;
      acc.expenses += item.expenses || 0;
      acc.profit += item.profit || 0;
      acc.workRevenue += item.workRevenue || 0;
      acc.materialsRevenue += item.materialsRevenue || 0;
      return acc;
    }, {
      revenue: 0,
      expenses: 0,
      profit: 0,
      workRevenue: 0,
      materialsRevenue: 0
    });
  }, [formattedChartData]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#fff' }}>
        <p>Завантаження даних...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '0', 
      background: 'transparent', 
      minHeight: 'auto',
      width: '100%',
      boxSizing: 'border-box',
      margin: '0',
      display: 'block'
    }}>
      <div style={{ 
        background: '#1a2636', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <h2 style={{ color: '#fff', marginTop: 0 }}>Детальна економічна звітність</h2>
        
        {/* Фільтри */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', 
          gap: '15px',
          marginBottom: '20px',
          width: '100%'
        }}>
          <div>
            <label style={{ color: '#fff', display: 'block', marginBottom: '5px' }}>
              Регіон:
            </label>
            <select
              value={localFilters.region}
              onChange={(e) => handleFilterChange('region', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                background: '#2a3441',
                color: '#fff',
                border: '1px solid #3a4451'
              }}
            >
              <option value="">Всі регіони</option>
              {uniqueRegions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ color: '#fff', display: 'block', marginBottom: '5px' }}>
              Компанія:
            </label>
            <select
              value={localFilters.company}
              onChange={(e) => handleFilterChange('company', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                background: '#2a3441',
                color: '#fff',
                border: '1px solid #3a4451'
              }}
            >
              <option value="">Всі компанії</option>
              {uniqueCompanies.map(company => (
                <option key={company} value={company}>{company}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ color: '#fff', display: 'block', marginBottom: '5px' }}>
              Початковий рік:
            </label>
            <input
              type="number"
              value={localFilters.startYear}
              onChange={(e) => handleFilterChange('startYear', parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                background: '#2a3441',
                color: '#fff',
                border: '1px solid #3a4451'
              }}
            />
          </div>

          <div>
            <label style={{ color: '#fff', display: 'block', marginBottom: '5px' }}>
              Кінцевий рік:
            </label>
            <input
              type="number"
              value={localFilters.endYear}
              onChange={(e) => handleFilterChange('endYear', parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                background: '#2a3441',
                color: '#fff',
                border: '1px solid #3a4451'
              }}
            />
          </div>

          <div>
            <label style={{ color: '#fff', display: 'block', marginBottom: '5px' }}>
              Початковий місяць:
            </label>
            <select
              value={localFilters.startMonth}
              onChange={(e) => handleFilterChange('startMonth', parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                background: '#2a3441',
                color: '#fff',
                border: '1px solid #3a4451'
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                <option key={month} value={month}>{getMonthName(month)}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ color: '#fff', display: 'block', marginBottom: '5px' }}>
              Кінцевий місяць:
            </label>
            <select
              value={localFilters.endMonth}
              onChange={(e) => handleFilterChange('endMonth', parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                background: '#2a3441',
                color: '#fff',
                border: '1px solid #3a4451'
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                <option key={month} value={month}>{getMonthName(month)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Підсумкові показники */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: '15px',
          marginBottom: '20px'
        }}>
          <div style={{ background: '#2a3441', padding: '15px', borderRadius: '4px' }}>
            <div style={{ color: '#aaa', fontSize: '14px' }}>Дохід</div>
            <div style={{ color: COLORS.revenue, fontSize: '20px', fontWeight: 'bold' }}>
              {formatCurrency(periodTotals.revenue)}
            </div>
          </div>
          <div style={{ background: '#2a3441', padding: '15px', borderRadius: '4px' }}>
            <div style={{ color: '#aaa', fontSize: '14px' }}>Витрати</div>
            <div style={{ color: COLORS.expenses, fontSize: '20px', fontWeight: 'bold' }}>
              {formatCurrency(periodTotals.expenses)}
            </div>
          </div>
          <div style={{ background: '#2a3441', padding: '15px', borderRadius: '4px' }}>
            <div style={{ color: '#aaa', fontSize: '14px' }}>Прибуток</div>
            <div style={{ color: COLORS.profit, fontSize: '20px', fontWeight: 'bold' }}>
              {formatCurrency(periodTotals.profit)}
            </div>
          </div>
          <div style={{ background: '#2a3441', padding: '15px', borderRadius: '4px' }}>
            <div style={{ color: '#aaa', fontSize: '14px' }}>Рентабельність</div>
            <div style={{ color: COLORS.profitability, fontSize: '20px', fontWeight: 'bold' }}>
              {formatPercent(periodTotals.revenue > 0 ? (periodTotals.profit / periodTotals.revenue) * 100 : 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Графік динаміки доходів та витрат */}
      <div style={{ 
        background: '#1a2636', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <h3 style={{ color: '#fff', marginTop: 0 }}>Динаміка доходів та витрат</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={formattedChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3a4451" />
            <XAxis 
              dataKey="periodLabel" 
              stroke="#aaa"
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis stroke="#aaa" />
            <Tooltip 
              contentStyle={{ 
                background: '#2a3441', 
                border: '1px solid #3a4451',
                color: '#fff'
              }}
              formatter={(value) => formatCurrency(value)}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="revenue" 
              fill={COLORS.revenue} 
              fillOpacity={0.3}
              stroke={COLORS.revenue}
              name="Дохід"
            />
            <Area 
              type="monotone" 
              dataKey="expenses" 
              fill={COLORS.expenses} 
              fillOpacity={0.3}
              stroke={COLORS.expenses}
              name="Витрати"
            />
            <Line 
              type="monotone" 
              dataKey="profit" 
              stroke={COLORS.profit} 
              strokeWidth={2}
              dot={{ fill: COLORS.profit }}
              name="Прибуток"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Графік структури доходів */}
      <div style={{ 
        background: '#1a2636', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <h3 style={{ color: '#fff', marginTop: 0 }}>Структура доходів</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={formattedChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3a4451" />
            <XAxis 
              dataKey="periodLabel" 
              stroke="#aaa"
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis stroke="#aaa" />
            <Tooltip 
              contentStyle={{ 
                background: '#2a3441', 
                border: '1px solid #3a4451',
                color: '#fff'
              }}
              formatter={(value) => formatCurrency(value)}
            />
            <Legend />
            <Bar dataKey="workRevenue" fill={COLORS.workRevenue} name="Дохід по роботах" />
            <Bar dataKey="materialsRevenue" fill={COLORS.materialsRevenue} name="Дохід по матеріалам" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Графік рентабельності */}
      <div style={{ 
        background: '#1a2636', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <h3 style={{ color: '#fff', marginTop: 0 }}>Динаміка рентабельності</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={formattedChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3a4451" />
            <XAxis 
              dataKey="periodLabel" 
              stroke="#aaa"
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis stroke="#aaa" />
            <Tooltip 
              contentStyle={{ 
                background: '#2a3441', 
                border: '1px solid #3a4451',
                color: '#fff'
              }}
              formatter={(value) => formatPercent(value)}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="profitability" 
              stroke={COLORS.profitability} 
              strokeWidth={3}
              dot={{ fill: COLORS.profitability, r: 5 }}
              name="Рентабельність (%)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Рейтинг працівників */}
      <div style={{ 
        background: '#1a2636', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <h3 style={{ color: '#fff', marginTop: 0 }}>
          Рейтинг працівників по преміях
          {localFilters.startMonth && localFilters.startYear && (
            <span style={{ fontSize: '0.9em', fontWeight: 'normal', color: '#aaa', marginLeft: '10px' }}>
              ({localFilters.startMonth === localFilters.endMonth && localFilters.startYear === localFilters.endYear
                ? `${getMonthName(localFilters.startMonth)} ${localFilters.startYear}`
                : `${getMonthName(localFilters.startMonth)} ${localFilters.startYear} - ${getMonthName(localFilters.endMonth)} ${localFilters.endYear}`
              })
            </span>
          )}
        </h3>
        {formattedRating.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={formattedRating.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a4451" />
                <XAxis 
                  dataKey="name" 
                  stroke="#aaa"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis stroke="#aaa" />
                <Tooltip 
                  contentStyle={{ 
                    background: '#2a3441', 
                    border: '1px solid #3a4451',
                    color: '#fff'
                  }}
                  formatter={(value) => formatCurrency(value)}
                />
                <Legend />
                <Bar dataKey="totalBonus" fill={COLORS.profit} name="Сума премії" />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: '20px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                <thead>
                  <tr style={{ background: '#2a3441' }}>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #3a4451' }}>Місце</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #3a4451' }}>Працівник</th>
                    <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #3a4451' }}>Премія</th>
                    <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #3a4451' }}>Заявок</th>
                    <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #3a4451' }}>Вартість робіт</th>
                  </tr>
                </thead>
                <tbody>
                  {formattedRating.map((emp, index) => (
                    <tr 
                      key={emp.name} 
                      style={{ 
                        background: index % 2 === 0 ? '#1a2636' : '#2a3441',
                        border: '1px solid #3a4451'
                      }}
                    >
                      <td style={{ padding: '10px', border: '1px solid #3a4451' }}>{emp.position}</td>
                      <td style={{ padding: '10px', border: '1px solid #3a4451' }}>{emp.name}</td>
                      <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #3a4451' }}>
                        {formatCurrency(emp.totalBonus)}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #3a4451' }}>
                        {Math.round(emp.tasksCount)}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #3a4451' }}>
                        {formatCurrency(emp.totalWorkPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
            Немає даних для відображення
          </p>
        )}
      </div>

      {/* Заявки в роботі */}
      <div style={{ 
        background: '#1a2636', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <h3 style={{ color: '#fff', marginTop: 0 }}>Заявки в роботі (на сьогоднішній день)</h3>
        {tasksStatistics ? (
          <>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '20px',
              marginTop: '20px'
            }}>
              <div style={{ background: '#2a3441', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#aaa', fontSize: '14px', marginBottom: '10px' }}>Не взято в роботу</div>
                <div style={{ color: COLORS.notInWork, fontSize: '32px', fontWeight: 'bold' }}>
                  {tasksStatistics.notInWork || 0}
                </div>
              </div>
              <div style={{ background: '#2a3441', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#aaa', fontSize: '14px', marginBottom: '10px' }}>Виконується сервісними інжнерами</div>
                <div style={{ color: COLORS.inWork, fontSize: '32px', fontWeight: 'bold' }}>
                  {tasksStatistics.inWork || 0}
                </div>
              </div>
              <div style={{ background: '#2a3441', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#aaa', fontSize: '14px', marginBottom: '10px' }}>Не підтверджено завскладом</div>
                <div style={{ color: COLORS.pendingWarehouse, fontSize: '32px', fontWeight: 'bold' }}>
                  {tasksStatistics.pendingWarehouse || 0}
                </div>
              </div>
              <div style={{ background: '#2a3441', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#aaa', fontSize: '14px', marginBottom: '10px' }}>Не підтверджено бухгалтером</div>
                <div style={{ color: COLORS.pendingAccountant, fontSize: '32px', fontWeight: 'bold' }}>
                  {tasksStatistics.pendingAccountant || 0}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
            Немає даних для відображення
          </p>
        )}
      </div>
    </div>
  );
}

