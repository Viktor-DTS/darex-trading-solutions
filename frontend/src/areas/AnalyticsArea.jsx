import React, { useState, useEffect } from 'react';
import { analyticsAPI, EXPENSE_CATEGORIES, formatCurrency, formatPercent, getMonthName } from '../utils/analyticsAPI';
import { regionsAPI } from '../utils/regionsAPI';
import DetailedReportTab from '../components/DetailedReportTab';
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
  const [customExpenseCategories, setCustomExpenseCategories] = useState(EXPENSE_CATEGORIES);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsData, setDetailsData] = useState(null);
  // Завантаження регіонів та компаній
  useEffect(() => {
    const loadData = async () => {
      try {
        setDataLoading(true);
        // Завантажуємо регіони з regionsAPI
        const regionsData = await regionsAPI.getAll();
        setRegions(regionsData);
        // Завантажуємо унікальні регіони з заявок
        const uniqueRegionsData = await analyticsAPI.getUniqueRegions();
        setUniqueRegions(uniqueRegionsData);
        // Завантажуємо унікальні компанії з заявок
        const uniqueCompaniesData = await analyticsAPI.getUniqueCompanies();
        setUniqueCompanies(uniqueCompaniesData);
        // Завантажуємо категорії витрат з бази даних
        const categoriesData = await analyticsAPI.getExpenseCategories();
        setCustomExpenseCategories(categoriesData);
        // Автоматично встановлюємо регіон користувача, якщо він не "Україна"
        if (user?.region && user.region !== 'Україна') {
          setFilters(prev => ({...prev, region: user.region}));
        }
      } catch (error) {
        console.error('Помилка завантаження даних:', error);
      } finally {
        setDataLoading(false);
      }
    };
    loadData();
  }, [user?.region]);
  // Завантаження аналітики
  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const data = await analyticsAPI.getFullAnalytics(filters);
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
      plannedWorkRevenue: 0,
      plannedMaterialsRevenue: 0,
      plannedRevenue: 0,
      revenue: 0,
      expenses: 0,
      profit: 0,
      profitability: 0,
      expenseBreakdown: {}
    };
    analytics.forEach(item => {
      totals.workRevenue += item.workRevenue || 0;
      totals.materialsRevenue += item.materialsRevenue || 0;
      totals.plannedWorkRevenue += item.plannedWorkRevenue || 0;
      totals.plannedMaterialsRevenue += item.plannedMaterialsRevenue || 0;
      totals.plannedRevenue += item.plannedRevenue || 0;
      totals.revenue += item.revenue || 0;
      totals.expenses += item.totalExpenses || 0;
      totals.profit += item.profit || 0;
      // Розбивка витрат - фільтруємо тільки актуальні категорії
      Object.keys(item.expenses || {}).forEach(category => {
        // Перевіряємо чи існує категорія в поточних налаштуваннях
        if (customExpenseCategories[category]) {
          if (!totals.expenseBreakdown[category]) {
            totals.expenseBreakdown[category] = 0;
          }
          totals.expenseBreakdown[category] += item.expenses[category] || 0;
        }
      });
    });
    totals.profitability = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
    return totals;
  };
  const totals = calculateTotals();
  // Функція для копіювання витрат з попереднього місяця
  const handleCopyPreviousMonth = async () => {
    if (!filters.region) {
      alert('Будь ласка, оберіть регіон для копіювання витрат');
      return;
    }
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    try {
      await analyticsAPI.copyPreviousMonth({
        region: filters.region,
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
  const handleSaveExpenses = async (data) => {
    try {
      // data може бути об'єктом з formData та expenses, або тільки expenses (для зворотної сумісності)
      let region, year, month, expensesData;
      
      if (data.expenses !== undefined) {
        // Новий формат: data містить region, year, month, expenses
        region = data.region;
        year = data.year;
        month = data.month;
        expensesData = data.expenses;
      } else {
        // Старий формат: data це тільки expenses
        region = editingExpense.region?.split(',')[0]?.trim() || editingExpense.region;
        year = editingExpense.year;
        month = editingExpense.month;
        expensesData = data;
      }
      
      // Якщо region містить кілька значень через кому, беремо перше
      const regionSingle = region?.split(',')[0]?.trim() || region;
      
      await analyticsAPI.saveAnalytics({
        region: regionSingle,
        year,
        month,
        expenses: expensesData,
        createdBy: user.login
      });
      alert('Витрати збережено!');
      setShowExpenseModal(false);
      setEditingExpense(null);
      loadAnalytics();
    } catch (error) {
      console.error('Помилка збереження витрат:', error);
      alert('Помилка збереження витрат');
    }
  };
  // Функція для додавання нових витрат
  const handleAddExpenses = () => {
    setEditingExpense({
      region: filters.region || '',
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
      const { region, year, month, expenses } = data;
      await analyticsAPI.saveAnalytics({
        region,
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
  // Функції для управління категоріями витрат
  const handleAddCategory = () => {
    const newKey = `custom_${Date.now()}`;
    const newCategory = {
      label: 'Нова категорія',
      color: '#C9CBCF'
    };
    setCustomExpenseCategories(prev => ({
      ...prev,
      [newKey]: newCategory
    }));
  };
  const handleUpdateCategory = (key, field, value) => {
    setCustomExpenseCategories(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
    // Якщо змінюється назва категорії, оновлюємо відображення
    if (field === 'label') {
      // Примусово оновлюємо компонент
      setTimeout(() => {
        setAnalytics(prev => [...prev]);
      }, 100);
    }
  };
  const handleDeleteCategory = (key) => {
    if (Object.keys(customExpenseCategories).length <= 1) {
      alert('Повинна бути хоча б одна категорія витрат!');
      return;
    }
    setCustomExpenseCategories(prev => {
      const newCategories = { ...prev };
      delete newCategories[key];
      return newCategories;
    });
  };
  const handleResetCategories = () => {
    if (confirm('Ви впевнені, що хочете скинути категорії до стандартних?')) {
      setCustomExpenseCategories(EXPENSE_CATEGORIES);
    }
  };
  // Функція для збереження категорій в базі даних
  const handleSaveCategories = async () => {
    try {
      await analyticsAPI.saveExpenseCategories(customExpenseCategories, user?.login || 'system');
      alert('Категорії збережено!');
      // Перезавантажуємо аналітику щоб оновити відображення
      loadAnalytics();
    } catch (error) {
      alert('Помилка збереження категорій');
      console.error('Помилка збереження категорій:', error);
    }
  };
  // Функція для очищення старих категорій
  const handleCleanupOldCategories = async () => {
    if (!confirm('Це очистить всі витрати зі старими категоріями (office, marketing тощо). Продовжити?')) {
      return;
    }
    try {
      await analyticsAPI.cleanupOldCategories(customExpenseCategories, user?.login || 'system');
      alert('Старі категорії очищено!');
      loadAnalytics();
    } catch (error) {
      alert('Помилка очищення старих категорій');
      console.error('Помилка очищення старих категорій:', error);
    }
  };
  // Функція для показу деталей розрахунку
  const handleShowDetails = async (item) => {
    try {
      const data = await analyticsAPI.getDetails({
        year: item.year,
        month: item.month,
        region: filters.region || '',
        company: filters.company || ''
      });
      setDetailsData(data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Помилка завантаження деталей:', error);
      alert('Помилка завантаження деталей');
    }
  };

  const handleShowPlannedDetails = async (item) => {
    try {
      const data = await analyticsAPI.getPlannedDetails({
        year: item.year,
        month: item.month,
        region: filters.region || '',
        company: filters.company || ''
      });
      setDetailsData(data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Помилка завантаження деталей запланованого доходу:', error);
      alert('Помилка завантаження деталей запланованого доходу');
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
    if (!confirm(`Ви впевнені, що хочете видалити витрати за ${getMonthName(item.month)} ${item.year} для ${item.region}?`)) {
      return;
    }
    try {
      await analyticsAPI.deleteAnalytics({
        region: item.region,
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
  // Компонент для управління категоріями витрат
  const CategoryManagerModal = ({ open, onClose }) => {
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
          minWidth: '600px',
          maxWidth: '800px',
          maxHeight: '80vh',
          overflowY: 'auto'
        }}>
          <h3 style={{color: '#fff', marginBottom: '16px'}}>
            Управління категоріями витрат
          </h3>
          <div style={{marginBottom: '16px'}}>
            {Object.entries(customExpenseCategories).map(([key, category]) => (
              <div key={key} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr auto',
                gap: '12px',
                marginBottom: '12px',
                padding: '12px',
                background: '#1a2636',
                borderRadius: '6px',
                alignItems: 'center'
              }}>
                <div>
                  <label style={{color: '#fff', display: 'block', marginBottom: '4px', fontSize: '12px'}}>
                    Назва категорії:
                  </label>
                  <input
                    type="text"
                    value={category.label}
                    onChange={(e) => handleUpdateCategory(key, 'label', e.target.value)}
                    onBlur={(e) => e.target.focus()} // Зберігаємо фокус
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
                  <label style={{color: '#fff', display: 'block', marginBottom: '4px', fontSize: '12px'}}>
                    Колір:
                  </label>
                  <input
                    type="color"
                    value={category.color}
                    onChange={(e) => handleUpdateCategory(key, 'color', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px',
                      borderRadius: '4px',
                      border: '1px solid #29506a',
                      background: '#22334a'
                    }}
                  />
                </div>
                <div>
                  <button
                    onClick={() => handleDeleteCategory(key)}
                    style={{
                      padding: '8px 12px',
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
                </div>
              </div>
            ))}
          </div>
                     <div style={{display: 'flex', gap: '8px', justifyContent: 'space-between'}}>
             <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
               <button
                 onClick={handleAddCategory}
                 style={{
                   padding: '8px 16px',
                   background: '#28a745',
                   color: '#fff',
                   border: 'none',
                   borderRadius: '4px',
                   cursor: 'pointer'
                 }}
               >
                 Додати категорію
               </button>
               <button
                 onClick={handleResetCategories}
                 style={{
                   padding: '8px 16px',
                   background: '#ffc107',
                   color: '#000',
                   border: 'none',
                   borderRadius: '4px',
                   cursor: 'pointer'
                 }}
               >
                 Скинути до стандартних
               </button>
               <button
                 onClick={handleCleanupOldCategories}
                 style={{
                   padding: '8px 16px',
                   background: '#dc3545',
                   color: '#fff',
                   border: 'none',
                   borderRadius: '4px',
                   cursor: 'pointer'
                 }}
               >
                 Очистити старі категорії
               </button>
               <button
                 onClick={handleSaveCategories}
                 style={{
                   padding: '8px 16px',
                   background: '#007bff',
                   color: '#fff',
                   border: 'none',
                   borderRadius: '4px',
                   cursor: 'pointer'
                 }}
               >
                 Зберегти
               </button>
             </div>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: '#6c757d',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Закрити
            </button>
          </div>
        </div>
      </div>
    );
  };
  // Компонент для редагування витрат
  const ExpenseModal = ({ open, onClose, expense, onSave, isNew = false }) => {
    const [expenses, setExpenses] = useState({});
    const [loadingExpenses, setLoadingExpenses] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);
    const [formData, setFormData] = useState({
      region: expense?.region || '',
      year: expense?.year || new Date().getFullYear(),
      month: expense?.month || new Date().getMonth() + 1
    });
    const [previousFormData, setPreviousFormData] = useState(null);
    
    // Завантаження витрат при відкритті модального вікна
    useEffect(() => {
      if (open) {
        // Отримуємо регіон, обробляючи можливі кілька значень через кому
        const expenseRegion = expense?.region || '';
        const regionValue = expenseRegion ? expenseRegion.split(',')[0].trim() : '';
        
        const initialFormData = {
          region: regionValue,
          year: expense?.year || new Date().getFullYear(),
          month: expense?.month || new Date().getMonth() + 1
        };
        
        setFormData(initialFormData);
        setPreviousFormData(initialFormData);
        setInitialLoad(true);
        
        // Якщо це редагування (не новий запис) і є регіон, рік та місяць - завантажуємо дані з API
        if (!isNew && regionValue && initialFormData.year && initialFormData.month) {
          const loadExpensesFromAPI = async () => {
            try {
              setLoadingExpenses(true);
              const analyticsData = await analyticsAPI.getAnalytics({
                region: regionValue,
                year: initialFormData.year,
                month: initialFormData.month,
                startYear: initialFormData.year,
                endYear: initialFormData.year,
                startMonth: initialFormData.month,
                endMonth: initialFormData.month
              });
              
              // Знаходимо запис для цього періоду
              const foundExpense = analyticsData.find(a => 
                a.region === regionValue && 
                a.year === initialFormData.year && 
                a.month === initialFormData.month
              );
              
              if (foundExpense && foundExpense.expenses) {
                // Спочатку створюємо об'єкт з усіма актуальними категоріями з нульовими значеннями
                const mergedExpenses = {};
                Object.keys(customExpenseCategories).forEach(key => {
                  mergedExpenses[key] = 0;
                });
                // Потім заповнюємо значеннями з foundExpense.expenses (якщо вони є)
                Object.keys(foundExpense.expenses).forEach(key => {
                  if (customExpenseCategories[key] !== undefined) {
                    mergedExpenses[key] = foundExpense.expenses[key] || 0;
                  }
                });
                setExpenses(mergedExpenses);
              } else {
                // Якщо витрат немає в базі, спочатку пробуємо використати дані з expense
                if (expense?.expenses && typeof expense.expenses === 'object') {
                  const mergedExpenses = {};
                  Object.keys(customExpenseCategories).forEach(key => {
                    mergedExpenses[key] = 0;
                  });
                  Object.keys(expense.expenses).forEach(key => {
                    if (customExpenseCategories[key] !== undefined) {
                      mergedExpenses[key] = expense.expenses[key] || 0;
                    }
                  });
                  setExpenses(mergedExpenses);
                } else {
                  // Встановлюємо всі витрати в 0
                  const zeroExpenses = {};
                  Object.keys(customExpenseCategories).forEach(key => {
                    zeroExpenses[key] = 0;
                  });
                  setExpenses(zeroExpenses);
                }
              }
            } catch (error) {
              console.error('Помилка завантаження витрат:', error);
              // При помилці використовуємо дані з expense як резервний варіант
              if (expense?.expenses && typeof expense.expenses === 'object') {
                const mergedExpenses = {};
                Object.keys(customExpenseCategories).forEach(key => {
                  mergedExpenses[key] = 0;
                });
                Object.keys(expense.expenses).forEach(key => {
                  if (customExpenseCategories[key] !== undefined) {
                    mergedExpenses[key] = expense.expenses[key] || 0;
                  }
                });
                setExpenses(mergedExpenses);
              } else {
                const zeroExpenses = {};
                Object.keys(customExpenseCategories).forEach(key => {
                  zeroExpenses[key] = 0;
                });
                setExpenses(zeroExpenses);
              }
            } finally {
              setLoadingExpenses(false);
            }
          };
          
          loadExpensesFromAPI();
        } else {
          // Для нових записів або якщо немає даних - встановлюємо нулі
          if (!regionValue || regionValue === '') {
            const zeroExpenses = {};
            Object.keys(customExpenseCategories).forEach(key => {
              zeroExpenses[key] = 0;
            });
            setExpenses(zeroExpenses);
          } else if (expense?.expenses && typeof expense.expenses === 'object') {
            // Використовуємо дані з expense як резервний варіант
            const mergedExpenses = {};
            Object.keys(customExpenseCategories).forEach(key => {
              mergedExpenses[key] = 0;
            });
            Object.keys(expense.expenses).forEach(key => {
              if (customExpenseCategories[key] !== undefined) {
                mergedExpenses[key] = expense.expenses[key] || 0;
              }
            });
            setExpenses(mergedExpenses);
          } else {
            const zeroExpenses = {};
            Object.keys(customExpenseCategories).forEach(key => {
              zeroExpenses[key] = 0;
            });
            setExpenses(zeroExpenses);
          }
        }
      } else {
        // При закритті скидаємо стан
        setInitialLoad(true);
        setPreviousFormData(null);
        setExpenses({});
      }
    }, [expense, open, customExpenseCategories, isNew]); // Додаємо isNew в залежності
    
    // Завантаження витрат при зміні регіону, року або місяця
    useEffect(() => {
      // Не завантажуємо при першому рендері або якщо модальне вікно закрите
      if (!open) return;
      
      // Не завантажуємо при першому відкритті (коли дані вже є в expense)
      if (initialLoad) {
        setInitialLoad(false);
        return;
      }
      
      // Перевіряємо, чи змінилися значення
      if (previousFormData && 
          previousFormData.region === formData.region &&
          previousFormData.year === formData.year &&
          previousFormData.month === formData.month) {
        // Значення не змінилися, не завантажуємо
        return;
      }
      
      // Не завантажуємо якщо регіон не вибрано
      if (!formData.region || !formData.year || !formData.month) {
        // Якщо регіон очищено, встановлюємо всі витрати в 0
        if (!formData.region) {
          const zeroExpenses = {};
          Object.keys(customExpenseCategories).forEach(key => {
            zeroExpenses[key] = 0;
          });
          setExpenses(zeroExpenses);
        } else {
          // Якщо тільки рік або місяць не вибрано, очищаємо витрати
          setExpenses({});
        }
        setPreviousFormData({ ...formData });
        return;
      }
      
      // Завантажуємо витрати при зміні значень
      const loadExpensesForPeriod = async () => {
        try {
          setLoadingExpenses(true);
          const regionSingle = formData.region.split(',')[0]?.trim() || formData.region;
          const analyticsData = await analyticsAPI.getAnalytics({
            region: regionSingle,
            year: formData.year,
            month: formData.month,
            startYear: formData.year,
            endYear: formData.year,
            startMonth: formData.month,
            endMonth: formData.month
          });
          
          // Знаходимо запис для цього періоду
          const foundExpense = analyticsData.find(a => 
            a.region === regionSingle && 
            a.year === formData.year && 
            a.month === formData.month
          );
          
          if (foundExpense && foundExpense.expenses) {
            // Спочатку створюємо об'єкт з усіма актуальними категоріями з нульовими значеннями
            const mergedExpenses = {};
            Object.keys(customExpenseCategories).forEach(key => {
              mergedExpenses[key] = 0;
            });
            // Потім заповнюємо значеннями з foundExpense.expenses (якщо вони є)
            Object.keys(foundExpense.expenses).forEach(key => {
              if (customExpenseCategories[key] !== undefined) {
                mergedExpenses[key] = foundExpense.expenses[key] || 0;
              }
            });
            setExpenses(mergedExpenses);
          } else {
            // Якщо витрат немає, встановлюємо всі витрати в 0
            const zeroExpenses = {};
            Object.keys(customExpenseCategories).forEach(key => {
              zeroExpenses[key] = 0;
            });
            setExpenses(zeroExpenses);
          }
          setPreviousFormData({ ...formData });
        } catch (error) {
          console.error('Помилка завантаження витрат:', error);
          // При помилці не очищаємо витрати, щоб не втратити дані
        } finally {
          setLoadingExpenses(false);
        }
      };
      
      // Затримка для уникнення занадто частих запитів
      const timeoutId = setTimeout(() => {
        loadExpensesForPeriod();
      }, 300);
      
      return () => clearTimeout(timeoutId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.region, formData.year, formData.month, open, initialLoad]);
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
            {isNew ? 'Додавання витрат' : 'Редагування витрат'}
          </h3>
          <div style={{marginBottom: '16px'}}>
            <div style={{marginBottom: '12px'}}>
              <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>
                Регіон сервісного відділу:
                {loadingExpenses && <span style={{color: '#ffa500', marginLeft: '8px'}}>(завантаження...)</span>}
              </label>
              <select
                value={formData.region}
                onChange={(e) => {
                  const newRegion = e.target.value;
                  setFormData(prev => ({...prev, region: newRegion}));
                  // Якщо регіон очищено, одразу встановлюємо всі витрати в 0
                  if (!newRegion) {
                    const zeroExpenses = {};
                    Object.keys(customExpenseCategories).forEach(key => {
                      zeroExpenses[key] = 0;
                    });
                    setExpenses(zeroExpenses);
                  }
                }}
                disabled={loadingExpenses}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #29506a',
                  background: loadingExpenses ? '#1a1a1a' : '#1a2636',
                  color: loadingExpenses ? '#666' : '#fff'
                }}
              >
                <option value="">Оберіть регіон</option>
                {uniqueRegions.map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
              <div>
                <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Рік:</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData(prev => ({...prev, year: parseInt(e.target.value)}))}
                  disabled={loadingExpenses}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #29506a',
                    background: loadingExpenses ? '#1a1a1a' : '#1a2636',
                    color: loadingExpenses ? '#666' : '#fff'
                  }}
                />
              </div>
              <div>
                <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>Місяць:</label>
                <select
                  value={formData.month}
                  onChange={(e) => setFormData(prev => ({...prev, month: parseInt(e.target.value)}))}
                  disabled={loadingExpenses}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #29506a',
                    background: loadingExpenses ? '#1a1a1a' : '#1a2636',
                    color: loadingExpenses ? '#666' : '#fff'
                  }}
                >
                  {Array.from({length: 12}, (_, i) => i + 1).map(month => (
                    <option key={month} value={month}>{getMonthName(month)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
                     <div style={{marginBottom: '16px'}}>
             {Object.entries(customExpenseCategories).map(([key, category]) => (
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
                // Валідація обов'язкових полів
                if (!formData.region) {
                  alert('Будь ласка, оберіть регіон');
                  return;
                }
                
                if (isNew) {
                  // Для нових витрат передаємо formData та expenses окремо
                  const dataToSave = {
                    ...formData,
                    expenses: expenses
                  };
                  onSave(dataToSave);
                } else {
                  // Для редагування передаємо formData та expenses, щоб можна було змінити регіон/рік/місяць
                  const dataToSave = {
                    ...formData,
                    expenses: expenses
                  };
                  onSave(dataToSave);
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
      margin: '32px 0',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      <h2>Аналітика</h2>
      {/* Фільтри */}
      <div style={{marginBottom: '16px', padding: '16px', background: '#1a2636', borderRadius: '8px'}}>
        <h3 style={{color: '#fff', marginBottom: '12px'}}>Фільтри</h3>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px'}}>
                                 <div>
              <label style={{color: '#fff', display: 'block', marginBottom: '4px'}}>
                Регіон сервісного відділу:
                {dataLoading && <span style={{color: '#ffa500', marginLeft: '8px'}}>(завантаження...)</span>}
                {user?.region && user.region !== 'Україна' && <span style={{color: '#4CAF50', marginLeft: '8px'}}>(автоматично встановлено)</span>}
              </label>
              <select
                value={filters.region}
                onChange={(e) => setFilters(prev => ({...prev, region: e.target.value}))}
                disabled={dataLoading || (user?.region && user.region !== 'Україна')}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #29506a',
                  background: (dataLoading || (user?.region && user.region !== 'Україна')) ? '#1a1a1a' : '#22334a',
                  color: (dataLoading || (user?.region && user.region !== 'Україна')) ? '#666' : '#fff'
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
            <button
              onClick={() => setShowCategoryManager(true)}
              style={{
                padding: '8px 16px',
                background: '#6f42c1',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Управління категоріями
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
            <div style={{ width: '100%', maxWidth: '100%' }}>
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
                  background: '#17a2b8',
                  padding: '20px',
                  borderRadius: '8px',
                  color: '#fff',
                  textAlign: 'center'
                }}>
                  <h3 style={{margin: '0 0 8px 0', fontSize: '16px'}}>Запланований дохід</h3>
                  <div style={{fontSize: '24px', fontWeight: 'bold'}}>
                    {formatCurrency(totals.plannedRevenue)}
                  </div>
                  <div style={{fontSize: '12px', marginTop: '4px'}}>
                    Роботи: {formatCurrency(totals.plannedWorkRevenue)} | Матеріали: {formatCurrency(totals.plannedMaterialsRevenue)}
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
                 <h3 style={{color: '#fff', marginBottom: '16px'}}>
                   Розбивка витрат
                   <span style={{fontSize: '12px', color: '#ccc', marginLeft: '8px', fontWeight: 'normal'}}>
                     (відображаються актуальні назви категорій)
                   </span>
                 </h3>
                 <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px'}}>
                   {Object.entries(totals.expenseBreakdown).map(([category, amount]) => {
                     // Знаходимо актуальну категорію за ключем
                     const actualCategory = customExpenseCategories[category];
                     const displayName = actualCategory?.label || category;
                     const displayColor = actualCategory?.color || '#ccc';
                     return (
                       <div key={category} style={{
                         background: '#22334a',
                         padding: '12px',
                         borderRadius: '6px',
                         borderLeft: `4px solid ${displayColor}`
                       }}>
                         <div style={{color: '#fff', fontSize: '14px', marginBottom: '4px'}}>
                           {displayName}
                         </div>
                         <div style={{color: '#00bfff', fontSize: '18px', fontWeight: 'bold'}}>
                           {formatCurrency(amount)}
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </div>
              {/* Графік по місяцях */}
              <div style={{
                background: '#fff',
                padding: '20px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                opacity: 1,
                position: 'relative',
                zIndex: 1
              }}>
                <h3 style={{color: '#333', marginBottom: '16px'}}>Динаміка по місяцях</h3>
                <div style={{overflowX: 'auto', background: '#fff', opacity: 1}}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    color: '#333',
                    background: '#fff',
                    opacity: 1
                  }}>
                    <thead>
                      <tr>
                        <th style={{padding: '12px', textAlign: 'left', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>
                          Період
                        </th>
                        <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>
                          Дохід по виконаним роботам
                        </th>
                        <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>
                          Дохід по матеріалам
                        </th>
                        <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>
                          Загальний дохід
                        </th>
                        <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>
                          Запланований дохід
                        </th>
                        <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>
                          Витрати
                        </th>
                        <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>
                          Прибуток
                        </th>
                        <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>
                          Рентабельність
                        </th>
                        <th style={{padding: '12px', textAlign: 'center', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>
                          Дії
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.map((item, index) => (
                        <tr key={index} style={{
                          background: index % 2 === 0 ? '#fff' : '#f9f9f9',
                          borderBottom: '1px solid #e0e0e0',
                          opacity: 1
                        }}>
                          <td style={{padding: '12px', color: '#333', background: index % 2 === 0 ? '#fff' : '#f9f9f9', opacity: 1}}>
                            {getMonthName(item.month)} {item.year}
                            <div style={{fontSize: '12px', color: '#666'}}>
                              {item.region || 'Загальні дані'}
                            </div>
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: '#28a745', opacity: 1, background: index % 2 === 0 ? '#fff' : '#f9f9f9'}}>
                            {formatCurrency(item.workRevenue || 0)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: '#28a745', opacity: 1, background: index % 2 === 0 ? '#fff' : '#f9f9f9'}}>
                            {formatCurrency(item.materialsRevenue || 0)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: '#28a745', fontWeight: 'bold', opacity: 1, background: index % 2 === 0 ? '#fff' : '#f9f9f9'}}>
                            {formatCurrency(item.revenue)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: '#17a2b8', opacity: 1, background: index % 2 === 0 ? '#fff' : '#f9f9f9'}}>
                            {formatCurrency(item.plannedRevenue || 0)}
                            <div style={{fontSize: '11px', color: '#666', opacity: 1}}>
                              Роботи: {formatCurrency(item.plannedWorkRevenue || 0)} | Матеріали: {formatCurrency(item.plannedMaterialsRevenue || 0)}
                            </div>
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: '#dc3545', opacity: 1, background: index % 2 === 0 ? '#fff' : '#f9f9f9'}}>
                            {formatCurrency(item.totalExpenses)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: item.profit >= 0 ? '#28a745' : '#dc3545', opacity: 1, background: index % 2 === 0 ? '#fff' : '#f9f9f9'}}>
                            {formatCurrency(item.profit)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', color: item.profitability >= 0 ? '#28a745' : '#dc3545', opacity: 1, background: index % 2 === 0 ? '#fff' : '#f9f9f9'}}>
                            {formatPercent(item.profitability)}
                          </td>
                          <td style={{padding: '12px', textAlign: 'center', opacity: 1, background: index % 2 === 0 ? '#fff' : '#f9f9f9'}}>
                            <div style={{display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap'}}>
                              <button
                                onClick={() => handleShowDetails(item)}
                                style={{
                                  padding: '4px 8px',
                                  background: '#28a745',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                Деталізація
                              </button>
                              <button
                                onClick={() => handleShowPlannedDetails(item)}
                                style={{
                                  padding: '4px 8px',
                                  background: '#17a2b8',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                Деталізація ЗД
                              </button>
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

              {/* Розбивка по регіонах (суми за обраний період) */}
              <div style={{
                background: '#fff',
                padding: '20px',
                borderRadius: '8px',
                marginTop: '24px',
                border: '1px solid #e0e0e0',
                opacity: 1,
                position: 'relative',
                zIndex: 1
              }}>
                <h3 style={{color: '#333', marginBottom: '16px'}}>Розбивка по регіонах</h3>
                {(() => {
                  // Агрегуємо по регіонах за весь вибір фільтрів
                  const regionalTotals = {};
                  analytics.forEach(item => {
                    const breakdown = item.regionalBreakdown || {};
                    Object.keys(breakdown).forEach(regionName => {
                      if (!regionalTotals[regionName]) {
                        regionalTotals[regionName] = { workRevenue: 0, materialsRevenue: 0 };
                      }
                      regionalTotals[regionName].workRevenue += breakdown[regionName].workRevenue || 0;
                      regionalTotals[regionName].materialsRevenue += breakdown[regionName].materialsRevenue || 0;
                    });
                  });
                  const rows = Object.entries(regionalTotals).sort((a, b) => (b[1].workRevenue + b[1].materialsRevenue) - (a[1].workRevenue + a[1].materialsRevenue));
                  if (rows.length === 0) {
                    return <div style={{color: '#666'}}>Немає даних для відображення.</div>;
                  }
                  return (
                    <div style={{overflowX: 'auto', background: '#fff', opacity: 1}}>
                      <table style={{width: '100%', borderCollapse: 'collapse', color: '#333', background: '#fff', opacity: 1}}>
                        <thead>
                          <tr>
                            <th style={{padding: '12px', textAlign: 'left', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>Регіон</th>
                            <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>Дохід робіт</th>
                            <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>Дохід матеріали</th>
                            <th style={{padding: '12px', textAlign: 'right', background: '#f5f5f5', borderBottom: '1px solid #ddd', color: '#333', opacity: 1}}>Загальний дохід</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(([regionName, sums], idx) => (
                            <tr key={regionName} style={{background: idx % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #e0e0e0', opacity: 1}}>
                              <td style={{padding: '12px', color: '#333', opacity: 1, background: idx % 2 === 0 ? '#fff' : '#f9f9f9'}}>{regionName}</td>
                              <td style={{padding: '12px', textAlign: 'right', color: '#28a745', opacity: 1, background: idx % 2 === 0 ? '#fff' : '#f9f9f9'}}>{formatCurrency(sums.workRevenue)}</td>
                              <td style={{padding: '12px', textAlign: 'right', color: '#28a745', opacity: 1, background: idx % 2 === 0 ? '#fff' : '#f9f9f9'}}>{formatCurrency(sums.materialsRevenue)}</td>
                              <td style={{padding: '12px', textAlign: 'right', color: '#28a745', fontWeight: 'bold', opacity: 1, background: idx % 2 === 0 ? '#fff' : '#f9f9f9'}}>{formatCurrency((sums.workRevenue || 0) + (sums.materialsRevenue || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
                                           {activeTab === 'details' && (
                        <div style={{ width: '100%', boxSizing: 'border-box' }}>
                          <DetailedReportTab
                            filters={filters}
                            uniqueRegions={uniqueRegions}
                            uniqueCompanies={uniqueCompanies}
                            formatCurrency={formatCurrency}
                            formatPercent={formatPercent}
                            getMonthName={getMonthName}
                          />
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
       {/* Модальне вікно управління категоріями */}
       <CategoryManagerModal
         open={showCategoryManager}
         onClose={() => setShowCategoryManager(false)}
       />
       {/* Модальне вікно деталей розрахунку */}
       <DetailsModal
         open={showDetailsModal}
         onClose={() => setShowDetailsModal(false)}
         data={detailsData}
       />
     </div>
   );
 }

// Компонент для модального вікна деталей розрахунку
const DetailsModal = ({ open, onClose, data }) => {
  if (!open || !data) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'UAH',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('uk-UA');
  };

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
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: '#22334a',
        padding: '24px',
        borderRadius: '8px',
        minWidth: '800px',
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <h3 style={{color: '#fff', marginBottom: '16px'}}>
          Деталізація розрахунку доходу за {data.monthName} {data.year}
        </h3>
        
        {/* Загальна інформація */}
        <div style={{marginBottom: '20px', padding: '16px', background: '#1a2636', borderRadius: '8px'}}>
          <h4 style={{color: '#fff', marginBottom: '12px'}}>Загальна інформація</h4>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px'}}>
            <div>
              <strong style={{color: '#00bfff'}}>Дохід по виконаним роботам:</strong>
              <div style={{color: '#28a745', fontSize: '18px', fontWeight: 'bold'}}>
                {formatCurrency(data.workRevenue)}
              </div>
            </div>
            <div>
              <strong style={{color: '#00bfff'}}>Дохід по матеріалам:</strong>
              <div style={{color: '#28a745', fontSize: '18px', fontWeight: 'bold'}}>
                {formatCurrency(data.materialsRevenue)}
              </div>
            </div>
            <div>
              <strong style={{color: '#00bfff'}}>Загальний дохід:</strong>
              <div style={{color: '#28a745', fontSize: '18px', fontWeight: 'bold'}}>
                {formatCurrency(data.totalRevenue)}
              </div>
            </div>
          </div>
        </div>

        {/* Деталі по заявках для доходу по роботах */}
        <div style={{marginBottom: '20px'}}>
          <h4 style={{color: '#fff', marginBottom: '12px'}}>Заявки для розрахунку доходу по виконаним роботам</h4>
          <div style={{overflowX: 'auto'}}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              color: '#fff',
              background: '#1a2636',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <thead>
                <tr style={{background: '#22334a'}}>
                  <th style={{padding: '12px', textAlign: 'left'}}>Дата виконання</th>
                  <th style={{padding: '12px', textAlign: 'left'}}>Дата затвердження</th>
                  <th style={{padding: '12px', textAlign: 'left'}}>Інженери</th>
                  <th style={{padding: '12px', textAlign: 'left'}}>Клієнт</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Вартість робіт</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Базова премія (25%)</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Фактична премія</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Дохід (×3)</th>
                </tr>
              </thead>
              <tbody>
                {data.workTasks?.map((task, index) => (
                  <tr key={index} style={{
                    background: index % 2 === 0 ? '#1a2636' : '#22334a',
                    borderBottom: '1px solid #29506a'
                  }}>
                    <td style={{padding: '12px'}}>{formatDate(task.workDate)}</td>
                    <td style={{padding: '12px'}}>{formatDate(task.approvalDate)}</td>
                    <td style={{padding: '12px'}}>
                      {[task.engineer1, task.engineer2].filter(Boolean).join(', ')}
                    </td>
                    <td style={{padding: '12px'}}>{task.client}</td>
                    <td style={{padding: '12px', textAlign: 'right'}}>{formatCurrency(task.workPrice)}</td>
                    <td style={{padding: '12px', textAlign: 'right'}}>{formatCurrency(task.baseBonus)}</td>
                    <td style={{padding: '12px', textAlign: 'right', color: '#ffc107'}}>
                      {formatCurrency(task.actualBonus)}
                    </td>
                    <td style={{padding: '12px', textAlign: 'right', color: '#28a745', fontWeight: 'bold'}}>
                      {formatCurrency(task.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Деталі по заявках для доходу по матеріалам */}
        <div style={{marginBottom: '20px'}}>
          <h4 style={{color: '#fff', marginBottom: '12px'}}>Заявки для розрахунку доходу по матеріалам</h4>
          <div style={{overflowX: 'auto'}}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              color: '#fff',
              background: '#1a2636',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <thead>
                <tr style={{background: '#22334a'}}>
                  <th style={{padding: '12px', textAlign: 'left'}}>Дата виконання</th>
                  <th style={{padding: '12px', textAlign: 'left'}}>Клієнт</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Олива</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Фільтри</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Антифриз</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Інші</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Загальна сума</th>
                  <th style={{padding: '12px', textAlign: 'right'}}>Дохід (÷4)</th>
                </tr>
              </thead>
              <tbody>
                {data.materialsTasks?.map((task, index) => (
                  <tr key={index} style={{
                    background: index % 2 === 0 ? '#1a2636' : '#22334a',
                    borderBottom: '1px solid #29506a'
                  }}>
                    <td style={{padding: '12px'}}>{formatDate(task.workDate)}</td>
                    <td style={{padding: '12px'}}>{task.client}</td>
                    <td style={{padding: '12px', textAlign: 'right'}}>{formatCurrency(task.oilTotal)}</td>
                    <td style={{padding: '12px', textAlign: 'right'}}>{formatCurrency(task.filtersTotal)}</td>
                    <td style={{padding: '12px', textAlign: 'right'}}>{formatCurrency(task.antifreezeSum)}</td>
                    <td style={{padding: '12px', textAlign: 'right'}}>{formatCurrency(task.otherSum)}</td>
                    <td style={{padding: '12px', textAlign: 'right'}}>{formatCurrency(task.totalMaterials)}</td>
                    <td style={{padding: '12px', textAlign: 'right', color: '#28a745', fontWeight: 'bold'}}>
                      {formatCurrency(task.materialsRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Алгоритм розрахунку */}
        <div style={{marginBottom: '20px', padding: '16px', background: '#1a2636', borderRadius: '8px'}}>
          <h4 style={{color: '#fff', marginBottom: '12px'}}>Алгоритм розрахунку</h4>
          <div style={{color: '#ccc', fontSize: '14px', lineHeight: '1.6'}}>
            <p><strong>Дохід по виконаним роботам:</strong></p>
            <ul style={{marginLeft: '20px', marginBottom: '16px'}}>
              <li>Базова премія = Вартість робіт × 25%</li>
              <li>Якщо 1 інженер: Фактична премія = Базова премія</li>
              <li>Якщо 2 інженери: Фактична премія = Базова премія (кожен отримує половину)</li>
              <li>Дохід = Фактична премія × 3</li>
            </ul>
            <p><strong>Дохід по матеріалам:</strong></p>
            <ul style={{marginLeft: '20px'}}>
              <li>Загальна сума матеріалів = Олива + Фільтри + Антифриз + Інші</li>
              <li>Дохід = Загальна сума матеріалів ÷ 4</li>
            </ul>
          </div>
        </div>

        <div style={{display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}; 