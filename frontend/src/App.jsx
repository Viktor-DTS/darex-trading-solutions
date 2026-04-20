import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { clearTasksCache } from './components/TaskTable';
import OperatorDashboard from './components/OperatorDashboard';
import WarehouseDashboard from './components/WarehouseDashboard';
import AccountantDashboard from './components/AccountantDashboard';
import AccountantApprovalDashboard from './components/AccountantApprovalDashboard';
import RegionalDashboard from './components/RegionalDashboard';
import AdminDashboard from './components/AdminDashboard';
import ReportBuilder from './components/ReportBuilder';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import TasksStatisticsBar from './components/TasksStatisticsBar';
import EquipmentPage from './components/equipment/EquipmentPage';
import InventoryDashboard from './components/InventoryDashboard';
import ManagerDashboard from './components/ManagerDashboard';
import TestingDashboard from './components/TestingDashboard';
import FinancialDashboard from './components/FinancialDashboard';
import SalesAccountingDashboard from './components/SalesAccountingDashboard';
import ProcurementDashboard from './components/ProcurementDashboard';
import API_BASE_URL from './config';
import { resetAuthSessionExpiredState, tryHandleUnauthorizedResponse } from './utils/authSession';

// Доступні панелі
const PANELS = [
  { id: 'service', label: 'Сервісна служба', icon: '🔧' },
  { id: 'operator', label: 'Оператор', icon: '📞' },
  { id: 'warehouse', label: 'Зав. склад', icon: '📦' },
  { id: 'inventory', label: 'Складський облік', icon: '📋' },
  { id: 'manager', label: 'Менеджери', icon: '👔' },
  { id: 'salesAccounting', label: 'Відділ продаж — бухгалтерія', icon: '📒' },
  { id: 'testing', label: 'Відділ тестування', icon: '🧪' },
  { id: 'finance', label: 'Фінансовий відділ', icon: '💹' },
  { id: 'accountant', label: 'Бух рахунки', icon: '📄' },
  { id: 'accountantApproval', label: 'Бух на затвердженні', icon: '💰' },
  { id: 'regional', label: 'Регіональний керівник', icon: '👔' },
  { id: 'reports', label: 'Звіти', icon: '📊' },
  { id: 'analytics', label: 'Аналітика', icon: '📈' },
  { id: 'procurement', label: 'Відділ закупівель', icon: '🛒' },
  { id: 'admin', label: 'Адміністратор', icon: '⚙️' },
];

// Права доступу за замовчуванням (резервні, якщо база недоступна)
const DEFAULT_ACCESS_RULES = {
  admin: ['service', 'operator', 'warehouse', 'inventory', 'manager', 'salesAccounting', 'testing', 'finance', 'accountant', 'accountantApproval', 'regional', 'reports', 'analytics', 'procurement', 'admin'],
  administrator: ['service', 'operator', 'warehouse', 'inventory', 'manager', 'salesAccounting', 'testing', 'finance', 'accountant', 'accountantApproval', 'regional', 'reports', 'analytics', 'procurement', 'admin'],
  operator: ['operator'],
  accountant: ['accountant', 'accountantApproval', 'salesAccounting', 'inventory', 'reports', 'analytics'],
  buhgalteria: ['accountant', 'accountantApproval', 'salesAccounting', 'inventory', 'reports', 'analytics'],
  warehouse: ['warehouse', 'inventory', 'service'],
  zavsklad: ['warehouse', 'inventory', 'service'],
  regkerivn: ['regional', 'service', 'reports', 'analytics', 'inventory', 'manager'],
  regional: ['regional', 'service', 'reports', 'analytics', 'inventory', 'manager'],
  service: ['service'],
  testing: ['testing'],
  tester: ['testing'],
  manager: ['manager', 'inventory'],
  finance: ['finance'],
  /** Лише фінпанель; список панелей примусово фіксується після завантаження правил (deny-by-default). Роль: GolovnKervServ. */
  golovnkervserv: ['finance'],
  /** Відділ закупівель (виконавець заявок — роль VidZakupok у бекенді: vidzakupok). */
  vidzakupok: ['procurement'],
};

// Функція для конвертації правил з бази { role: { panel: 'full'|'read'|'none' } } в масив панелей
const convertAccessRules = (dbRules) => {
  if (!dbRules || typeof dbRules !== 'object') return DEFAULT_ACCESS_RULES;
  
  const converted = {};
  Object.keys(dbRules).forEach(role => {
    const panels = dbRules[role];
    if (panels && typeof panels === 'object') {
      converted[role] = Object.keys(panels).filter(panelId => 
        panels[panelId] === 'full' || panels[panelId] === 'read'
      );
      
      // «Складський облік»: для завскладу — якщо не явне 'none' (зокрема ключ відсутній у старих даних).
      // Для лише бухгалтерії — тільки якщо в БД явно full/read; інакше збігається з матрицею (нема ключа → «Немає»).
      const inv = panels.inventory;
      if (!converted[role].includes('inventory')) {
        if (converted[role].includes('warehouse') && inv !== 'none') {
          converted[role].push('inventory');
        } else if (
          converted[role].includes('accountant') &&
          (inv === 'full' || inv === 'read')
        ) {
          converted[role].push('inventory');
        }
      }
    }
  });
  
  // Завжди додаємо адмін правила
  converted.admin = DEFAULT_ACCESS_RULES.admin;
  converted.administrator = DEFAULT_ACCESS_RULES.administrator;
  
  return converted;
};

// Функція для отримання доступних панелей для ролі
const getAvailablePanelsForRole = (role, accessRules) => {
  const rules = accessRules || DEFAULT_ACCESS_RULES;
  const allowedIds = rules[role] || rules['service'] || ['service'];
  return PANELS.filter(p => allowedIds.includes(p.id));
};

// Функція для отримання панелі за замовчуванням для ролі
const getDefaultPanelForRole = (role, accessRules) => {
  const rules = accessRules || DEFAULT_ACCESS_RULES;
  const rolePanels = rules[role] || rules['service'] || ['service'];
  return rolePanels[0] || 'service';
};

// Функція для логування подій
const logEvent = async (eventData, token = null) => {
  try {
    const authToken = token || localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    await fetch(`${API_BASE_URL}/event-log`, {
      method: 'POST',
      headers,
      body: JSON.stringify(eventData)
    });
  } catch (error) {
    // Ігноруємо помилки логування
  }
};

// Функція для оновлення активності користувача
const updateUserActivity = async (login) => {
  try {
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE_URL}/users/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ login })
    });
  } catch (error) {
    // Ігноруємо помилку
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPanel, setCurrentPanel] = useState(null);
  const [accessRules, setAccessRules] = useState(DEFAULT_ACCESS_RULES);

  // Завантаження прав доступу з бази
  const loadAccessRules = async () => {
    try {
      const token = localStorage.getItem('token');
      // Якщо немає токена - повертаємо дефолтні правила
      if (!token) {
        return DEFAULT_ACCESS_RULES;
      }
      
      const res = await fetch(`${API_BASE_URL}/accessRules`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (tryHandleUnauthorizedResponse(res)) {
        return DEFAULT_ACCESS_RULES;
      }

      if (res.ok) {
        const dbRules = await res.json();
        const converted = convertAccessRules(dbRules);
        // Об'єднуємо з дефолтними (щоб не втратити ролі які не налаштовані)
        const merged = { ...DEFAULT_ACCESS_RULES };
        Object.keys(converted).forEach(role => {
          if (converted[role] && converted[role].length > 0) {
            merged[role] = converted[role];
          }
        });
        merged.golovnkervserv = ['finance'];
        setAccessRules(merged);
        return merged;
      }
    } catch (error) {
      console.error('Помилка завантаження прав доступу:', error);
    }
    const fallback = { ...DEFAULT_ACCESS_RULES };
    fallback.golovnkervserv = ['finance'];
    return fallback;
  };

  useEffect(() => {
    const initApp = async () => {
      // Завантажуємо права доступу
      const rules = await loadAccessRules();
      
      // Перевірка збереженого токену
      const token = localStorage.getItem('token');
      if (token) {
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Перевіряємо валідність токену через API
        if (userData.login) {
          try {
            const response = await fetch(`${API_BASE_URL}/users/${userData.login}`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            // Якщо токен валідний - відновлюємо сесію
            if (response.ok) {
              const updatedUser = await response.json();
              setUser(updatedUser);
              
          // Встановлюємо панель за замовчуванням або збережену
              const savedPanel = localStorage.getItem('currentPanel');
              const defaultPanel = getDefaultPanelForRole(updatedUser.role, rules);
              const availablePanels = getAvailablePanelsForRole(updatedUser.role, rules).map(p => p.id);
              
              if (savedPanel && availablePanels.includes(savedPanel)) {
                setCurrentPanel(savedPanel);
              } else {
                setCurrentPanel(defaultPanel);
              }
            } else if (response.status === 401) {
              tryHandleUnauthorizedResponse(response);
            } else {
              // Інша помилка (не 401) - використовуємо збережені дані
              // Можливо, тимчасові проблеми з сервером
              console.warn('Помилка перевірки токену (не 401), використовуємо збережені дані:', response.status);
              setUser(userData);
              
              const savedPanel = localStorage.getItem('currentPanel');
              const defaultPanel = getDefaultPanelForRole(userData.role, rules);
              const availablePanels = getAvailablePanelsForRole(userData.role, rules).map(p => p.id);
              
              if (savedPanel && availablePanels.includes(savedPanel)) {
                setCurrentPanel(savedPanel);
              } else {
                setCurrentPanel(defaultPanel);
              }
            }
          } catch (error) {
            // Помилка мережі або інша помилка - використовуємо збережені дані
            // Не очищаємо токен, оскільки це може бути тимчасовою проблемою
            console.warn('Помилка перевірки токену (мережа), використовуємо збережені дані:', error);
            setUser(userData);
            
          const savedPanel = localStorage.getItem('currentPanel');
          const defaultPanel = getDefaultPanelForRole(userData.role, rules);
          const availablePanels = getAvailablePanelsForRole(userData.role, rules).map(p => p.id);
          
          if (savedPanel && availablePanels.includes(savedPanel)) {
            setCurrentPanel(savedPanel);
          } else {
            setCurrentPanel(defaultPanel);
          }
          }
        } else {
          // Немає даних користувача - очищаємо токен та кеш заявок
          localStorage.removeItem('token');
          clearTasksCache();
        }
      }
      setLoading(false);
    };
    
    initApp();
  }, []);

  useEffect(() => {
    const onAuthExpired = () => {
      setUser(null);
      setCurrentPanel(null);
      clearTasksCache();
    };
    window.addEventListener('dts-auth-expired', onAuthExpired);
    return () => window.removeEventListener('dts-auth-expired', onAuthExpired);
  }, []);

  // Відстеження закриття вкладки/браузера
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user) {
        // Використовуємо sendBeacon для надійної відправки при закритті
        const data = JSON.stringify({
          userId: user._id || user.id,
          userName: user.name || user.login,
          userRole: user.role,
          action: 'logout',
          entityType: 'session',
          description: `Користувач ${user.name || user.login} закрив вкладку/браузер`
        });
        navigator.sendBeacon(`${API_BASE_URL}/event-log`, data);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user]);

  // Відстеження активності користувача (для онлайн статусу)
  useEffect(() => {
    if (!user?.login) return;
    
    // Оновлюємо активність одразу при вході
    updateUserActivity(user.login);
    
    // Оновлюємо активність кожні 30 секунд
    const activityInterval = setInterval(() => {
      updateUserActivity(user.login);
    }, 30000);
    
    return () => clearInterval(activityInterval);
  }, [user?.login]);

  const handleLogin = async (userData, token) => {
    resetAuthSessionExpiredState();
    setUser(userData);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Завантажуємо актуальні права доступу
    const rules = await loadAccessRules();
    
    // Встановлюємо панель за замовчуванням
    const defaultPanel = getDefaultPanelForRole(userData.role, rules);
    setCurrentPanel(defaultPanel);
    localStorage.setItem('currentPanel', defaultPanel);
    
    // Логуємо вхід
    logEvent({
      userId: userData._id || userData.id,
      userName: userData.name || userData.login,
      userRole: userData.role,
      action: 'login',
      entityType: 'session',
      description: `Користувач ${userData.name || userData.login} увійшов в систему`
    }, token);
  };

  const handleLogout = () => {
    // Зберігаємо токен перед видаленням для логування
    const token = localStorage.getItem('token');
    
    // Логуємо вихід перед очищенням даних
    if (user) {
      logEvent({
        userId: user._id || user.id,
        userName: user.name || user.login,
        userRole: user.role,
        action: 'logout',
        entityType: 'session',
        description: `Користувач ${user.name || user.login} вийшов з системи`
      }, token);
    }
    
    setUser(null);
    setCurrentPanel(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentPanel');
    clearTasksCache();
  };

  const handlePanelChange = (panelId) => {
    setCurrentPanel(panelId);
    localStorage.setItem('currentPanel', panelId);
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'var(--background)'
      }}>
        <div style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
          Завантаження...
        </div>
      </div>
    );
  }

  // Рендеринг відповідної панелі
  const renderPanel = () => {
    switch (currentPanel) {
      case 'operator':
        return <OperatorDashboard user={user} />;
      case 'warehouse':
        return <WarehouseDashboard user={user} />;
      case 'inventory':
        return <InventoryDashboard user={user} />;
      case 'manager':
        return <ManagerDashboard user={user} />;
      case 'salesAccounting':
        return <SalesAccountingDashboard />;
      case 'finance':
        return <FinancialDashboard user={user} />;
      case 'testing':
        return <TestingDashboard user={user} />;
      case 'accountant':
        return <AccountantDashboard user={user} />;
      case 'accountantApproval':
        return <AccountantApprovalDashboard user={user} />;
      case 'regional':
        return <RegionalDashboard user={user} />;
      case 'reports':
        return <ReportBuilder user={user} />;
      case 'analytics':
        return <AnalyticsDashboard user={user} />;
      case 'procurement':
        return <ProcurementDashboard user={user} />;
      case 'admin':
        return <AdminDashboard user={user} />;
      case 'service':
      default:
        return <Dashboard user={user} panelType="service" />;
    }
  };

  // Отримуємо доступні панелі для поточного користувача
  const availablePanels = user ? getAvailablePanelsForRole(user.role, accessRules) : [];

  return (
    <BrowserRouter>
      <Routes>
        {/* Роут для сторінки обладнання (з QR-коду) */}
        <Route 
          path="/equipment/:id" 
          element={
            <div className="app">
              <EquipmentPage />
            </div>
          } 
        />
        {/* Основний роут - залишаємо поточну логіку */}
        <Route 
          path="*" 
          element={
            <div className="app">
              {!user ? (
                <Login onLogin={handleLogin} />
              ) : (
                <div className="app-container">
                  {/* Верхня панель - завжди показуємо */}
                  <nav className="panel-selector">
                    <div className="panel-selector-left">
                      {availablePanels.map(panel => (
                        <button
                          key={panel.id}
                          className={`panel-btn ${currentPanel === panel.id ? 'active' : ''}`}
                          onClick={() => handlePanelChange(panel.id)}
                        >
                          <span className="panel-icon">{panel.icon}</span>
                          <span className="panel-label">{panel.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="panel-selector-right">
                      <span className="user-info">{user.name || user.login}</span>
                      <button className="logout-btn" onClick={handleLogout}>Вийти</button>
                    </div>
                  </nav>
                  {/* Основний вміст */}
                  <div className={`panel-content with-selector ${!['manager', 'inventory'].includes(currentPanel) ? 'with-statistics-bar' : ''}`}>
                    {renderPanel()}
                  </div>
                  
                  {/* Панель статистики заявок — приховано в Менеджери та Складський облік */}
                  {!['manager', 'inventory'].includes(currentPanel) &&
                    String(user?.role || '').toLowerCase() !== 'golovnkervserv' && (
                      <TasksStatisticsBar user={user} />
                    )}
                </div>
              )}
            </div>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
