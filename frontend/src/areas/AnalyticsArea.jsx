import React, { useState, useEffect } from 'react';
import { analyticsAPI, EXPENSE_CATEGORIES, formatCurrency, formatPercent, getMonthName } from '../utils/analyticsAPI';
import { regionsAPI } from '../utils/regionsAPI';

export default function AnalyticsArea({ user }) {
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [uniqueRegions, setUniqueRegions] = useState([]);
  const [uniqueCompanies, setUniqueCompanies] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filters, setFilters] = useState({
    region: '',
    company: '',
    startYear: new Date().getFullYear(),
    endYear: new Date().getFullYear(),
    startMonth: 1,
    endMonth: 12
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);

  // Завантаження регіонів та компаній
  useEffect(() => {
    const loadData = async () => {
      try {
        setDataLoading(true);
        console.log('Початок завантаження даних...');
        
        // Завантажуємо регіони з regionsAPI
        const regionsData = await regionsAPI.getAll();
        console.log('Регіони з regionsAPI:', regionsData);
        setRegions(regionsData);
        
        // Завантажуємо унікальні регіони з заявок
        console.log('Завантаження унікальних регіонів...');
        const uniqueRegionsData = await analyticsAPI.getUniqueRegions();
        console.log('Унікальні регіони:', uniqueRegionsData);
        setUniqueRegions(uniqueRegionsData);
        
        // Завантажуємо унікальні компанії з заявок
        console.log('Завантаження унікальних компаній...');
        const uniqueCompaniesData = await analyticsAPI.getUniqueCompanies();
        console.log('Унікальні компанії:', uniqueCompaniesData);
        setUniqueCompanies(uniqueCompaniesData);
        
        console.log('Завантаження даних завершено');
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
      console.log('[DEBUG] Завантаження аналітики з фільтрами:', filters);
      const data = await analyticsAPI.getFullAnalytics(filters);
      console.log('[DEBUG] Отримані дані аналітики:', data);
      setAnalytics(data);
    } catch (error) {
      console.error('Помилка завантаження аналітики:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [filters]);

  // Розрахунок загальних показників
  const calculateTotals = () => {
    const totals = {
      workRevenue: 0,
      materialsRevenue: 0,
      revenue: 0,
      expenses: 0,
      profit: 0,
      profitability: 0,
      expenseBreakdown: {}
    };

    analytics.forEach(item => {
      totals.workRevenue += item.workRevenue || 0;
      totals.materialsRevenue += item.materialsRevenue || 0;
      totals.revenue += item.revenue || 0;
      totals.expenses += item.totalExpenses || 0;
      totals.profit += item.profit || 0;

      // Розбивка витрат
      Object.keys(item.expenses || {}).forEach(category => {
        if (!totals.expenseBreakdown[category]) {
          totals.expenseBreakdown[category] = 0;
        }
        totals.expenseBreakdown[category] += item.expenses[category] || 0;
      });
    });

    totals.profitability = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

    return totals;
  };

  const totals = calculateTotals();

  // Функція для копіювання витрат з попереднього місяця
  const handleCopyPreviousMonth = async () => {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    try {
      await analyticsAPI.copyPreviousMonth({
        region: filters.region,
        company: filters.company,
        year,
        month,
        createdBy: user.login
      });
      alert('Витрати скопійовано з попереднього місяця!');
      loadAnalytics();
    } catch (error) {
      alert('Помилка копіювання витрат');
    }
  };

  // Функція для редагування витрат
  const handleEditExpenses = (item) => {
    setEditingExpense(item);
    setShowExpenseModal(true);
  };

  // Функція для збереження витрат
  const handleSaveExpenses = async (expenses) => {
    try {
      await analyticsAPI.saveAnalytics({
        region: editingExpense.region,
        company: editingExpense.company,
        year: editingExpense.year,
        month: editingExpense.month,
        expenses,
        createdBy: user.login
      });
      alert('Витрати збережено!');
      setShowExpenseModal(false);
      setEditingExpense(null);
      loadAnalytics();
    } catch (error) {
      alert('Помилка збереження витрат');
    }
  };

  // Функція для додавання нових витрат
  const handleAddExpenses = () => {
    setEditingExpense({
      region: filters.region || '',
      company: filters.company || '',
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      expenses: {}
    });
    setShowAddExpenseModal(true);
  };

  // Функція для збереження нових витрат
  const handleSaveNewExpenses = async (data) => {
    try {
      // Розділяємо дані на expenses та formData
      const { region, company, year, month, expenses } = data;
      
      await analyticsAPI.saveAnalytics({
        region,
        company,
        year,
        month,
        expenses,
        createdBy: user.login
      });
      alert('Витрати додано!');
      setShowAddExpenseModal(false);
      setEditingExpense(null);
      loadAnalytics();
    } catch (error) {
      alert('Помилка додавання витрат');
    }
  };

  // Функція для видалення витрат
  const handleDeleteExpenses = async (item) => {
    // Перевіряємо права доступу
    const canDelete = user?.role === 'admin' || user?.role === 'administrator' || user?.role === 'regionalManager' || user?.role === 'regkerivn';
    
    if (!canDelete) {
      alert('У вас немає прав для видалення витрат. Зверніться до адміністратора.');
      return;
    }

    if (!confirm(`Ви впевнені, що хочете видалити витрати за ${getMonthName(item.month)} ${item.year} для ${item.region} - ${item.company}?`)) {
      return;
    }

    try {
      await analyticsAPI.deleteAnalytics({
        region: item.region,
        company: item.company,
        year: item.year,
        month: item.month,
        user: user
      });
      alert('Витрати видалено!');
      loadAnalytics();
    } catch (error) {
      alert('Помилка видалення витрат');
    }
  };

  // Компонент для редагування витрат
  const ExpenseModal = ({ open, onClose, expense, onSave, isNew = false }) => {
    const [expenses, setExpenses] = useState(expense?.expenses || {});
    const [formData, setFormData] = useState({
      region: expense?.region || '',
      company: expense?.company || '',
      year: expense?.year || new Date().getFullYear(),
      month: expense?.month || new Date().getMonth() + 1
    });

    useEffect(() => {
      setExpenses(expense?.expenses || {});
      setFormData({
        region: expense?.region || '',
        company: expense?.company || '',
        year: expense?.year || new Date().getFullYear(),
        month: expense?.month || new Date().getMonth() + 1
      });
    }, [expense]);

    if (!open) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          background: '#22334a',
          padding: '24px',
          borderRadius: '8px',
          minWidth: '500px',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflowY: 'auto'
        }}>
          <h3 style={{color: '#fff', marginBottom: '16px'}}>
            {isNew ? 'Додавання витрат' : `Редагування витрат: ${expense?.region} - ${expense?.company} - ${getMonthName(expense?.month)} ${expense?.year}`}
          </h3>
          
          {isNew && (
            <div style={{marginBottom: '16px'}}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px'}}>
                                 <div>
                   <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Регіон сервісного відділу:</label>
                   <select
                     value={formData.region}
                     onChange={(e) => setFormData(prev => ({...prev, region: e.target.value}))}
                     style={{
                       width: '100%',
                       padding: '8px',
                       borderRadius: '4px',
                       border: '1px solid #29506a',
                       background: '#1a2636',
                       color: '#fff'
                     }}
                   >
                     <option value="">Оберіть регіон</option>
                     {uniqueRegions.map(region => (
                       <option key={region} value={region}>{region}</option>
                     ))}
                   </select>
                 </div>
                 <div>
                   <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Компанія виконавець:</label>
                   <select
                     value={formData.company}
                     onChange={(e) => setFormData(prev => ({...prev, company: e.target.value}))}
                     style={{
                       width: '100%',
                       padding: '8px',
                       borderRadius: '4px',
                       border: '1px solid #29506a',
                       background: '#1a2636',
                       color: '#fff'
                     }}
                   >
                     <option value="">Оберіть компанію</option>
                     {uniqueCompanies.map(company => (
                       <option key={company} value={company}>{company}</option>
                     ))}
                   </select>
                 </div>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                <div>
                  <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Рік:</label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData(prev => ({...prev, year: parseInt(e.target.value)}))}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #29506a',
                      background: '#1a2636',
                      color: '#fff'
                    }}
                  />
                </div>
                <div>
                  <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Місяць:</label>
                  <select
                    value={formData.month}
                    onChange={(e) => setFormData(prev => ({...prev, month: parseInt(e.target.value)}))}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #29506a',
                      background: '#1a2636',
                      color: '#fff'
                    }}
                  >
                    {Array.from({length: 12}, (_, i) => i + 1).map(month => (
                      <option key={month} value={month}>{getMonthName(month)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
          
          <div style={{marginBottom: '16px'}}>
            {Object.entries(EXPENSE_CATEGORIES).map(([key, category]) => (
              <div key={key} style={{marginBottom: '12px'}}>
                <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>
                  {category.label}:
                </label>
                <input
                  type="number"
                  value={expenses[key] || 0}
                  onChange={(e) => setExpenses(prev => ({
                    ...prev,
                    [key]: parseFloat(e.target.value) || 0
                  }))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #29506a',
                    background: '#1a2636',
                    color: '#fff'
                  }}
                />
              </div>
            ))}
          </div>

          <div style={{display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: '#666',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Скасувати
            </button>
            <button
              onClick={() => {
                if (isNew) {
                  // Для нових витрат передаємо formData та expenses окремо
                  const dataToSave = {
                    ...formData,
                    expenses: expenses
                  };
                  onSave(dataToSave);
                } else {
                  // Для редагування передаємо тільки expenses
                  onSave(expenses);
                }
              }}
              style={{
                padding: '8px 16px',
                background: '#28a745',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {isNew ? 'Додати' : 'Зберегти'}
            </button>
          </div>
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
      <h2>Аналітика</h2>
      
      {/* Фільтри */}
      <div style={{marginBottom: '16px', padding: '16px', background: '#1a2636', borderRadius: '8px'}}>
        <h3 style={{color: '#fff', marginBottom: '12px'}}>Фільтри</h3>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px'}}>
                                 <div>
              <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>
                Регіон сервісного відділу:
                {dataLoading && <span style={{color: '#ffa500', marginLeft: '8px'}}>(завантаження...)</span>}
              </label>
              <select
                value={filters.region}
                onChange={(e) => setFilters(prev => ({...prev, region: e.target.value}))}
                disabled={dataLoading}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
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
                Компанія виконавець:
                {dataLoading && <span style={{color: '#ffa500', marginLeft: '8px'}}>(завантаження...)</span>}
              </label>
              <select
                value={filters.company}
                onChange={(e) => setFilters(prev => ({...prev, company: e.target.value}))}
                disabled={dataLoading}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
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
                padding: '8px',
                borderRadius: '4px',
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
                padding: '8px',
                borderRadius: '4px',
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
                padding: '8px',
                borderRadius: '4px',
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
                padding: '8px',
                borderRadius: '4px',
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
        
                 <div style={{marginTop: '12px', display: 'flex', gap: '8px'}}>
           <button
             onClick={() => setFilters({
               region: '', company: '', 
               startYear: new Date().getFullYear(), 
               endYear: new Date().getFullYear(),
               startMonth: 1, endMonth: 12
             })}
             style={{
               padding: '8px 16px',
               background: '#6c757d',
               color: '#fff',
               border: 'none',
               borderRadius: '4px',
               cursor: 'pointer'
             }}
           >
             Очистити фільтри
           </button>
           
           <button
             onClick={handleAddExpenses}
             style={{
               padding: '8px 16px',
               background: '#28a745',
               color: '#fff',
               border: 'none',
               borderRadius: '4px',
               cursor: 'pointer'
             }}
           >
             Додати витрати
           </button>
           
           <button
             onClick={handleCopyPreviousMonth}
             style={{
               padding: '8px 16px',
               background: '#17a2b8',
               color: '#fff',
               border: 'none',
               borderRadius: '4px',
               cursor: 'pointer'
             }}
           >
             Копіювати з попереднього місяця
           </button>
         </div>
      </div>

      {/* Вкладки */}
      <div style={{marginBottom: '16px'}}>
        <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '10px 20px',
              background: activeTab === 'overview' ? '#00bfff' : '#1a2636',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Загальний огляд
          </button>
          <button
            onClick={() => setActiveTab('details')}
            style={{
              padding: '10px 20px',
              background: activeTab === 'details' ? '#00bfff' : '#1a2636',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Детальна звітність
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{color: '#fff', textAlign: 'center', padding: '20px'}}>
          Завантаження аналітики...
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div>
              {/* Загальні показники */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  background: '#28a745',
                  padding: '20px',
                  borderRadius: '8px',
                  color: '#fff',
                  textAlign: 'center'
                }}>
                  <h3 style={{margin: '0 0 8px 0', fontSize: '16px'}}>Загальний дохід</h3>
                  <div style={{fontSize: '24px', fontWeight: 'bold'}}>
                    {formatCurrency(totals.revenue)}
                  </div>
                  <div style={{fontSize: '12px', marginTop: '4px'}}>
                    Роботи: {formatCurrency(totals.workRevenue)} | Матеріали: {formatCurrency(totals.materialsRevenue)}
                  </div>
                </div>
                
                <div style={{
                  background: '#dc3545',
                  padding: '20px',
                  borderRadius: '8px',
                  color: '#fff',
                  textAlign: 'center'
                }}>
                  <h3 style={{margin: '0 0 8px 0', fontSize: '16px'}}>Загальні витрати</h3>
                  <div style={{fontSize: '24px', fontWeight: 'bold'}}>
                    {formatCurrency(totals.expenses)}
                  </div>
                </div>
                
                <div style={{
                  background: totals.profit >= 0 ? '#28a745' : '#dc3545',
                  padding: '20px',
                  borderRadius: '8px',
                  color: '#fff',
                  textAlign: 'center'
                }}>
                  <h3 style={{margin: '0 0 8px 0', fontSize: '16px'}}>Прибуток</h3>
                  <div style={{fontSize: '24px', fontWeight: 'bold'}}>
                    {formatCurrency(totals.profit)}
                  </div>
                </div>
                
                <div style={{
                  background: totals.profitability >= 0 ? '#28a745' : '#dc3545',
                  padding: '20px',
                  borderRadius: '8px',
                  color: '#fff',
                  textAlign: 'center'
                }}>
                  <h3 style={{margin: '0 0 8px 0', fontSize: '16px'}}>Рентабельність</h3>
                  <div style={{fontSize: '24px', fontWeight: 'bold'}}>
                    {formatPercent(totals.profitability)}
                  </div>
                </div>
              </div>

              {/* Графік витрат */}
              <div style={{
                background: '#1a2636',
                padding: '20px',
                borderRadius: '8px',
                marginBottom: '24px'
              }}>
                <h3 style={{color: '#fff', marginBottom: '16px'}}>Розбивка витрат</h3>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px'}}>
                  {Object.entries(totals.expenseBreakdown).map(([category, amount]) => (
                    <div key={category} style={{
                      background: '#22334a',
                      padding: '12px',
                      borderRadius: '6px',
                      borderLeft: `4px solid ${EXPENSE_CATEGORIES[category]?.color || '#ccc'}`
                    }}>
                      <div style={{color: '#fff', fontSize: '14px', marginBottom: '4px'}}>
                        {EXPENSE_CATEGORIES[category]?.label || category}
                      </div>
                      <div style={{color: '#00bfff', fontSize: '18px', fontWeight: 'bold'}}>
                        {formatCurrency(amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Графік по місяцях */}
              <div style={{
                background: '#1a2636',
                padding: '20px',
                borderRadius: '8px'
              }}>
                <h3 style={{color: '#fff', marginBottom: '16px'}}>Динаміка по місяцях</h3>
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
                          Дохід по виконаним роботам
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
                        <th style={{padding: '12px', textAlign: 'center', background: '#22334a', borderBottom: '1px solid #29506a'}}>
                          Дії
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.map((item, index) => (
                        <tr key={index} style={{
                          background: index % 2 === 0 ? '#22334a' : '#1a2636',
                          borderBottom: '1px solid #29506a'
                        }}>
                          <td style={{padding: '12px'}}>
                            {getMonthName(item.month)} {item.year}
                            <div style={{fontSize: '12px', color: '#ccc'}}>
                              {item.region} - {item.company}
                            </div>
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: '#28a745'}}>
                            {formatCurrency(item.workRevenue || 0)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: '#28a745'}}>
                            {formatCurrency(item.materialsRevenue || 0)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: '#28a745', fontWeight: 'bold'}}>
                            {formatCurrency(item.revenue)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: '#dc3545'}}>
                            {formatCurrency(item.totalExpenses)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: item.profit >= 0 ? '#28a745' : '#dc3545'}}>
                            {formatCurrency(item.profit)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: item.profitability >= 0 ? '#28a745' : '#dc3545'}}>
                            {formatPercent(item.profitability)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'center'}}>
                            <div style={{display: 'flex', gap: '8px', justifyContent: 'center'}}>
                              <button
                                onClick={() => handleEditExpenses(item)}
                                style={{
                                  padding: '4px 8px',
                                  background: '#00bfff',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                Редагувати
                              </button>
                              {(user?.role === 'admin' || user?.role === 'administrator' || user?.role === 'regionalManager' || user?.role === 'regkerivn') && (
                                <button
                                  onClick={() => handleDeleteExpenses(item)}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#dc3545',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                  }}
                                >
                                  Видалити
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'details' && (
            <div>
              {/* Детальна звітність буде тут */}
              <div style={{
                background: '#1a2636',
                padding: '20px',
                borderRadius: '8px',
                color: '#fff',
                textAlign: 'center'
              }}>
                <h3>Детальна звітність</h3>
                <p>Тут буде детальна звітність з графіками та діаграмами</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Модальне вікно редагування витрат */}
      <ExpenseModal
        open={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        expense={editingExpense}
        onSave={handleSaveExpenses}
      />

      {/* Модальне вікно додавання витрат */}
      <ExpenseModal
        open={showAddExpenseModal}
        onClose={() => setShowAddExpenseModal(false)}
        expense={editingExpense}
        onSave={handleSaveNewExpenses}
        isNew={true}
      />
    </div>
  );
} 