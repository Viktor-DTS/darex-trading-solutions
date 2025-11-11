import React, { Suspense } from 'react'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import './App.css'
import './i18n'
import { useTranslation } from 'react-i18next'
import logoImg from './assets/Designer (4).jpeg'
import Login from './Login'
import Sidebar from './Sidebar'
import ModalTaskForm, { fields as allTaskFields } from './ModalTaskForm'
import TaskTable from './components/TaskTable'
import { useLazyData } from './hooks/useLazyData'
import ExcelImportModal from './components/ExcelImportModal'
import ServiceReminderModal from './components/ServiceReminderModal'
import MobileViewArea from './components/MobileViewArea'
// Підключення кастомного шрифту Roboto для jsPDF відбувається через <script src="/Roboto-normal.js"></script> у public/index.html
// Додаю імпорт на початку файлу

// Lazy loading для великих компонентів
const FinancialReport = React.lazy(() => import('./FinancialReport'));
const ReportsList = React.lazy(() => import('./ReportsList'));
const AccountantArea = React.lazy(() => import('./areas/AccountantArea'));
const AccountantApprovalArea = React.lazy(() => import('./areas/AccountantApprovalArea'));
const WarehouseArea = React.lazy(() => import('./areas/WarehouseArea'));
const OperatorArea = React.lazy(() => import('./areas/OperatorArea'));
import MaterialsAnalysisArea from './areas/MaterialsAnalysisArea';
import ReportBuilder from './areas/ReportBuilder';
import EventLogArea from './areas/EventLogArea';
import AnalyticsArea from './areas/AnalyticsArea';
import NotificationSettings from './components/NotificationSettings';
import UserNotificationManager from './components/UserNotificationManager';
import NotificationDebugPanel from './components/NotificationDebugPanel';
import * as XLSX from 'xlsx-js-style';
import { columnsSettingsAPI } from './utils/columnsSettingsAPI';
import API_BASE_URL from './config.js';
import authenticatedFetch from './utils/api.js';
import { tasksAPI } from './utils/tasksAPI';
import { importedTasksAPI } from './utils/importedTasksAPI';
import { accessRulesAPI } from './utils/accessRulesAPI';
import { rolesAPI } from './utils/rolesAPI';
import { regionsAPI } from './utils/regionsAPI';
import { backupAPI } from './utils/backupAPI';
import { activityAPI } from './utils/activityAPI';
import keepAliveService from './utils/keepAlive.js';
import { analyticsAPI } from './utils/analyticsAPI';
const roles = [
  { value: 'admin', label: 'Адміністратор' },
  { value: 'service', label: 'Сервісна служба' },
  { value: 'operator', label: 'Оператор' },
  { value: 'warehouse', label: 'Зав. склад' },
  { value: 'accountant', label: 'Бух. рахунки' },
  { value: 'regional', label: 'Регіональний керівник' },
];
// === Єдиний шаблон заявки для всіх областей ===
const initialTask = {
  id: null,
  status: '',
  requestDate: '',
  requestDesc: '',
  serviceRegion: '',
  address: '',
  equipmentSerial: '',
  equipment: '',
  work: '',
  date: '',
  paymentDate: '',
  engineer1: '',
  engineer2: '',
  client: '',
  requestNumber: '',
  invoice: '',
  paymentType: '',
  serviceTotal: '',
  approvedByWarehouse: null,
  warehouseComment: '',
  approvedByAccountant: null,
  accountantComment: '',
  accountantComments: '',
  approvedByRegionalManager: null,
  regionalManagerComment: '',
  comments: '',
  oilType: '',
  oilUsed: '',
  oilPrice: '',
  oilTotal: '',
  filterName: '',
  filterCount: '',
  filterPrice: '',
  filterSum: '',
  fuelFilterName: '',
  fuelFilterCount: '',
  fuelFilterPrice: '',
  fuelFilterSum: '',
  antifreezeType: '',
  antifreezeL: '',
  antifreezePrice: '',
  antifreezeSum: '',
  otherMaterials: '',
  otherSum: '',
  workPrice: '',
  perDiem: '',
  living: '',
  otherExp: '',
  carNumber: '',
  transportKm: '',
  transportSum: '',
};
// --- Додаю компонент для керування доступом до вкладок ---
// Функція для перевірки статусу підтвердження
function isApproved(value) {
  return value === true || value === 'Підтверджено';
}
// Функція для перевірки статусу відмови
function isRejected(value) {
  return value === false || value === 'Відмова';
}
// Функція для перевірки статусу на розгляді
function isPending(value) {
  return value === null || value === undefined || value === 'На розгляді';
}
const getDefaultAccess = (rolesList = []) => {
  const roles = rolesList.length > 0 ? rolesList : [
    { value: 'admin', label: 'Адміністратор' },
    { value: 'service', label: 'Сервісна служба' },
    { value: 'operator', label: 'Оператор' },
    { value: 'warehouse', label: 'Зав. склад' },
    { value: 'accountant', label: 'Бух. рахунки' },
    { value: 'regional', label: 'Регіональний керівник' },
  ];
  const tabs = [
    { key: 'service', label: 'Сервісна служба' },
    { key: 'operator', label: 'Оператор' },
    { key: 'warehouse', label: 'Зав. склад' },
    { key: 'accountant', label: 'Бух. рахунки' },
    { key: 'accountant-approval', label: 'Бух. на Затвердженні' },
    { key: 'regional', label: 'Регіональний керівник' },
    { key: 'admin', label: 'Адміністратор' },
    { key: 'reports', label: 'Звіти' },
    { key: 'materials', label: 'Аналіз ціни матеріалів' },
    { key: 'analytics', label: 'Аналітика' },
  ];
  const defaultAccess = {};
  // Створюємо права доступу для кожної ролі
  roles.forEach(role => {
    defaultAccess[role.value] = {};
    tabs.forEach(tab => {
      // За замовчуванням кожна роль має доступ тільки до своєї вкладки
      if (role.value === tab.key) {
        defaultAccess[role.value][tab.key] = 'full';
      } else if (role.value === 'admin') {
        // Адміністратор має повний доступ до всього
        defaultAccess[role.value][tab.key] = 'full';
      } else if (role.value === 'buhgalteria' && tab.key === 'accountant') {
        // Бух. рахунки має доступ до основної панелі бухгалтера
        defaultAccess[role.value][tab.key] = 'full';
      } else if (role.value === 'buhgalteria' && tab.key === 'accountant-approval') {
        // Бух. рахунки має доступ до панелі затвердження
        defaultAccess[role.value][tab.key] = 'full';
      } else if (tab.key === 'reports') {
        // Всі ролі мають доступ для читання до звітів
        defaultAccess[role.value][tab.key] = 'read';
      } else if (tab.key === 'materials') {
        // Всі ролі мають доступ для читання до аналізу матеріалів
        defaultAccess[role.value][tab.key] = 'read';
      } else if (tab.key === 'analytics') {
        // Тільки адміністратор та регіональний керівник мають доступ до аналітики
        if (role.value === 'admin' || role.value === 'regional') {
          defaultAccess[role.value][tab.key] = 'full';
        } else {
          defaultAccess[role.value][tab.key] = 'none';
        }
      } else {
        // Для інших вкладок - немає доступу
        defaultAccess[role.value][tab.key] = 'none';
      }
    });
  });
  return defaultAccess;
};
function AccessRulesModal({ open, onClose }) {
  const [access, setAccess] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [roles, setRoles] = React.useState([]);
  // Отримуємо поточний список ролей з API
  const getCurrentRoles = async () => {
    try {
      const rolesData = await rolesAPI.getAll();
      return rolesData;
    } catch (error) {
      console.error('Помилка отримання ролей:', error);
      return [
    { value: 'admin', label: 'Адміністратор' },
    { value: 'service', label: 'Сервісна служба' },
    { value: 'operator', label: 'Оператор' },
    { value: 'warehouse', label: 'Зав. склад' },
    { value: 'accountant', label: 'Бух. рахунки' },
    { value: 'regional', label: 'Регіональний керівник' },
  ];
    }
  };
  const tabs = [
    { key: 'service', label: 'Сервісна служба' },
    { key: 'operator', label: 'Оператор' },
    { key: 'warehouse', label: 'Зав. склад' },
    { key: 'accountant', label: 'Бух. рахунки' },
    { key: 'accountant-approval', label: 'Бух. на Затвердженні' },
    { key: 'regional', label: 'Регіональний керівник' },
    { key: 'admin', label: 'Адміністратор' },
    { key: 'reports', label: 'Звіти' },
    { key: 'materials', label: 'Аналіз ціни матеріалів' },
    { key: 'analytics', label: 'Аналітика' },
  ];
  const accessTypes = [
    { value: 'full', label: 'Повний доступ' },
    { value: 'read', label: 'Тільки для читання' },
    { value: 'none', label: 'Немає доступу' },
  ];
  const [selectedRole, setSelectedRole] = React.useState('admin');
  // Завантаження правил доступу з API
  React.useEffect(() => {
    const loadAccessRules = async () => {
      setLoading(true);
      try {
        // Завантажуємо ролі
        const rolesData = await getCurrentRoles();
        setRoles(rolesData);
        setSelectedRole(rolesData[0]?.value || 'admin');
        // Завантажуємо правила доступу
        const serverRules = await accessRulesAPI.getAll();
        if (Object.keys(serverRules).length === 0) {
          // Якщо на сервері немає правил, використовуємо за замовчуванням
          const defaultRules = getDefaultAccess(rolesData);
          await accessRulesAPI.save(defaultRules);
          setAccess(defaultRules);
        } else {
          setAccess(serverRules);
        }
      } catch (error) {
        console.error('Помилка завантаження правил доступу:', error);
        // Використовуємо правила за замовчуванням при помилці
        const defaultRoles = [
          { value: 'admin', label: 'Адміністратор' },
          { value: 'service', label: 'Сервісна служба' },
          { value: 'operator', label: 'Оператор' },
          { value: 'warehouse', label: 'Зав. склад' },
          { value: 'accountant', label: 'Бух. рахунки' },
          { value: 'regional', label: 'Регіональний керівник' },
        ];
        setRoles(defaultRoles);
        setSelectedRole('admin');
        setAccess(getDefaultAccess(defaultRoles));
      } finally {
        setLoading(false);
      }
    };
    if (open) {
      loadAccessRules();
    }
  }, [open]);
  // Оновлюємо права доступу при зміні списку ролей
  React.useEffect(() => {
    const currentRoleValues = roles.map(r => r.value);
    // Додаємо нові ролі з правами за замовчуванням
    let updatedAccess = { ...access };
    let hasChanges = false;
    roles.forEach(role => {
      if (!updatedAccess[role.value]) {
        updatedAccess[role.value] = {};
        tabs.forEach(tab => {
          if (role.value === tab.key) {
            updatedAccess[role.value][tab.key] = 'full';
          } else if (role.value === 'admin') {
            updatedAccess[role.value][tab.key] = 'full';
          } else if (tab.key === 'reports') {
            updatedAccess[role.value][tab.key] = 'read';
          } else if (tab.key === 'materials') {
            updatedAccess[role.value][tab.key] = 'read';
          } else if (tab.key === 'analytics') {
            updatedAccess[role.value][tab.key] = 'full';
          } else {
            updatedAccess[role.value][tab.key] = 'none';
          }
        });
        hasChanges = true;
      }
    });
    // Видаляємо права для ролей, які більше не існують
    Object.keys(updatedAccess).forEach(roleKey => {
      if (!currentRoleValues.includes(roleKey)) {
        delete updatedAccess[roleKey];
        hasChanges = true;
      }
    });
    if (hasChanges) {
      setAccess(updatedAccess);
      // НЕ зберігаємо автоматично на сервері - тільки оновлюємо локальний стан
      // accessRulesAPI.save(updatedAccess);
    }
  }, [roles]);
  const handleChange = useCallback((role, tab, value) => {
    setAccess(a => ({ ...a, [role]: { ...a[role], [tab]: value } }));
  }, []);
  const handleSaveAccessRules = useCallback(async () => {
    try {
      const success = await accessRulesAPI.save(access);
      if (success) {
        onClose();
      } else {
        console.error('[DEBUG][AccessRulesModal] Помилка збереження правил доступу');
        alert('Помилка збереження правил доступу');
      }
    } catch (error) {
      console.error('[DEBUG][AccessRulesModal] Помилка збереження правил доступу:', error);
      alert('Помилка збереження правил доступу: ' + error.message);
    }
  }, [access, onClose]);
  if (!open) return null;
  if (loading) {
    return (
      <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'#fff',color:'#111',padding:32,borderRadius:8,minWidth:400}}>
          <div style={{textAlign:'center'}}>Завантаження правил доступу...</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',color:'#111',padding:32,borderRadius:8,minWidth:400,maxWidth:600}}>
        <h2>Права доступу до вкладок</h2>
        <div style={{marginBottom:24}}>
          <label style={{fontWeight:600,marginRight:8}}>Оберіть роль:</label>
          <select value={selectedRole} onChange={e=>setSelectedRole(e.target.value)} style={{padding:8,fontSize:16}}>
            {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <table style={{width:'100%',marginBottom:24}}>
          <thead>
            <tr>
              <th>Вкладка</th>
              <th colSpan={3}>Доступ</th>
            </tr>
          </thead>
          <tbody>
            {tabs.map(tab => (
              <tr key={tab.key}>
                <td style={{fontWeight:600}}>{tab.label}</td>
                {accessTypes.map(type => (
                  <td key={type.value}>
                    <label style={{fontWeight:400}}>
                      <input
                        type="radio"
                        name={selectedRole + '_' + tab.key}
                        value={type.value}
                        checked={access[selectedRole]?.[tab.key] === type.value}
                        onChange={() => handleChange(selectedRole, tab.key, type.value)}
                      /> {type.label}
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{display:'flex',gap:12}}>
          <button onClick={handleSaveAccessRules} style={{flex:1,background:'#00bfff',color:'#fff',padding:'12px 0',fontWeight:600}}>Зберегти</button>
          <button onClick={onClose} style={{flex:1,background:'#888',color:'#fff',padding:'12px 0'}}>Скасувати</button>
        </div>
      </div>
    </div>
  );
}
function AdminSystemParamsArea({ user }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({ login: '', password: '', role: 'service', name: '', region: '', telegramChatId: '' });
  const [regions, setRegions] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [newRegion, setNewRegion] = useState('');
  const [newRole, setNewRole] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  // Функція для визначення статусу користувача
  const isUserOnline = (userLogin) => {
    const isOnline = onlineUsers.has(userLogin);
    console.log('[DEBUG] isUserOnline - перевірка статусу для:', userLogin, 'результат:', isOnline);
    return isOnline;
  };
  // Функція для оновлення статусу активності користувача
  const updateUserActivity = async (userLogin) => {
    const now = Date.now();
    localStorage.setItem(`user_activity_${userLogin}`, now.toString());
    // Також оновлюємо на сервері
    try {
      await activityAPI.updateActivity(userLogin);
      console.log('[DEBUG] updateUserActivity - активність оновлена на сервері для:', userLogin);
    } catch (error) {
      console.error('Помилка оновлення активності на сервері:', error);
    }
  };
  // Функція для перевірки чи користувач активний (онлайн)
  const checkUserActivity = (userLogin) => {
    const lastActivity = localStorage.getItem(`user_activity_${userLogin}`);
    if (!lastActivity) return false;
    const lastActivityTime = parseInt(lastActivity);
    const now = Date.now();
    const timeDiff = now - lastActivityTime;
    // Користувач вважається онлайн, якщо активний протягом останніх 30 секунд
    return timeDiff < 30 * 1000;
  };
  // Функція для отримання списку активних користувачів
  const getActiveUsers = async () => {
    try {
      // Спочатку пробуємо отримати з сервера
      const serverActiveUsers = await activityAPI.getActiveUsers();
      if (serverActiveUsers && serverActiveUsers.length > 0) {
        console.log('[DEBUG] getActiveUsers - сервер повернув активних користувачів:', serverActiveUsers);
        return new Set(serverActiveUsers);
      }
    } catch (error) {
      console.error('Помилка отримання активних користувачів з сервера:', error);
    }
    
    // Fallback до локальної перевірки (тільки для поточного користувача)
    const activeUsers = new Set();
    if (user?.login && checkUserActivity(user.login)) {
      activeUsers.add(user.login);
      console.log('[DEBUG] getActiveUsers - fallback до localStorage для поточного користувача:', user.login);
    }
    return activeUsers;
  };
  // Відстеження активності поточного користувача
  useEffect(() => {
    if (!user?.login) return;
    // Оновлюємо активність поточного користувача кожні 10 секунд
    const activityInterval = setInterval(() => {
      updateUserActivity(user.login);
    }, 10000);
    // Початкове оновлення активності
    updateUserActivity(user.login);
    return () => clearInterval(activityInterval);
  }, [user?.login]);
  // Автоматичне оновлення статусу користувачів кожні 5 секунд
  useEffect(() => {
    const updateOnlineUsers = async () => {
      const activeUsers = await getActiveUsers();
      console.log('[DEBUG] updateOnlineUsers - оновлення статусу користувачів:', Array.from(activeUsers));
      setOnlineUsers(activeUsers);
    };
    // Початкове оновлення
    updateOnlineUsers();
    // Оновлюємо кожні 5 секунд
    const statusInterval = setInterval(updateOnlineUsers, 5000);
    return () => clearInterval(statusInterval);
  }, [users, user?.login]); // Додаємо user?.login як залежність
  // Завантаження користувачів з API
  useEffect(() => {
    const loadUsers = async () => {
      setIsLoading(true);
      try {
        const usersData = await columnsSettingsAPI.getAllUsers();
        setUsers(usersData);
      } catch (error) {
        console.error('Помилка завантаження користувачів:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadUsers();
  }, []);
  // Додаю useEffect для завантаження регіонів при монтуванні
  useEffect(() => {
    const loadRegions = async () => {
      try {
        const regionsData = await regionsAPI.getAll();
        setRegions(regionsData);
      } catch (error) {
        setRegions([]);
      }
    };
    loadRegions();
  }, []);
  // Завантаження ролей з API
  useEffect(() => {
    const loadRoles = async () => {
      try {
        const rolesData = await rolesAPI.getAll();
        setRolesList(rolesData);
      } catch (error) {
        console.error('Помилка завантаження ролей:', error);
      }
    };
    loadRoles();
  }, []);
  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.login || !form.password || !form.role || !form.name || !form.region) {
      alert('Будь ласка, заповніть всі поля');
      return;
    }
    if (users.some(u => u.login === form.login)) {
      alert('Користувач з таким логіном вже існує');
      return;
    }
    const newUser = {
      ...form,
      id: Date.now()
    };
    try {
      const success = await columnsSettingsAPI.saveUser(newUser);
      if (success) {
    setUsers(prevUsers => [...prevUsers, newUser]);
    setForm({
      login: '',
      password: '',
      role: rolesList[0]?.value || '',
      name: '',
      region: regions[0]?.name || '',
      telegramChatId: ''
    });
      } else {
        alert('Помилка збереження користувача');
      }
    } catch (error) {
      alert('Помилка збереження користувача: ' + error.message);
    }
  };
  const handleDelete = async (id) => {
    const userToDelete = users.find(u => u.id === id);
    if (!userToDelete) return;
    try {
      const success = await columnsSettingsAPI.deleteUser(userToDelete.login);
      if (success) {
    setUsers(users.filter(u => u.id !== id));
      } else {
        alert('Помилка видалення користувача');
      }
    } catch (error) {
      alert('Помилка видалення користувача: ' + error.message);
    }
  };
  const handleAddRegion = async () => {
    if (newRegion && !regions.some(r => r.name === newRegion)) {
      const updatedRegions = [...regions, { name: newRegion }];
      try {
        const success = await regionsAPI.save(updatedRegions);
        if (success) {
          setRegions(updatedRegions);
      setNewRegion('');
        } else {
          alert('Помилка збереження регіону');
        }
      } catch (error) {
        alert('Помилка збереження регіону: ' + error.message);
      }
    }
  };
  const handleAddRole = async () => {
    if (newRole && !rolesList.some(r => r.value === newRole)) {
      const updatedRolesList = [...rolesList, { value: newRole, label: newRole }];
      try {
        // Зберігаємо нову роль
        const rolesSuccess = await rolesAPI.save(updatedRolesList);
        if (rolesSuccess) {
          setRolesList(updatedRolesList);
          // Автоматично оновлюємо права доступу для нової ролі
          const currentAccess = await accessRulesAPI.getAll();
          // Додаємо права для нової ролі
          const tabs = [
            { key: 'service', label: 'Сервісна служба' },
            { key: 'operator', label: 'Оператор' },
            { key: 'warehouse', label: 'Зав. склад' },
            { key: 'accountant', label: 'Бух. рахунки' },
            { key: 'accountant-approval', label: 'Бух. на Затвердженні' },
            { key: 'regional', label: 'Регіональний керівник' },
            { key: 'admin', label: 'Адміністратор' },
            { key: 'reports', label: 'Звіти' },
            { key: 'materials', label: 'Аналіз ціни матеріалів' },
            { key: 'analytics', label: 'Аналітика' },
          ];
          currentAccess[newRole] = {};
          tabs.forEach(tab => {
            if (newRole === tab.key) {
              currentAccess[newRole][tab.key] = 'full';
            } else if (newRole === 'admin') {
              currentAccess[newRole][tab.key] = 'full';
            } else if (tab.key === 'reports') {
              currentAccess[newRole][tab.key] = 'read';
            } else if (tab.key === 'materials') {
              currentAccess[newRole][tab.key] = 'read';
            } else if (tab.key === 'analytics') {
              currentAccess[newRole][tab.key] = 'full';
            } else {
              currentAccess[newRole][tab.key] = 'none';
            }
          });
          await accessRulesAPI.save(currentAccess);
      setNewRole('');
        } else {
          alert('Помилка збереження ролі');
        }
      } catch (error) {
        console.error('Помилка оновлення правил доступу:', error);
        setNewRole('');
      }
    }
  };
  const handleDeleteRole = async (roleToDelete) => {
    // Перевіряємо, чи є користувачі з цією роллю
    const usersWithRole = users.filter(u => u.role === roleToDelete);
    if (usersWithRole.length > 0) {
      alert(`Не можна видалити роль "${roleToDelete}" - є користувачі з цією роллю: ${usersWithRole.map(u => u.login).join(', ')}`);
      return;
    }
    // Видаляємо роль зі списку
    const updatedRolesList = rolesList.filter(r => r.value !== roleToDelete);
    try {
      const rolesSuccess = await rolesAPI.save(updatedRolesList);
      if (rolesSuccess) {
        setRolesList(updatedRolesList);
        // Видаляємо права доступу для цієї ролі
        const currentAccess = await accessRulesAPI.getAll();
        if (currentAccess[roleToDelete]) {
          delete currentAccess[roleToDelete];
          await accessRulesAPI.save(currentAccess);
        }
      } else {
        alert('Помилка видалення ролі');
      }
    } catch (error) {
      console.error('Помилка видалення правил доступу:', error);
    }
  };
  const handleEdit = (user) => {
    setEditMode(true);
    setEditUser(user);
    setForm({
      login: user.login,
      password: user.password,
      role: user.role,
      name: user.name,
      region: user.region,
      telegramChatId: user.telegramChatId || ''
    });
  };
  const handleTelegramChange = (userId, telegramChatId) => {
    setUsers(users.map(u => 
      u.id === userId 
        ? { ...u, telegramChatId } 
        : u
    ));
  };
  const handleTelegramSave = async (userId, telegramChatId) => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      const updatedUser = { ...user, telegramChatId };
      const success = await columnsSettingsAPI.saveUser(updatedUser);
      if (success) {
      } else {
        alert('Помилка збереження Telegram Chat ID');
      }
    } catch (error) {
      console.error('Помилка збереження Telegram Chat ID:', error);
      alert('Помилка збереження Telegram Chat ID: ' + error.message);
    }
  };

  const handlePasswordChange = (userId, password) => {
    setUsers(users.map(u => 
      u.id === userId 
        ? { ...u, password } 
        : u
    ));
  };

  const handlePasswordSave = async (userId, password) => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) {
        console.error('Користувача не знайдено для ID:', userId);
        return;
      }
      console.log('Зберігаємо пароль для користувача:', user.login, 'новий пароль:', password);
      const updatedUser = { ...user, password };
      const success = await columnsSettingsAPI.saveUser(updatedUser);
      if (success) {
        console.log('Пароль успішно збережено для:', user.login);
        // Оновлюємо локальний стан
        setUsers(users.map(u => 
          u.id === userId 
            ? { ...u, password } 
            : u
        ));
      } else {
        console.error('Помилка збереження пароля для:', user.login);
        alert('Помилка збереження пароля');
      }
    } catch (error) {
      console.error('Помилка збереження пароля:', error);
      alert('Помилка збереження пароля: ' + error.message);
    }
  };
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!form.login || !form.password || !form.role || !form.name || !form.region) return;
    try {
      const updatedUser = { ...form, id: editUser.id };
      const success = await columnsSettingsAPI.saveUser(updatedUser);
      if (success) {
        setUsers(users.map(u => u.id === editUser.id ? updatedUser : u));
    setEditMode(false);
    setEditUser(null);
        setForm({ login: '', password: '', role: rolesList[0]?.value || '', name: '', region: regions[0]?.name || '', telegramChatId: '' });
      } else {
        alert('Помилка збереження користувача');
      }
    } catch (error) {
      alert('Помилка збереження користувача: ' + error.message);
    }
  };
  return (
    <div style={{padding:32}}>
      <h2 style={{color: '#333'}}>Додавання працівника</h2>
      <button onClick={()=>setShowAccessModal(true)} style={{marginBottom:16,background:'#1976d2',color:'#fff',padding:'10px 24px',border:'none',borderRadius:6,fontWeight:600}}>Встановити правила доступу</button>
      <form onSubmit={editMode ? handleSaveEdit : handleAdd} style={{display:'flex', gap:16, flexWrap:'wrap', marginBottom:24}}>
        <input name="login" placeholder="Логін" value={form.login} onChange={handleChange} style={{flex:'1 1 120px', color: '#333'}} />
        <input name="password" placeholder="Пароль" type="password" value={form.password} onChange={handleChange} style={{flex:'1 1 120px', color: '#333'}} />
        <div style={{display:'flex',flexDirection:'column',minWidth:140}}>
          <select name="role" value={form.role} onChange={handleChange} style={{flex:'1 1 140px', color: '#333'}}>
            {rolesList.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <div style={{display:'flex',marginTop:4}}>
            <input value={newRole} onChange={e=>setNewRole(e.target.value)} placeholder="Додати роль" style={{flex:1,minWidth:0, color: '#333'}} />
            <button type="button" onClick={handleAddRole} style={{marginLeft:4, color: '#333'}}>+</button>
          </div>
        </div>
        <input name="name" placeholder="ПІБ" value={form.name} onChange={handleChange} style={{flex:'2 1 180px', color: '#333'}} />
        <input name="telegramChatId" placeholder="Telegram Chat ID" value={form.telegramChatId || ''} onChange={handleChange} style={{flex:'1 1 150px', color: '#333'}} />
        <div style={{display:'flex',flexDirection:'column',minWidth:120}}>
          <select name="region" value={form.region} onChange={handleChange} style={{flex:'1 1 120px', color: '#333'}}>
            {regions.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
          <div style={{display:'flex',marginTop:4}}>
            <input value={newRegion} onChange={e=>setNewRegion(e.target.value)} placeholder="Додати регіон" style={{flex:1,minWidth:0, color: '#333'}} />
            <button type="button" onClick={handleAddRegion} style={{marginLeft:4, color: '#333'}}>+</button>
          </div>
        </div>
        <button type="submit" style={{flex:'1 1 100px', minWidth:100, color: '#333'}}>{editMode ? 'Зберегти' : 'Додати'}</button>
        {editMode && <button type="button" onClick={() => { setEditMode(false); setEditUser(null); setForm({ login: '', password: '', role: rolesList[0]?.value || '', name: '', region: regions[0]?.name || '', telegramChatId: '' }); }} style={{flex:'1 1 100px', minWidth:100, background:'#f66', color:'#fff', border:'none', borderRadius:4, padding:'4px 12px', cursor:'pointer'}}>Скасувати</button>}
      </form>
      {/* Секція управління ролями */}
      <div style={{marginBottom: 24, padding: 16, background: '#f5f5f5', borderRadius: 8}}>
        <h3 style={{marginTop: 0, marginBottom: 16, color: '#333'}}>Управління ролями</h3>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
          {rolesList.map(role => (
            <div key={role.value} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: '#fff',
              borderRadius: 4,
              border: '1px solid #ddd'
            }}>
              <span style={{fontWeight: 600, color: '#333'}}>{role.label}</span>
              <button 
                onClick={() => handleDeleteRole(role.value)}
                style={{
                  background: '#f66',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 2,
                  padding: '2px 6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                title="Видалити роль"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
      <h3 style={{color: '#333'}}>Список працівників</h3>
      {isLoading ? (
        <div style={{textAlign: 'center', padding: '20px', color: '#666'}}>
          ⏳ Завантаження користувачів...
        </div>
      ) : (
      <table style={{width:'100%', background:'#22334a', color:'#fff', borderRadius:8, overflow:'hidden'}}>
        <thead>
          <tr>
            <th>Логін</th>
            <th>Пароль</th>
            <th>Роль</th>
            <th>ПІБ</th>
            <th>Регіон</th>
            <th>Статус</th>
            <th>Телеграм</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id || u._id} style={{
              background: isUserOnline(u.login) ? 'linear-gradient(135deg, #1a4d1a 0%, #2d5a2d 50%, #1a4d1a 100%)' : '#22334a',
              border: isUserOnline(u.login) ? '2px solid #4CAF50' : '1px solid #29506a',
              boxShadow: isUserOnline(u.login) ? '0 0 15px rgba(76, 175, 80, 0.3)' : 'none',
              transform: isUserOnline(u.login) ? 'scale(1.02)' : 'scale(1)',
              transition: 'all 0.3s ease'
            }}>
              <td style={{
                fontWeight: isUserOnline(u.login) ? 'bold' : 'normal',
                color: isUserOnline(u.login) ? '#4CAF50' : '#fff',
                textShadow: isUserOnline(u.login) ? '0 0 5px rgba(76, 175, 80, 0.5)' : 'none'
              }}>{u.login}</td>
              <td style={{
                color: isUserOnline(u.login) ? '#4CAF50' : '#fff',
                fontWeight: isUserOnline(u.login) ? 'bold' : 'normal'
              }}>
                <input 
                  type="password" 
                  value={u.password || ''}
                  onChange={(e) => handlePasswordChange(u.id, e.target.value)}
                  onBlur={(e) => handlePasswordSave(u.id, e.target.value)}
                  style={{
                    width: '100px',
                    padding: '4px 8px',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    background: '#2a3a4a',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
              </td>
              <td style={{
                color: isUserOnline(u.login) ? '#4CAF50' : '#fff',
                fontWeight: isUserOnline(u.login) ? 'bold' : 'normal'
              }}>{rolesList.find(r => r.value === u.role)?.label || u.role}</td>
              <td style={{
                color: isUserOnline(u.login) ? '#4CAF50' : '#fff',
                fontWeight: isUserOnline(u.login) ? 'bold' : 'normal'
              }}>{u.name}</td>
              <td style={{
                color: isUserOnline(u.login) ? '#4CAF50' : '#fff',
                fontWeight: isUserOnline(u.login) ? 'bold' : 'normal'
              }}>{u.region}</td>
              <td>
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  backgroundColor: isUserOnline(u.login) ? '#4CAF50' : '#f44336',
                  display: 'inline-block',
                  marginRight: 8,
                  boxShadow: isUserOnline(u.login) ? '0 0 10px rgba(76, 175, 80, 0.8)' : 'none',
                  animation: isUserOnline(u.login) ? 'pulse 2s infinite' : 'none'
                }}></div>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: isUserOnline(u.login) ? '#4CAF50' : '#f44336',
                  textShadow: isUserOnline(u.login) ? '0 0 5px rgba(76, 175, 80, 0.5)' : 'none'
                }}>
                  {isUserOnline(u.login) ? 'Онлайн' : 'Офлайн'}
                </span>
              </td>
              <td>
                <input 
                  type="text" 
                  placeholder="Chat ID"
                  value={u.telegramChatId || ''}
                  onChange={(e) => handleTelegramChange(u.id, e.target.value)}
                  onBlur={(e) => handleTelegramSave(u.id, e.target.value)}
                  style={{
                    width: '100px',
                    padding: '4px 8px',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    background: '#2a3a4a',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
              </td>
              <td>
                <button onClick={() => handleEdit(u)} style={{
                  background: isUserOnline(u.login) ? '#2E7D32' : '#4CAF50', 
                  color: '#fff', 
                  border: isUserOnline(u.login) ? '2px solid #4CAF50' : 'none', 
                  borderRadius: 4, 
                  padding: '4px 12px', 
                  cursor: 'pointer', 
                  marginRight: 8,
                  boxShadow: isUserOnline(u.login) ? '0 0 10px rgba(76, 175, 80, 0.5)' : 'none',
                  fontWeight: isUserOnline(u.login) ? 'bold' : 'normal'
                }}>Редагувати</button>
                <button onClick={() => handleDelete(u.id)} style={{
                  background: isUserOnline(u.login) ? '#D32F2F' : '#f66', 
                  color: '#fff', 
                  border: isUserOnline(u.login) ? '2px solid #f44336' : 'none', 
                  borderRadius: 4, 
                  padding: '4px 12px', 
                  cursor: 'pointer',
                  boxShadow: isUserOnline(u.login) ? '0 0 10px rgba(244, 67, 54, 0.5)' : 'none',
                  fontWeight: isUserOnline(u.login) ? 'bold' : 'normal'
                }}>Видалити</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
      {showAccessModal && <AccessRulesModal open={showAccessModal} onClose={()=>setShowAccessModal(false)} />}
    </div>
  );
}
function ServiceArea({ user, accessRules, currentArea }) {
  console.log('DEBUG ServiceArea: user =', user);
  console.log('DEBUG ServiceArea: user.region =', user?.region);
  
  // Перевіряємо права доступу для поточної області
  const hasFullAccess = accessRules && accessRules[user?.role] && accessRules[user?.role][currentArea] === 'full';
  const isReadOnly = accessRules && accessRules[user?.role] && accessRules[user?.role][currentArea] === 'read';
  
  // Перевіряємо чи користувач завантажений
  if (!user) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '200px',
        fontSize: '16px',
        color: '#666'
      }}>
        Завантаження даних користувача...
      </div>
    );
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [tableKey, setTableKey] = useState(0);
  const [editTask, setEditTask] = useState(null);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Використовуємо хук useLazyData для оптимізації
  const { data: tasks, loading, error, activeTab, setActiveTab, refreshData, getTabCount } = useLazyData(user, 'notDone');
  
  // Ініціалізуємо фільтри
  const allFilterKeys = allTaskFields
    .map(f => f.name)
    .reduce((acc, key) => {
      acc[key] = '';
      if (["date", "requestDate"].includes(key)) {
        acc[key + 'From'] = '';
        acc[key + 'To'] = '';
      }
      return acc;
    }, {});
  const [filters, setFilters] = useState(allFilterKeys);
  // Додаємо useEffect для оновлення filters при зміні allTaskFields
  // але зберігаємо вже введені користувачем значення
  useEffect(() => {
    const newFilterKeys = allTaskFields
      .map(f => f.name)
      .reduce((acc, key) => {
        acc[key] = '';
        if (["date", "requestDate"].includes(key)) {
          acc[key + 'From'] = '';
          acc[key + 'To'] = '';
        }
        return acc;
      }, {});
    // Оновлюємо filters, зберігаючи вже введені значення
    setFilters(prevFilters => {
      const updatedFilters = { ...newFilterKeys };
      // Зберігаємо вже введені значення
      Object.keys(prevFilters).forEach(key => {
        if (prevFilters[key] && prevFilters[key] !== '') {
          updatedFilters[key] = prevFilters[key];
        }
      });
      return updatedFilters;
    });
  }, [allTaskFields]); // Залежність від allTaskFields
  
  // Автоматично встановлюємо "Загальний" для користувачів з множинними регіонами
  useEffect(() => {
    console.log('DEBUG App useEffect: user?.region =', user?.region);
    console.log('DEBUG App useEffect: filters.serviceRegion =', filters.serviceRegion);
    console.log('DEBUG App useEffect: user.region.includes(",") =', user?.region?.includes(','));
    if (user?.region && user.region.includes(',') && filters.serviceRegion === '') {
      console.log('DEBUG App: Auto-setting serviceRegion to "Загальний" for multi-region user');
      setFilters(prev => ({ ...prev, serviceRegion: 'Загальний' }));
    }
  }, [user?.region, filters.serviceRegion]);
  
  // Кешуємо колонки за допомогою useMemo
  const columns = useMemo(() => allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: true
  })), []);
  // Старі useEffect видалені - тепер використовуємо useLazyData
  // useEffect для перевірки та показу нагадування
  useEffect(() => {
    if (!loading && tasks.length > 0 && activeTab === 'notDone') {
      // Фільтруємо заявки по регіону користувача
      const requestTasks = tasks.filter(task => {
        if (task.status !== 'Заявка') return false;
        // Якщо користувач має регіон "Україна", показуємо всі заявки
        if (user?.region === 'Україна') return true;
        // Інакше показуємо тільки заявки свого регіону
        return task.serviceRegion === user?.region;
      });
      if (requestTasks.length > 0) {
        setReminderModalOpen(true);
      }
    }
  }, [loading, tasks, activeTab, user?.region]);
  const handleSave = async (task) => {
    try {
      let updatedTask = null;
      if (editTask && editTask.id) {
        updatedTask = await tasksAPI.update(editTask.id, task);
      } else {
        updatedTask = await tasksAPI.add(task);
      }
      
      // Оновлюємо дані через refreshData
      await refreshData(activeTab);
      
      // Закриваємо модальне вікно
      setModalOpen(false);
      setEditTask(null);
      setTableKey(prev => prev + 1); // Примусово оновлюємо таблицю
    } catch (error) {
      console.error('[ERROR] handleSave - помилка збереження:', error);
      alert('Помилка збереження заявки');
    }
  };
  const handleEdit = t => {
    const taskReadOnly = t._readOnly;
    const taskData = { ...t };
    delete taskData._readOnly; // Видаляємо прапорець з даних завдання
    setEditTask(taskData);
    setModalOpen(true);
    // Передаємо readOnly в ModalTaskForm якщо задача має _readOnly або якщо доступ тільки для читання
    if (taskReadOnly || isReadOnly) {
      // Встановлюємо прапорець для ModalTaskForm
      setEditTask(prev => ({ ...prev, _readOnly: true }));
    }
  };
  const handleStatus = async (id, status) => {
    try {
      const t = tasks.find(t => t.id === id);
      if (!t) return;
      
      let updated;
      if (status === 'Виконано') {
        updated = await tasksAPI.update(id, {
          ...t,
          status,
          approvedByWarehouse: false,
          approvedByAccountant: false,
          approvedByRegionalManager: false,
        });
      } else {
        updated = await tasksAPI.update(id, { ...t, status });
      }
      
      // Оновлюємо дані через refreshData
      await refreshData(activeTab);
      setTableKey(prev => prev + 1); // Примусово оновлюємо таблицю
    } catch (error) {
      console.error('[ERROR] handleStatus - помилка оновлення статусу:', error);
      alert('Помилка оновлення статусу заявки');
    }
  };
  const handleDelete = async (id) => {
    try {
      await tasksAPI.remove(id);
      
      // Оновлюємо дані через refreshData
      await refreshData(activeTab);
      setTableKey(prev => prev + 1); // Примусово оновлюємо таблицю
    } catch (error) {
      console.error('[ERROR] handleDelete - помилка видалення:', error);
      alert('Помилка видалення заявки');
    }
  };
  const handleFilter = useCallback(e => {
    console.log('DEBUG App: handleFilter CALLED - e.target.name =', e.target.name);
    console.log('DEBUG App: handleFilter CALLED - e.target.value =', e.target.value);
    console.log('DEBUG App: handleFilter CALLED - current filters =', filters);
    setFilters(prevFilters => {
      const newFilters = { ...prevFilters, [e.target.name]: e.target.value };
      console.log('DEBUG App: handleFilter - old filters =', prevFilters);
      console.log('DEBUG App: handleFilter - newFilters =', newFilters);
      console.log('DEBUG App: handleFilter - setFilters called with newFilters');
      return newFilters;
    });
  }, []);
  const filtered = useMemo(() => {
    console.log('DEBUG App filtered: useMemo dependencies changed, recalculating...');
    console.log('DEBUG App filtered: user =', user);
    console.log('DEBUG App filtered: user.region =', user?.region);
    console.log('DEBUG App filtered: tasks.length =', tasks?.length);
    console.log('DEBUG App filtered: filters =', filters);
    console.log('DEBUG App filtered: filters.serviceRegion =', filters.serviceRegion);
    console.log('DEBUG App filtered: useMemo dependencies = [tasks, user?.region, filters]');
    console.log('DEBUG App filtered: tasks type =', typeof tasks);
    console.log('DEBUG App filtered: user type =', typeof user);
    console.log('DEBUG App filtered: filters type =', typeof filters);
    
    const result = tasks.filter(t => {
    // Перевірка доступу до регіону заявки
    if (user?.region && user.region !== 'Україна') {
      // Якщо користувач має множинні регіони (через кому)
      if (user.region.includes(',')) {
        const userRegions = user.region.split(',').map(r => r.trim());
        console.log('DEBUG filter: filters.serviceRegion =', filters.serviceRegion);
        console.log('DEBUG filter: t.serviceRegion =', t.serviceRegion);
        console.log('DEBUG filter: userRegions =', userRegions);
        
        // Якщо вибрано "Всі" або "Загальний" або нічого не вибрано, показуємо всі регіони користувача
        if (filters.serviceRegion === 'Всі' || filters.serviceRegion === 'Загальний' || !filters.serviceRegion || filters.serviceRegion === '') {
          console.log('DEBUG filter: Showing all user regions');
          console.log('DEBUG filter: Task region', t.serviceRegion, 'is in user regions?', userRegions.includes(t.serviceRegion));
          if (!userRegions.includes(t.serviceRegion)) {
            console.log('DEBUG filter: Filtering out task - region not in user regions');
            return false;
          }
          console.log('DEBUG filter: Task passed region filter');
        } else {
          // Якщо вибрано конкретний регіон
          console.log('DEBUG filter: Showing specific region');
          console.log('DEBUG filter: Task region', t.serviceRegion, 'matches filter?', t.serviceRegion === filters.serviceRegion);
          if (t.serviceRegion !== filters.serviceRegion) {
            console.log('DEBUG filter: Filtering out task - region does not match');
            return false;
          }
          console.log('DEBUG filter: Task passed region filter');
        }
      } else {
        // Якщо користувач має один регіон
        if (t.serviceRegion !== user.region) return false;
      }
    }
    
    // Обробка фільтра serviceRegion для користувачів з регіоном "Україна"
    if (user?.region === 'Україна' && filters.serviceRegion && filters.serviceRegion !== 'Всі' && filters.serviceRegion !== 'Загальний') {
      console.log('DEBUG filter: Ukraine user - checking serviceRegion filter:', filters.serviceRegion, 'task region:', t.serviceRegion);
      if (t.serviceRegion !== filters.serviceRegion) {
        console.log('DEBUG filter: Ukraine user - filtering out task - region does not match');
        return false;
      }
      console.log('DEBUG filter: Ukraine user - task passed serviceRegion filter');
    }
    
    for (const key in filters) {
      const value = filters[key];
      if (!value) continue;
      if (key.endsWith('From')) {
        const field = key.replace('From', '');
        if (!t[field]) return false;
        const taskDate = new Date(t[field]);
        const filterDate = new Date(value);
        if (isNaN(taskDate.getTime()) || isNaN(filterDate.getTime())) return false;
        if (taskDate < filterDate) return false;
      } else if (key.endsWith('To')) {
        const field = key.replace('To', '');
        if (!t[field]) return false;
        const taskDate = new Date(t[field]);
        const filterDate = new Date(value);
        if (isNaN(taskDate.getTime()) || isNaN(filterDate.getTime())) return false;
        if (taskDate > filterDate) return false;
      } else if ([
        'approvedByRegionalManager', 'approvedByWarehouse', 'approvedByAccountant', 'paymentType', 'status'
      ].includes(key)) {
        if (t[key]?.toString() !== value.toString()) return false;
      } else if ([
        'airFilterCount', 'airFilterPrice', 'serviceBonus'
      ].includes(key)) {
        if (Number(t[key]) !== Number(value)) return false;
      } else if ([
        'bonusApprovalDate'
      ].includes(key)) {
        if (t[key] !== value) return false;
      } else if ([
        'regionalManagerComment', 'airFilterName'
      ].includes(key)) {
        console.log('DEBUG filter: Checking regionalManagerComment/airFilterName filter:', key, 'value:', value, 'task value:', t[key]);
        if (!t[key] || !t[key].toString().toLowerCase().includes(value.toLowerCase())) return false;
      } else if (typeof t[key] === 'string' || typeof t[key] === 'number') {
        console.log('DEBUG filter: Checking general string/number filter:', key, 'value:', value, 'task value:', t[key]);
        // Пропускаємо serviceRegion - він вже оброблений вище
        if (key === 'serviceRegion') continue;
        if (!t[key]?.toString().toLowerCase().includes(value.toLowerCase())) return false;
      }
    }
    console.log('DEBUG filter: Task passed all filters:', t.requestNumber);
    return true;
  });
  
  console.log('DEBUG App filtered: result =', result);
  console.log('DEBUG App filtered: result.length =', result.length);
  return result;
  }, [tasks, user?.region, filters]);
  
  console.log('DEBUG App: useMemo dependencies - tasks.length =', tasks.length);
  console.log('DEBUG App: useMemo dependencies - user?.region =', user?.region);
  console.log('DEBUG App: useMemo dependencies - filters =', filters);
  console.log('DEBUG App: useMemo dependencies - filters.serviceRegion =', filters.serviceRegion);
  const notDone = useMemo(() => filtered.filter(t => t.status === 'Заявка' || t.status === 'В роботі'), [filtered]);
  const pending = useMemo(() => filtered.filter(t => t.status === 'Виконано' && (
    isPending(t.approvedByWarehouse) ||
    isPending(t.approvedByAccountant) ||
    isRejected(t.approvedByWarehouse) ||
    isRejected(t.approvedByAccountant) ||
    (isApproved(t.approvedByWarehouse) && isPending(t.approvedByAccountant))
  )), [filtered]);
  const done = useMemo(() => filtered.filter(t => t.status === 'Виконано' && 
    isApproved(t.approvedByWarehouse) && 
    isApproved(t.approvedByAccountant)
  ), [filtered]);
  const blocked = useMemo(() => filtered.filter(t => t.status === 'Заблоковано'), [filtered]);
  let tableData = notDone;
  if (activeTab === 'pending') tableData = pending;
  if (activeTab === 'done') tableData = done;
  if (activeTab === 'blocked') tableData = blocked;
  // Функція для створення звіту по замовнику
  const openClientReport = (clientName) => {
    const clientTasks = tasks.filter(task => task.client === clientName);
    if (clientTasks.length === 0) {
      alert('Немає даних для даного замовника');
      return;
    }
    // Сортуємо завдання за датою (від найновішої до найстарішої)
    const sortedTasks = clientTasks.sort((a, b) => {
      const dateA = new Date(a.date || a.requestDate || 0);
      const dateB = new Date(b.date || b.requestDate || 0);
      return dateB - dateA;
    });
    // Створюємо HTML звіт
    const reportHTML = `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Звіт по замовнику: ${clientName}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
          }
          .header {
            background: #22334a;
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
          }
          .task-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .task-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #22334a;
          }
          .task-date {
            font-size: 18px;
            font-weight: bold;
            color: #22334a;
          }
          .task-status {
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .status-completed { background: #4caf50; color: white; }
          .status-in-progress { background: #ff9800; color: white; }
          .status-new { background: #2196f3; color: white; }
          .status-blocked { background: #f44336; color: white; }
          .materials-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
            margin-top: 15px;
          }
          .material-section {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #22334a;
          }
          .material-section h4 {
            margin: 0 0 10px 0;
            color: #22334a;
            font-size: 14px;
            text-transform: uppercase;
          }
          .material-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 5px 0;
            border-bottom: 1px solid #eee;
          }
          .material-item:last-child {
            border-bottom: none;
          }
          .material-label {
            font-weight: 500;
            color: #555;
          }
          .material-value {
            font-weight: bold;
            color: #22334a;
          }
          .task-info {
            margin-bottom: 15px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }
          .info-label {
            font-weight: 500;
            color: #666;
          }
          .info-value {
            font-weight: bold;
            color: #22334a;
          }
          .summary {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 6px;
            margin-top: 20px;
            border-left: 4px solid #2196f3;
          }
          .summary h3 {
            margin: 0 0 10px 0;
            color: #1976d2;
          }
          .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #22334a;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          }
          .print-button:hover {
            background: #1a2636;
          }
          @media print {
            .print-button { display: none; }
            body { background: white; }
          }
        </style>
      </head>
      <body>
        <button class="print-button" onclick="window.print()">🖨️ Друкувати</button>
        <div class="header">
          <h1>Звіт по замовнику: ${clientName}</h1>
          <p>Кількість проведених робіт: ${sortedTasks.length}</p>
          <p>Дата створення звіту: ${new Date().toLocaleDateString('uk-UA')}</p>
        </div>
        ${sortedTasks.map(task => `
          <div class="task-card">
            <div class="task-header">
              <div class="task-date">Дата проведення робіт: ${task.date || 'Не вказано'}</div>
              <div class="task-status status-${task.status === 'Виконано' ? 'completed' : task.status === 'В роботі' ? 'in-progress' : task.status === 'Новий' ? 'new' : 'blocked'}">
                ${task.status || 'Невідомо'}
              </div>
            </div>
            <div class="task-info">
              <div class="info-row">
                <span class="info-label">Дата заявки:</span>
                <span class="info-value">${task.requestDate || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Замовник:</span>
                <span class="info-value">${task.client || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Адреса:</span>
                <span class="info-value">${task.address || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Найменування робіт:</span>
                <span class="info-value">${task.work || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Сервісні інженери:</span>
                <span class="info-value">${[
                  task.engineer1 || '',
                  task.engineer2 || '',
                  task.engineer3 || '',
                  task.engineer4 || '',
                  task.engineer5 || '',
                  task.engineer6 || ''
                ].filter(eng => eng && eng.trim().length > 0).join(', ')}</span>
              </div>
            </div>
            <div class="materials-grid">
              ${task.oilType || task.oilUsed || task.oilPrice ? `
                <div class="material-section">
                  <h4>Олива</h4>
                  ${task.oilType ? `<div class="material-item"><span class="material-label">Тип оливи:</span><span class="material-value">${task.oilType}</span></div>` : ''}
                  ${task.oilUsed ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.oilUsed} л</span></div>` : ''}
                  ${task.oilPrice ? `<div class="material-item"><span class="material-label">Ціна за л:</span><span class="material-value">${task.oilPrice} грн</span></div>` : ''}
                  ${task.oilTotal ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.oilTotal} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.filterName || task.filterCount || task.filterPrice ? `
                <div class="material-section">
                  <h4>Масляний фільтр</h4>
                  ${task.filterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.filterName}</span></div>` : ''}
                  ${task.filterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.filterCount} шт</span></div>` : ''}
                  ${task.filterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.filterPrice} грн</span></div>` : ''}
                  ${task.filterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.filterSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.airFilterName || task.airFilterCount || task.airFilterPrice ? `
                <div class="material-section">
                  <h4>Повітряний фільтр</h4>
                  ${task.airFilterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.airFilterName}</span></div>` : ''}
                  ${task.airFilterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.airFilterCount} шт</span></div>` : ''}
                  ${task.airFilterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.airFilterPrice} грн</span></div>` : ''}
                  ${task.airFilterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.airFilterSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.antifreezeType || task.antifreezeL || task.antifreezePrice ? `
                <div class="material-section">
                  <h4>Антифриз</h4>
                  ${task.antifreezeType ? `<div class="material-item"><span class="material-label">Тип:</span><span class="material-value">${task.antifreezeType}</span></div>` : ''}
                  ${task.antifreezeL ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.antifreezeL} л</span></div>` : ''}
                  ${task.antifreezePrice ? `<div class="material-item"><span class="material-label">Ціна за л:</span><span class="material-value">${task.antifreezePrice} грн</span></div>` : ''}
                  ${task.antifreezeSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.antifreezeSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.fuelFilterName || task.fuelFilterCount || task.fuelFilterPrice ? `
                <div class="material-section">
                  <h4>Паливний фільтр</h4>
                  ${task.fuelFilterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.fuelFilterName}</span></div>` : ''}
                  ${task.fuelFilterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.fuelFilterCount} шт</span></div>` : ''}
                  ${task.fuelFilterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.fuelFilterPrice} грн</span></div>` : ''}
                  ${task.fuelFilterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.fuelFilterSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.otherMaterials || task.otherSum ? `
                <div class="material-section">
                  <h4>Інші матеріали</h4>
                  ${task.otherMaterials ? `<div class="material-item"><span class="material-label">Опис:</span><span class="material-value">${task.otherMaterials}</span></div>` : ''}
                  ${task.otherSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.otherSum} грн</span></div>` : ''}
                </div>
              ` : ''}
            </div>
            ${task.serviceTotal ? `
              <div class="summary">
                <h3>Загальна сума послуги: ${task.serviceTotal} грн</h3>
              </div>
            ` : ''}
          </div>
        `).join('')}
        <div class="summary">
          <h3>Підсумок по замовнику ${clientName}</h3>
          <p>Всього проведено робіт: ${sortedTasks.length}</p>
          <p>Загальна вартість всіх послуг: ${sortedTasks.reduce((sum, task) => sum + (parseFloat(task.serviceTotal) || 0), 0).toFixed(2)} грн</p>
        </div>
      </body>
      </html>
    `;
    // Відкриваємо нове вікно з звітом
    const newWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    newWindow.document.write(reportHTML);
    newWindow.document.close();
  };
  return (
    <div style={{padding:32}}>
      <h2>Заявки сервісної служби</h2>
      {loading && <div>Завантаження...</div>}
      
      {/* Оптимізований рядок з усіма кнопками */}
      <div style={{display:'flex',gap:8,marginBottom:24,justifyContent:'flex-start',flexWrap:'wrap',alignItems:'center'}}>
        {hasFullAccess && <button onClick={()=>{setEditTask(null);setModalOpen(true);}} style={{padding:'10px 20px',background:'#28a745',color:'#fff',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>Додати заявку</button>}
        <button onClick={()=>setActiveTab('notDone')} style={{padding:'10px 16px',background:activeTab==='notDone'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='notDone'?700:400,cursor:'pointer',whiteSpace:'nowrap'}}>Невиконані заявки ({getTabCount('notDone')})</button>
        <button onClick={()=>setActiveTab('pending')} style={{padding:'10px 16px',background:activeTab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='pending'?700:400,cursor:'pointer',whiteSpace:'nowrap'}}>Заявка на підтвердженні ({getTabCount('pending')})</button>
        <button onClick={()=>setActiveTab('done')} style={{padding:'10px 16px',background:activeTab==='done'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='done'?700:400,cursor:'pointer',whiteSpace:'nowrap'}}>Архів виконаних заявок ({done.length})</button>
        <button onClick={()=>setActiveTab('blocked')} style={{padding:'10px 16px',background:activeTab==='blocked'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='blocked'?700:400,cursor:'pointer',whiteSpace:'nowrap'}}>Заблоковані заявки ({getTabCount('blocked')})</button>
      </div>
      
      <ModalTaskForm 
        open={modalOpen} 
        onClose={()=>{setModalOpen(false);setEditTask(null);}} 
        onSave={handleSave} 
        initialData={editTask||initialTask} 
        mode={activeTab === 'done' ? 'admin' : 'service'} 
        user={user}
        readOnly={editTask?._readOnly || false}
      />
      <TaskTable
        key={tableKey}
        tasks={tableData}
        allTasks={tasks}
        onEdit={handleEdit}
        onStatusChange={handleStatus}
        onDelete={handleDelete}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        filters={filters}
        onFilterChange={handleFilter}
        role="service"
        dateRange={dateRange}
        setDateRange={setDateRange}
        user={user}
        isArchive={activeTab === 'done'}
        onHistoryClick={openClientReport}
        accessRules={accessRules}
        currentArea={currentArea}
      />
      <ServiceReminderModal
        isOpen={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
        tasks={tasks}
        user={user}
      />
    </div>
  );
}
function RegionalManagerArea({ tab: propTab, user, accessRules, currentArea }) {
  console.log('DEBUG RegionalManagerArea: user =', user);
  console.log('DEBUG RegionalManagerArea: user.region =', user?.region);
  
  // Перевіряємо права доступу для поточної області
  const hasFullAccess = accessRules && accessRules[user?.role] && accessRules[user?.role][currentArea] === 'full';
  const isReadOnly = accessRules && accessRules[user?.role] && accessRules[user?.role][currentArea] === 'read';
  
  // Перевіряємо чи користувач завантажений
  if (!user) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '200px',
        fontSize: '16px',
        color: '#666'
      }}>
        Завантаження даних користувача...
      </div>
    );
  }

  const { t } = useTranslation();
  const [tab, setTab] = useState(propTab || 'tasks');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  // taskTab state видалено - тепер використовуємо activeTab з useLazyData
  
  // Використовуємо хук useLazyData для оптимізації
  // НЕ передаємо регіон - фільтрація відбувається на frontend як в WarehouseArea
  const { data: tasks, loading, error, activeTab, setActiveTab, refreshData, preloadCache, getTabCount } = useLazyData(user, 'pending');
  
  // Додатковий стан для всіх заявок (потрібно для звіту по персоналу та вкладки debt)
  const [allTasks, setAllTasks] = useState([]);
  const [allTasksLoading, setAllTasksLoading] = useState(false);
  
  // Завантажуємо всі завдання для вкладки debt (як у бухгалтера)
  useEffect(() => {
    const loadAllTasks = async () => {
      if (allTasks.length === 0) {
        setAllTasksLoading(true);
        try {
          const allTasksData = await tasksAPI.getAll();
          setAllTasks(allTasksData);
          console.log('[DEBUG] RegionalManagerArea - завантажено всіх завдань:', allTasksData.length);
        } catch (error) {
          console.error('[ERROR] RegionalManagerArea - помилка завантаження всіх завдань:', error);
        } finally {
          setAllTasksLoading(false);
        }
      }
    };
    
    loadAllTasks();
  }, [allTasks.length]);
  
  const allFilterKeys = allTaskFields
    .map(f => f.name)
    .reduce((acc, key) => {
      acc[key] = '';
      if (["date", "requestDate"].includes(key)) {
        acc[key + 'From'] = '';
        acc[key + 'To'] = '';
      }
      return acc;
    }, {});
  const [filters, setFilters] = useState(allFilterKeys);
  const [users, setUsers] = useState([]);
  const [region, setRegion] = useState('');
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportWithDetails, setReportWithDetails] = useState(true);
  const [reportTable, setReportTable] = useState(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reportTableByPeriod, setReportTableByPeriod] = useState(null);
  const [reportWithDetailsByPeriod, setReportWithDetailsByPeriod] = useState(false);
  const [exportMenuOpenByPeriod, setExportMenuOpenByPeriod] = useState(false);
  const [reportMode, setReportMode] = useState('month');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectReportOpen, setSelectReportOpen] = useState(false);
  const [reportType, setReportType] = useState('month');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  // Додаємо стани для фільтрів експорту
  const [exportFilters, setExportFilters] = useState({
    dateFrom: '',
    dateTo: '',
    region: '',
    approvalFilter: 'all'
  });
  // Додаємо useEffect для оновлення filters при зміні allTaskFields
  // але зберігаємо вже введені користувачем значення
  useEffect(() => {
    const newFilterKeys = allTaskFields
      .map(f => f.name)
      .reduce((acc, key) => {
        acc[key] = '';
        if (["date", "requestDate"].includes(key)) {
          acc[key + 'From'] = '';
          acc[key + 'To'] = '';
        }
        return acc;
      }, {});
    // Оновлюємо filters, зберігаючи вже введені значення
    setFilters(prevFilters => {
      const updatedFilters = { ...newFilterKeys };
      // Зберігаємо вже введені значення
      Object.keys(prevFilters).forEach(key => {
        if (prevFilters[key] && prevFilters[key] !== '') {
          updatedFilters[key] = prevFilters[key];
        }
      });
      return updatedFilters;
    });
  }, [allTaskFields]); // Залежність від allTaskFields
  
  // Автоматично встановлюємо "Загальний" для користувачів з множинними регіонами
  useEffect(() => {
    if (user?.region && user.region.includes(',') && filters.serviceRegion === '') {
      console.log('DEBUG RegionalManagerArea: Auto-setting serviceRegion to "Загальний" for multi-region user');
      setFilters(prev => ({ ...prev, serviceRegion: 'Загальний' }));
    }
  }, [user?.region, filters.serviceRegion]);

  // Попереднє завантаження кешу для вкладок pending та archive при вході в панель
  useEffect(() => {
    if (user) {
      console.log('DEBUG RegionalManagerArea: Preloading cache for pending and archive tabs');
      // Завантажуємо дані для вкладок pending та archive
      const preloadTabs = async () => {
        try {
          // Завантажуємо дані для pending (відхилені заявки)
          const pendingData = await tasksAPI.getByStatus('pending', user.region);
          preloadCache('pending', pendingData);
          console.log('DEBUG RegionalManagerArea: Preloaded pending data:', pendingData.length);
          
          // Завантажуємо дані для archive (архів виконаних заявок)
          const archiveData = await tasksAPI.getByStatus('archive', user.region);
          preloadCache('archive', archiveData);
          console.log('DEBUG RegionalManagerArea: Preloaded archive data:', archiveData.length);
        } catch (error) {
          console.error('DEBUG RegionalManagerArea: Error preloading cache:', error);
        }
      };
      
      preloadTabs();
    }
  }, [user, preloadCache]);
  
  // Старі useEffect видалені - тепер використовуємо useLazyData
  
  // Предзавантаження кешу для регіонального керівника при вході на вкладку
  useEffect(() => {
    if (user?.role === 'regional') {
      console.log('🚀 Предзавантаження кешу для регіонального керівника...');
      
      // Завантажуємо дані для вкладки "done" (Архів виконаних заявок) в кеш
      tasksAPI.getByStatus('done', user?.region).then(archiveTasks => {
        console.log('📊 Предзавантажено заявок з архіву в кеш:', archiveTasks.length);
        setAllTasks(archiveTasks); // Зберігаємо для звіту
        preloadCache('done', archiveTasks); // Поповнюємо кеш useLazyData
        console.log('✅ Кеш useLazyData поповнено для вкладки "done"');
      }).catch(error => {
        console.error('Помилка предзавантаження заявок з архіву:', error);
      });
      
      // Також завантажуємо дані для вкладки "pending" (Заявки відхилені) в кеш
      tasksAPI.getByStatus('pending', user?.region).then(pendingTasks => {
        console.log('📊 Предзавантажено заявок відхилених в кеш:', pendingTasks.length);
        preloadCache('pending', pendingTasks); // Поповнюємо кеш useLazyData
        console.log('✅ Кеш useLazyData поповнено для вкладки "pending"');
      }).catch(error => {
        console.error('Помилка предзавантаження заявок відхилених:', error);
      });
    }
  }, [user?.role, user?.region, preloadCache]);
  
  // Завантаження всіх даних для звіту по персоналу при першому завантаженні панелі
  useEffect(() => {
    // Якщо дані вже є в кеші, не завантажуємо повторно
    if (allTasks.length > 0) {
      console.log('📊 Використовуємо предзавантажені дані для звіту:', allTasks.length);
      setAllTasksLoading(false);
      return;
    }
    
    setAllTasksLoading(true);
    console.log('📊 Завантаження всіх даних для звіту по персоналу...');
    
    // Завантажуємо ВСІ завдання для звіту по персоналу
    tasksAPI.getAll().then(allTasksData => {
      console.log('📊 Завантажено всіх заявок для звіту:', allTasksData.length);
      setAllTasks(allTasksData); // Зберігаємо для звіту
      setAllTasksLoading(false);
    }).catch(error => {
      console.error('Помилка завантаження всіх заявок для звіту:', error);
      setAllTasksLoading(false);
    });
  }, [user?.region, allTasks.length]);
  
  // Додаю useEffect для завантаження користувачів з бази
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await columnsSettingsAPI.getAllUsers();
        setUsers(usersData);
      } catch (error) {
        setUsers([]);
        console.error('Помилка завантаження користувачів:', error);
      }
    };
    loadUsers();
  }, []);
  // --- Додаю month, year, storageKey для табеля ---
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [year, setYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(month);
  const [reportYear, setReportYear] = useState(year);
  const [reportPeriodStart, setReportPeriodStart] = useState('');
  const [reportPeriodEnd, setReportPeriodEnd] = useState('');
  const [reportResultOpen, setReportResultOpen] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  // Додаю окремий стан для звіту за період
  const [reportResultByPeriod, setReportResultByPeriod] = useState(null);
  // --- Масив співробітників для табеля ---
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Якщо користувач має роль 'service'
      if (u.role !== 'service') return false;
      // Якщо регіон користувача "Україна" - показуємо всіх
      if (user?.region === 'Україна') return true;
      // Якщо регіон користувача не "Україна" - показуємо тільки його регіон
      if (user?.region && user.region !== 'Україна') {
        return u.region === user.region;
      }
      // Якщо регіон користувача не встановлений - показуємо всіх
      return true;
    });
  }, [users, user?.region]);
  // Групуємо користувачів по регіонам для відображення
  const usersByRegion = filteredUsers.reduce((acc, user) => {
    const region = user.region || 'Не вказано';
    if (!acc[region]) {
      acc[region] = [];
    }
    acc[region].push(user);
    return acc;
  }, {});
  // Отримуємо список регіонів для відображення
  const regions = Object.keys(usersByRegion).sort();
  // --- Колонки для TaskTable ---
  const columns = allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: true
  }));
  // Переміщаю колонку 'Підтвердження' на друге місце
  const columnsWithApprove = [
    { key: 'approvedByRegionalManager', label: 'Підтвердження' },
    ...columns.filter(c => c.key !== 'approvedByRegionalManager')
  ];
  // --- Функція handleSave для збереження завдань ---
  async function handleSave(task) {
    setLoading(true);
    let updatedTask = null;
    if (editTask && editTask.id) {
      updatedTask = await tasksAPI.update(editTask.id, task);
    } else {
      updatedTask = await tasksAPI.add(task);
    }
    // Оновлюємо дані з бази після збереження
    try {
      const freshTasks = await tasksAPI.getAll();
      setTasks(freshTasks);
    } catch (error) {
      console.error('[ERROR] RegionalManagerArea handleSave - помилка оновлення даних з бази:', error);
    }
    // Закриваємо модальне вікно
    setEditTask(null);
    setLoading(false);
  }
  // --- Функція handleEdit для редагування задачі ---
  function handleEdit(task) {
    setEditTask(task);
    setModalOpen(true);
  }
  // --- Функція handleFilter для TaskTable ---
  const handleFilter = useCallback(e => {
    console.log('DEBUG RegionalManagerArea: handleFilter - e.target.name =', e.target.name);
    console.log('DEBUG RegionalManagerArea: handleFilter - e.target.value =', e.target.value);
    setFilters(prevFilters => {
      const newFilters = { ...prevFilters, [e.target.name]: e.target.value };
      console.log('DEBUG RegionalManagerArea: handleFilter - old filters =', prevFilters);
      console.log('DEBUG RegionalManagerArea: handleFilter - newFilters =', newFilters);
      return newFilters;
    });
  }, []);
  // --- Функція handleApprove для підтвердження задач ---
  async function handleApprove(id, approved, comment) {
    try {
      const t = tasks.find(t => t.id === id);
      if (!t) return;
      let next = {
        ...t,
        approvedByRegionalManager: approved,
        regionalManagerComment: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.regionalManagerComment)
      };
      let bonusApprovalDate = t.bonusApprovalDate;
      if (
        next.status === 'Виконано' &&
        (next.approvedByWarehouse === 'Підтверджено' || next.approvedByWarehouse === true) &&
        (next.approvedByAccountant === 'Підтверджено' || next.approvedByAccountant === true)
      ) {
        const d = new Date();
        const currentDay = d.getDate();
        const currentMonth = d.getMonth() + 1;
        const currentYear = d.getFullYear();
        
        // Перевіряємо дату виконання робіт
        const workDate = new Date(t.date);
        const workMonth = workDate.getMonth() + 1;
        const workYear = workDate.getFullYear();
        
        // Нова логіка: якщо день >= 16 і місяць затвердження != місяць виконання
        if (currentDay >= 16 && (workMonth !== currentMonth || workYear !== currentYear)) {
          // Встановлюємо поточний місяць + 1
          if (currentMonth === 12) {
            bonusApprovalDate = `01-${currentYear + 1}`;
          } else {
            bonusApprovalDate = `${String(currentMonth + 1).padStart(2, '0')}-${currentYear}`;
          }
        } else {
          // Стара логіка: поточний місяць
          bonusApprovalDate = `${String(currentMonth).padStart(2, '0')}-${currentYear}`;
        }
      }
      const updated = await tasksAPI.update(id, {
        ...next,
        bonusApprovalDate
      });
      
      // Оновлюємо дані через refreshData
      await refreshData(activeTab);
    } catch (error) {
      console.error('[ERROR] handleApprove - помилка підтвердження:', error);
      alert('Помилка підтвердження заявки');
    }
  }
  // --- Аналогічно для handleApprove адміністратора ---
  const handleApproveAdmin = async (id, approved, comment) => {
    setLoading(true);
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    let next = {
      ...t,
      approvedByAccountant: approved,
      accountantComment: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.accountantComment),
      accountantComments: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.accountantComments)
    };
    let bonusApprovalDate = t.bonusApprovalDate;
    if (
      next.status === 'Виконано' &&
      (next.approvedByWarehouse === 'Підтверджено' || next.approvedByWarehouse === true) &&
      (next.approvedByAccountant === 'Підтверджено' || next.approvedByAccountant === true)
    ) {
      const d = new Date();
      const currentDay = d.getDate();
      const currentMonth = d.getMonth() + 1;
      const currentYear = d.getFullYear();
      
      // Перевіряємо дату виконання робіт
      const workDate = new Date(t.date);
      const workMonth = workDate.getMonth() + 1;
      const workYear = workDate.getFullYear();
      
      // Нова логіка: якщо день >= 16 і місяць затвердження != місяць виконання
      if (currentDay >= 16 && (workMonth !== currentMonth || workYear !== currentYear)) {
        // Встановлюємо поточний місяць + 1
        if (currentMonth === 12) {
          bonusApprovalDate = `01-${currentYear + 1}`;
        } else {
          bonusApprovalDate = `${String(currentMonth + 1).padStart(2, '0')}-${currentYear}`;
        }
      } else {
        // Стара логіка: поточний місяць
        bonusApprovalDate = `${String(currentMonth).padStart(2, '0')}-${currentYear}`;
      }
    }
    const updated = await tasksAPI.update(id, {
      ...next,
      bonusApprovalDate
    });
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    setLoading(false);
  };
  // --- Додаю month, year, storageKey для табеля ---
  const storageKey = `timesheetData_${year}_${month}`;
  // Кількість днів у місяці
  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }
  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({length: daysInMonth}, (_, i) => i + 1);
  // --- Функція для зміни значень у таблиці часу ---
  function handleChange(userId, day, value) {
    console.log(`[DEBUG] handleChange: userId=${userId}, day=${day}, value=${value}`);
    if (!userId) {
      console.log(`[ERROR] handleChange: userId is undefined, skipping update`);
      return;
    }
    setData(prev => {
      const userData = prev[userId] || {};
      const newUserData = { ...userData, [day]: value };
      const total = days.reduce((sum, d) => sum + (isNaN(Number(newUserData[d])) ? 0 : Number(newUserData[d])), 0);
      newUserData.total = total;
      console.log(`[DEBUG] handleChange: newUserData for ${userId}:`, newUserData);
      return { ...prev, [userId]: newUserData };
    });
  }
  
  // --- Функція для зміни значень у таблиці часу сервісної служби ---
  function handleServiceChange(userId, day, value) {
    console.log(`[DEBUG] handleServiceChange: userId=${userId}, day=${day}, value=${value}`);
    if (!userId) {
      console.log(`[ERROR] handleServiceChange: userId is undefined, skipping update`);
      return;
    }
    setServiceData(prev => {
      const userData = prev[userId] || {};
      const newUserData = { ...userData, [day]: value };
      const total = days.reduce((sum, d) => sum + (isNaN(Number(newUserData[d])) ? 0 : Number(newUserData[d])), 0);
      newUserData.total = total;
      console.log(`[DEBUG] handleServiceChange: newUserData for ${userId}:`, newUserData);
      return { ...prev, [userId]: newUserData };
    });
  }
  // --- Функції для синхронізації з сервером ---
  // Визначаємо регіон для збереження/завантаження даних
  // Якщо адмін з регіоном "Україна" - зберігаємо дані для кожного регіону окремо
  // Якщо регіональний керівник - зберігаємо для його регіону
  const getRegionForTimesheet = (targetRegion) => {
    // Якщо передано конкретний регіон (для збереження конкретного регіону)
    if (targetRegion) {
      return targetRegion;
    }
    // Якщо адмін з регіоном "Україна" - використовуємо перший регіон з filteredUsers
    if (user?.region === 'Україна' && filteredUsers.length > 0) {
      return filteredUsers[0].region || 'Без регіону';
    }
    // Інакше використовуємо регіон користувача
    return user?.region || 'Без регіону';
  };
  
  const loadTimesheetFromServer = async (targetRegion) => {
    try {
      const region = getRegionForTimesheet(targetRegion);
      console.log('[TIMESHEET] Loading from server for region:', region, 'year:', year, 'month:', month);
      const response = await authenticatedFetch(`${API_BASE_URL}/timesheet?region=${encodeURIComponent(region)}&year=${year}&month=${month}&type=regular`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      console.log('[TIMESHEET] Server response for region:', region, 'success:', result.success, 'has timesheet:', !!result.timesheet);
      if (result.success && result.timesheet) {
        const dataKeys = result.timesheet.data ? Object.keys(result.timesheet.data).length : 0;
        const payDataKeys = result.timesheet.payData ? Object.keys(result.timesheet.payData).length : 0;
        console.log('[TIMESHEET] Loaded from server for region:', region, 'data keys:', dataKeys, 'payData keys:', payDataKeys);
        return {
          data: result.timesheet.data || null,
          payData: result.timesheet.payData || null,
          summary: result.timesheet.summary || null
        };
      }
      console.log('[TIMESHEET] No data found for region:', region);
      return null;
    } catch (error) {
      console.error('[TIMESHEET] Error loading from server for region:', targetRegion, error);
      return null;
    }
  };
  
  const saveTimesheetToServer = async (timesheetData, payDataValue, summaryValue, targetRegion) => {
    try {
      if (!user?.id && !user?._id) {
        console.log('[TIMESHEET] No user ID, skipping server save');
        return false;
      }
      const region = getRegionForTimesheet(targetRegion);
      const userId = user.id || user._id;
      const userName = user.name || user.login || 'unknown';
      
      const payload = {
        region,
        year,
        month,
        type: 'regular',
        data: timesheetData || {},
        payData: payDataValue || {},
        summary: summaryValue || {},
        createdBy: `${userName} (${userId})`
      };
      
      console.log('[TIMESHEET] Saving to server for region:', region, 'payload:', {
        region,
        year,
        month,
        dataKeys: Object.keys(timesheetData || {}),
        payDataKeys: Object.keys(payDataValue || {})
      });
      
      const response = await authenticatedFetch(`${API_BASE_URL}/timesheet`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TIMESHEET] Server error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const result = await response.json();
      if (result.success) {
        console.log('[TIMESHEET] Saved to server successfully for region:', region);
        return true;
      } else {
        console.error('[TIMESHEET] Server returned success:false:', result);
        return false;
      }
    } catch (error) {
      console.error('[TIMESHEET] Error saving to server for region:', targetRegion, error);
      return false;
    }
  };
  
  // Стан завантаження даних з сервера
  const [timesheetLoading, setTimesheetLoading] = useState(true);
  
  // --- Автоматичне заповнення: робочі дні = 8, вихідні = 0 ---
  function getDefaultTimesheet() {
    const result = {};
    filteredUsers.forEach(u => {
      const userData = {};
      days.forEach(d => {
        const date = new Date(year, month - 1, d); // JS: month 0-11
        const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
        userData[d] = (dayOfWeek === 0 || dayOfWeek === 6) ? 0 : 8;
      });
      userData.total = days.reduce((sum, d) => sum + (userData[d] || 0), 0);
      result[u.id] = userData;
    });
    return result;
  }
  
  // --- Підсумковий блок ---
  // Summary тепер завантажується з сервера, не з localStorage
  const summaryKey = `timesheetSummary_${year}_${month}`;
  const [summary, setSummary] = useState(() => {
    // Кількість робочих днів у місяці
    let workDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) workDays++;
    }
    return { workDays, workHours: workDays * 8 };
  });
  
  // --- Параметри для кожного співробітника ---
  // payData тепер завантажується з сервера, не з localStorage
  const [payData, setPayData] = useState(() => ({}));
  
  // --- Оголошення data/setData для регіонального керівника ---
  const [data, setData] = useState(() => getDefaultTimesheet());
  
  // Завантажуємо дані ТІЛЬКИ з сервера при зміні storageKey (year/month)
  // Завантажуємо дані для всіх регіонів, які відображаються
  useEffect(() => {
    const loadData = async () => {
      // Якщо filteredUsers ще не завантажені, чекаємо
      if (!filteredUsers || filteredUsers.length === 0) {
        console.log('[TIMESHEET] filteredUsers порожній, чекаємо...');
        return;
      }
      
      console.log('[TIMESHEET] Starting data load, storageKey:', storageKey, 'year:', year, 'month:', month, 'filteredUsers:', filteredUsers.length);
      setTimesheetLoading(true);
      try {
        // Визначаємо регіони для завантаження
        const allRegions = Array.from(new Set(filteredUsers.map(u => u.region || 'Без регіону')));
        const regionsToLoad = user?.region === 'Україна' ? allRegions : [user?.region || 'Без регіону'];
        console.log('[TIMESHEET] Regions to load:', regionsToLoad);
        
        // Завантажуємо дані для кожного регіону та об'єднуємо їх
        let mergedData = {};
        let mergedPayData = {};
        let mergedSummary = {};
        
        for (const region of regionsToLoad) {
          const serverTimesheet = await loadTimesheetFromServer(region);
          if (serverTimesheet) {
            if (serverTimesheet.data) {
              mergedData = { ...mergedData, ...serverTimesheet.data };
              console.log('[TIMESHEET] Merged data from region:', region, 'total keys:', Object.keys(mergedData).length);
            }
            if (serverTimesheet.payData) {
              mergedPayData = { ...mergedPayData, ...serverTimesheet.payData };
            }
            if (serverTimesheet.summary) {
              mergedSummary = { ...mergedSummary, ...serverTimesheet.summary };
            }
          }
        }
        
        console.log('[TIMESHEET] Final merged data keys:', Object.keys(mergedData).length, 'payData keys:', Object.keys(mergedPayData).length);
        
        // Якщо є дані з сервера, використовуємо їх
        if (Object.keys(mergedData).length > 0) {
          const defaultData = getDefaultTimesheet();
          const finalData = { ...mergedData };
          filteredUsers.forEach(u => {
            if (!finalData[u.id || u._id]) {
              finalData[u.id || u._id] = defaultData[u.id || u._id];
            }
          });
          console.log('[TIMESHEET] Setting data with', Object.keys(finalData).length, 'users');
          setData(finalData);
        } else {
          console.log('[TIMESHEET] No data from server, using default');
          setData(getDefaultTimesheet());
        }
        
        if (Object.keys(mergedPayData).length > 0) {
          setPayData(mergedPayData);
        } else {
          setPayData({});
        }
        
        if (Object.keys(mergedSummary).length > 0) {
          let workDays = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const dayOfWeek = date.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) workDays++;
          }
          setSummary({ ...mergedSummary, workDays, workHours: workDays * 8 });
        } else {
          let workDays = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const dayOfWeek = date.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) workDays++;
          }
          setSummary({ workDays, workHours: workDays * 8 });
        }
      } catch (error) {
        console.error('[TIMESHEET] Error loading data:', error);
        setData(getDefaultTimesheet());
        setPayData({});
        let workDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(year, month - 1, d);
          const dayOfWeek = date.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) workDays++;
        }
        setSummary({ workDays, workHours: workDays * 8 });
      } finally {
        setTimesheetLoading(false);
      }
    };
    loadData();
  }, [storageKey, filteredUsers.length]); // Додано filteredUsers.length, щоб завантажувати після завантаження користувачів
  // Додаємо нових користувачів при зміні filteredUsers, не перезаписуючи існуючі дані
  // Використовуємо useRef для відстеження попереднього списку користувачів
  const prevFilteredUsersRef = useRef([]);
  useEffect(() => {
    // Перевіряємо, чи дійсно змінився список користувачів
    const currentUserIds = filteredUsers.map(u => u.id || u._id).sort().join(',');
    const prevUserIds = prevFilteredUsersRef.current.map(u => u.id || u._id).sort().join(',');
    
    // Якщо список не змінився, не робимо нічого
    if (currentUserIds === prevUserIds) {
      return;
    }
    
    // Оновлюємо ref
    prevFilteredUsersRef.current = filteredUsers;
    
    // Додаємо тільки нових користувачів
    setData(prev => {
      const defaultData = getDefaultTimesheet();
      const mergedData = { ...prev };
      let hasChanges = false;
      filteredUsers.forEach(u => {
        const userId = u.id || u._id;
        // Додаємо тільки якщо користувача немає в даних
        if (!mergedData[userId]) {
          mergedData[userId] = defaultData[userId] || {};
          hasChanges = true;
        }
      });
      return hasChanges ? mergedData : prev;
    });
  }, [filteredUsers]);
  // Зберігаємо дані ТІЛЬКИ на сервер (без localStorage)
  // Зберігаємо дані для кожного регіону окремо
  useEffect(() => {
    // Пропускаємо збереження під час початкового завантаження
    if (timesheetLoading) return;
    
    // Зберігаємо на сервер (з невеликою затримкою для дебаунсу)
    const saveTimeout = setTimeout(() => {
      // Визначаємо регіони для збереження
      const allRegions = Array.from(new Set(filteredUsers.map(u => u.region || 'Без регіону')));
      const regionsToSave = user?.region === 'Україна' ? allRegions : [user?.region || 'Без регіону'];
      
      // Зберігаємо дані для кожного регіону окремо
      regionsToSave.forEach(region => {
        // Фільтруємо дані тільки для користувачів цього регіону
        const regionUsers = filteredUsers.filter(u => (u.region || 'Без регіону') === region);
        const regionData = {};
        const regionPayData = {};
        
        regionUsers.forEach(u => {
          const userId = u.id || u._id;
          if (data[userId]) {
            regionData[userId] = data[userId];
          }
          if (payData[userId]) {
            regionPayData[userId] = payData[userId];
          }
        });
        
        // Зберігаємо дані для цього регіону тільки якщо є дані для збереження
        // (або дані по годинах, або дані по зарплаті)
        if (Object.keys(regionData).length > 0 || Object.keys(regionPayData).length > 0) {
          saveTimesheetToServer(regionData, regionPayData, summary, region);
        } else {
          console.log('[TIMESHEET] Skipping save for region:', region, '- no data to save');
        }
      });
    }, 1000); // Затримка 1 секунда для дебаунсу
    
    return () => clearTimeout(saveTimeout);
  }, [data, storageKey, payData, summary, timesheetLoading, filteredUsers, user?.region]);
  
  // --- Функція для зміни параметрів виплат ---
  const handlePayChange = (userId, field, value) => {
    console.log('🔧 handlePayChange called:', { userId, field, value });
    console.log('🔧 Current payData before update:', payData);
    
    // Логування на сервер
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: `handlePayChange: userId=${userId}, field=${field}, value=${value}`, 
        type: 'info' 
      })
    }).catch(err => console.error('Failed to log to server:', err));
    
    setPayData(prev => {
      const userPay = prev[userId] || { salary: '', bonus: '' };
      const newUserPay = { ...userPay, [field]: value };
      const newData = { ...prev, [userId]: newUserPay };
      console.log('🔧 Updated payData state:', newData);
      
      // Логування оновлення стану
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: `payData updated: ${JSON.stringify(newData)}`, 
          type: 'info' 
        })
      }).catch(err => console.error('Failed to log state update:', err));
      
      return newData;
    });
    
    console.log('🔧 handlePayChange completed');
  };
  // --- Експорт у Excel (CSV) ---
  function exportToCSV() {
    let csv = '';
    // Заголовок
    csv += ['ПІБ', ...days.map(d => `День ${d}`), 'Всього годин', 'Оклад, грн', 'Бонус, грн', 'Підсумкова виплата, грн'].join(';') + '\n';
    filteredUsers.forEach(u => {
      const row = [];
      row.push(u.name);
      days.forEach(d => row.push(data[u.id || u._id]?.[d] || ''));
      row.push(data[u.id || u._id]?.total || 0);
      const salary = Number(payData[u.id || u._id]?.salary) || 0;
      const bonus = Number(payData[u.id || u._id]?.bonus) || 0;
      const payout = summary.workHours > 0 ? Math.round((salary * (data[u.id || u._id]?.total || 0) / summary.workHours) + bonus) : 0;
      row.push(salary);
      row.push(bonus);
      row.push(payout);
      csv += row.join(';') + '\n';
    });
    // Додаємо BOM для Excel
    csv = '\uFEFF' + csv;
    // Завантаження
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Табель_${year}_${month}${region ? '_' + region : ''}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  // --- Масиви місяців і років ---
  const months = [
    'Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'
  ];
  const years = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) years.push(y);
  // --- Функція для формування звіту ---
  const handleFormReport = (type) => {
    if (type === 'month') {
      handleGenerateReport();
    } else if (type === 'period') {
      handleGenerateReportByPeriod();
    }
  };
  const handleGenerateReport = async () => {
    // Використовуємо ту ж логіку фільтрації, що й для основного filteredUsers
    const filteredUsers = users.filter(u => {
      // Якщо користувач має роль 'service'
      if (u.role !== 'service') return false;
      // Якщо регіон користувача "Україна" - показуємо всіх
      if (user?.region === 'Україна') return true;
      // Якщо регіон користувача не "Україна" - показуємо тільки його регіон
      if (user?.region && user.region !== 'Україна') {
        return u.region === user.region;
      }
      // Якщо регіон користувача не встановлений - показуємо всіх
      return true;
    });
    // Використовуємо year та month для звіту, щоб дані співпадали з основною таблицею
    const reportYearForData = year;
    const reportMonthForData = month;
    
    // Завантажуємо дані з сервера
    let data = {};
    let summary = {};
    let payData = {};
    
    try {
      if (user?.id || user?._id) {
        const userId = user.id || user._id;
        // Завантажуємо дані для кожного регіону окремо
        const allRegions = Array.from(new Set(filteredUsers.map(u => u.region || 'Без регіону')));
        const regionsToLoad = user?.region === 'Україна' ? allRegions : [user?.region || 'Без регіону'];
        
        for (const region of regionsToLoad) {
          const response = await fetch(`${API_BASE_URL}/timesheet?region=${encodeURIComponent(region)}&year=${reportYearForData}&month=${reportMonthForData}&type=regular`);
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.timesheet) {
              // Об'єднуємо дані з різних регіонів
              data = { ...data, ...(result.timesheet.data || {}) };
              payData = { ...payData, ...(result.timesheet.payData || {}) };
              summary = result.timesheet.summary || summary;
            }
          }
        }
      }
    } catch (error) {
      console.error('[REPORT] Error loading timesheet from server:', error);
      // Використовуємо поточні дані зі стану як fallback
      data = data || {};
      payData = payData || {};
      summary = summary || {};
    }
    // Використовуємо завдання з API замість localStorage
    const isApproved = v => v === true || v === 'Підтверджено';
    const monthStr = String(reportMonthForData).padStart(2, '0');
    const yearStr = String(reportYearForData);
    let table = (
      <div>
        {filteredUsers.map(u => {
          const total = data[u.id || u._id]?.total || 0;
          const salary = Number(payData[u.id || u._id]?.salary) || 25000;
          const bonus = Number(payData[u.id || u._id]?.bonus) || 0;
          
          // Розрахунок понаднормових годин - перепрацювання за день (більше 8 годин)
          let overtime = 0;
          let weekendHours = 0; // Години на вихідних (субота, неділя)
          let workDaysTotal = 0; // Години тільки робочих днів (без вихідних)
          
          const reportDays = Array.from({length: getDaysInMonth(reportYearForData, reportMonthForData)}, (_, i) => i + 1);
          reportDays.forEach(d => {
            const dayHours = parseFloat(data[u.id || u._id]?.[d]) || 0;
            const date = new Date(reportYearForData, reportMonthForData - 1, d);
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            
            // Години робочих днів (без вихідних)
            if (!isWeekend) {
              workDaysTotal += dayHours;
            }
            
            // Понаднормові години - більше 8 годин за день (тільки робочі дні)
            if (!isWeekend && dayHours > 8) {
              overtime += (dayHours - 8);
            }
            
            // Години на вихідних
            if (isWeekend && dayHours > 0) {
              weekendHours += dayHours;
            }
          });
          
          const overtimeRate = summary.workHours > 0 ? (salary / summary.workHours) * 2 : 0;
          const overtimePay = overtime * overtimeRate;
          const weekendOvertimePay = weekendHours * overtimeRate;
          const basePay = Math.round(salary * Math.min(workDaysTotal, summary.workHours || 168) / (summary.workHours || 168));
          let engineerBonus = 0;
          let details = [];
          allTasks.forEach(t => {
            if (
              t.status === 'Виконано' &&
              isApproved(t.approvedByWarehouse) &&
              isApproved(t.approvedByAccountant)
            ) {
              let bonusApprovalDate = t.bonusApprovalDate;
              // Автоконвертація з YYYY-MM-DD у MM-YYYY
              if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
                const [year, month] = bonusApprovalDate.split('-');
                bonusApprovalDate = `${month}-${year}`;
              }
              const tDate = t.date;
              if (tDate && bonusApprovalDate) {
                const workDate = new Date(tDate);
                // bonusApprovalDate має формат "MM-YYYY", наприклад "04-2025"
                const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
                const approvalMonth = parseInt(approvalMonthStr);
                const approvalYear = parseInt(approvalYearStr);
                const workMonth = workDate.getMonth() + 1;
                const workYear = workDate.getFullYear();
                // Визначаємо місяць для нарахування премії
                let bonusMonth, bonusYear;
                if (workMonth === approvalMonth && workYear === approvalYear) {
                  // Якщо місяць/рік виконання співпадає з місяцем/роком затвердження
                  bonusMonth = workMonth;
                  bonusYear = workYear;
                } else {
                  // Якщо не співпадає - нараховуємо на попередній місяць від дати затвердження
                  if (approvalMonth === 1) {
                    bonusMonth = 12;
                    bonusYear = approvalYear - 1;
                  } else {
                    bonusMonth = approvalMonth - 1;
                    bonusYear = approvalYear;
                  }
                }
                // Перевіряємо чи це той місяць, який ми шукаємо
                if (bonusMonth === month && bonusYear === year) {
                  const workPrice = parseFloat(t.workPrice) || 0;
                  const bonusVal = workPrice * 0.25;
                  let addBonus = 0;
                  // Діагностика імен - враховуємо всіх 6 інженерів
                  const engineers = [
                    (t.engineer1 || '').trim(),
                    (t.engineer2 || '').trim(),
                    (t.engineer3 || '').trim(),
                    (t.engineer4 || '').trim(),
                    (t.engineer5 || '').trim(),
                    (t.engineer6 || '').trim()
                  ].filter(eng => eng && eng.length > 0);
                  
                  const userName = (u.name || '').trim();
                  const engineerCount = engineers.length;
                  
                  if (engineers.includes(userName) && engineerCount > 0) {
                    addBonus = bonusVal / engineerCount;
                  }
                  if (addBonus > 0) {
                    engineerBonus += addBonus;
                    console.log(`[DEBUG] Adding bonus for ${userName}: ${addBonus}, reportWithDetails: ${reportWithDetails}`);
                    if (reportWithDetails) {
                      const detailItem = {
                        date: bonusApprovalDate, // Показуємо дату затвердження премії
                        client: t.client,
                        address: t.address,
                        invoice: t.invoice,
                        paymentType: t.paymentType,
                        serviceTotal: t.serviceTotal,
                        equipment: t.equipment,
                        equipmentSerial: t.equipmentSerial,
                        bonus: addBonus,
                      };
                      details.push(detailItem);
                      console.log(`[DEBUG] Added detail item:`, detailItem);
                    }
                  }
                } else {
                  // Діагностика чому не співпав місяць/рік
                }
              }
            }
          });
          const payout = basePay + overtimePay + bonus + engineerBonus + weekendOvertimePay;
          return (
            <div key={u.id || u._id} style={{background:'#f8fafc',border:'2px solid #1976d2',borderRadius:12,margin:'24px 0',padding:'18px 18px 8px 18px',boxShadow:'0 2px 12px #0001'}}>
              <div style={{fontWeight:700,fontSize:20,marginBottom:8,color:'#1976d2',letterSpacing:1}}>{u.name}</div>
              <table style={{width:'100%', color:'#222', background:'#fff', borderRadius:8, overflow:'hidden', fontSize:'1rem', marginBottom:details.length>0?16:0}}>
                <thead>
                  <tr style={{background:'#ffe600', color:'#222', fontWeight:700}}>
                    <th>Ставка</th>
                    <th>Відпрацьована ставка, год</th>
                    <th>Понаднормові роботи, год</th>
                    <th>Ціна за год, понаднормові</th>
                    <th>Доплата за понаднормові</th>
                    <th>Відпрацьована ставка, грн</th>
                    <th>Премія за виконання сервісних робіт, грн</th>
                    <th>Відпрацьовано годин в Сб,Нд</th>
                    <th>Нарахованно за перепрацювання за Сб,Нд</th>
                    <th>Загальна сума по оплаті за місяць</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{background:'#e3f2fd',fontWeight:600}}>
                    <td>{salary}</td>
                    <td>{workDaysTotal}</td>
                    <td>{overtime}</td>
                    <td>{overtimeRate.toFixed(2)}</td>
                    <td>{overtimePay.toFixed(2)}</td>
                    <td>{basePay}</td>
                    <td style={{background:'#ffe066'}}>{engineerBonus.toFixed(2)}</td>
                    <td>{weekendHours}</td>
                    <td>{weekendOvertimePay.toFixed(2)}</td>
                    <td style={{background:'#b6ffb6'}}>{payout.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              {reportWithDetails && details.length > 0 && (
                <div style={{background:'#f1f8e9',borderRadius:8,padding:'8px 8px 8px 8px',marginTop:0}}>
                  <div style={{fontWeight:600,marginBottom:4,color:'#222'}}>Виконані роботи з премією ({details.length} заявок):</div>
                  <table style={{width:'100%',fontSize:'0.98em',background:'#f1f8e9', color:'#222'}}>
                    <thead>
                      <tr style={{background:'#e0e0e0', color:'#222'}}>
                        <th>Дата затвердження премії</th>
                        <th>Замовник</th>
                        <th>Адреса</th>
                        <th>Номер рахунку</th>
                        <th>Вид оплати</th>
                        <th>Загальна сума послуги</th>
                        <th>Тип обладнання</th>
                        <th>Заводський номер обладнання</th>
                        <th><b>Найменування робіт</b></th>
                        <th>Премія, грн</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((d, idx) => (
                        <tr key={idx}>
                          <td>{d.date}</td>
                          <td>{d.client}</td>
                          <td>{d.address}</td>
                          <td>{d.invoice}</td>
                          <td>{d.paymentType}</td>
                          <td>{d.serviceTotal}</td>
                          <td>{d.equipment}</td>
                          <td>{d.equipmentSerial}</td>
                          <td>{tasks.find(t => t.bonusApprovalDate === d.date && t.client === d.client && t.address === d.address && t.equipment === d.equipment && t.equipmentSerial === d.equipmentSerial && t.invoice === d.invoice && t.paymentType === d.paymentType && t.serviceTotal === d.serviceTotal)?.work || ''}</td>
                          <td style={{fontWeight:600}}>{d.bonus.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
    setReportResult(table);
    setReportResultByPeriod(null); // очищаю період
    setReportResultOpen(true);
  };
  const handleGenerateReportByPeriod = () => {
    // Implement period report generation logic
  };
  const handleOpenReport = () => {
    generateReport();
    // Формуємо HTML для нового вікна
    const html = `
      <html>
      <head>
        <title>Загальний звіт</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; color: #222; padding: 24px; }
          h2 { color: #1976d2; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
          th, td { border: 1px solid #000; padding: 6px 10px; text-align: center; }
          th { background: #ffe600; color: #222; }
        </style>
      </head>
      <body>
        <h2>Загальний звіт</h2>
        <table>
          <thead>
            <tr>
              ${selectedFields.map(field => `<th>${availableFields.find(f => f.name === field)?.label || field}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${reportData.map(group => group.items.map(item => `
              <tr>
                ${selectedFields.map(field => `<td>${item[field] || ''}</td>`).join('')}
              </tr>
            `).join('')).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };
  const handleCloseReport = () => {
    setReportModalOpen(false);
  };
  // Додаю стан для звіту
  const [showTimeReport, setShowTimeReport] = useState(false);
  const [timeReportContent, setTimeReportContent] = useState(null);
  // Функція формування звіту у новому вікні
  const handleFormTimeReport = () => {
    // Додаю детальний вивід задач для діагностики
    // Додатковий лог по bonusApprovalDate
    allTasks.forEach((t, i) => {
      if (!t.bonusApprovalDate) {
        console.warn(`[WARN][REPORT] Task #${i} (id=${t.id}) has no bonusApprovalDate`, t);
      } else if (!/^[\d]{2}-[\d]{4}$/.test(t.bonusApprovalDate) && !/^\d{4}-\d{2}-\d{2}$/.test(t.bonusApprovalDate)) {
        console.error(`[ERROR][REPORT] Task #${i} (id=${t.id}) has invalid bonusApprovalDate format:`, t.bonusApprovalDate, t);
      }
    });
    const monthName = months[month - 1];
    const reportTitle = `Звіт по табелю часу та виконаних робіт за ${monthName} ${year}`;
    // Логіка групування по регіонам для звіту
    const allRegions = Array.from(new Set(filteredUsers.map(u => u.region || 'Без регіону')));
    const showRegions = user?.region === 'Україна' ? allRegions : [user?.region || 'Без регіону'];
    // Використовуємо year та month для звіту, щоб дані співпадали з основною таблицею
    const reportYearForData = year;
    const reportMonthForData = month;
    // Генеруємо звіт з групуванням по регіонам
    const generateRegionReport = (region) => {
      const regionUsers = filteredUsers.filter(u => (u.region || 'Без регіону') === region);
      
      // Фільтруємо користувачів з нульовою загальною сумою по оплаті
      const usersWithPayment = regionUsers.filter(u => {
        const total = data[u.id || u._id]?.total || 0;
        const salary = Number(payData[u.id || u._id]?.salary) || 25000;
        const bonus = Number(payData[u.id || u._id]?.bonus) || 0;
        
        // Розрахунок понаднормових годин - перепрацювання за день (більше 8 годин)
        let overtime = 0;
        let weekendHours = 0;
        let workDaysTotal = 0; // Години тільки робочих днів (без вихідних)
        
        const reportDays = Array.from({length: getDaysInMonth(reportYearForData, reportMonthForData)}, (_, i) => i + 1);
        reportDays.forEach(d => {
          const dayHours = parseFloat(data[u.id || u._id]?.[d]) || 0;
          const date = new Date(reportYearForData, reportMonthForData - 1, d);
          const dayOfWeek = date.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          // Години робочих днів (без вихідних)
          if (!isWeekend) {
            workDaysTotal += dayHours;
          }
          
          // Понаднормові години - більше 8 годин за день (тільки робочі дні)
          if (!isWeekend && dayHours > 8) {
            overtime += (dayHours - 8);
          }
          
          if (isWeekend && dayHours > 0) {
            weekendHours += dayHours;
          }
        });
        
        const overtimeRate = summary.workHours > 0 ? (salary / summary.workHours) * 2 : 0;
        const overtimePay = overtime * overtimeRate;
        const weekendOvertimePay = weekendHours * overtimeRate;
        // Нормативні години робочих днів (без понаднормових) - щоб уникнути подвійної оплати
        const normalHours = workDaysTotal - overtime;
        const basePay = Math.round(salary * Math.min(normalHours, summary.workHours) / summary.workHours);
        
        // Розраховуємо премію за виконання сервісних робіт
        let engineerBonus = 0;
        allTasks.forEach(t => {
          if (
            t.status === 'Виконано' &&
            isApproved(t.approvedByWarehouse) &&
            isApproved(t.approvedByAccountant)
          ) {
            let bonusApprovalDate = t.bonusApprovalDate;
            if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
              const [year, month] = bonusApprovalDate.split('-');
              bonusApprovalDate = `${month}-${year}`;
            }
            const workDate = new Date(t.date);
            const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
            const approvalMonth = parseInt(approvalMonthStr);
            const approvalYear = parseInt(approvalYearStr);
            const workMonth = workDate.getMonth() + 1;
            const workYear = workDate.getFullYear();
            let bonusMonth, bonusYear;
            if (workMonth === approvalMonth && workYear === approvalYear) {
              bonusMonth = workMonth;
              bonusYear = workYear;
            } else {
              if (approvalMonth === 1) {
                bonusMonth = 12;
                bonusYear = approvalYear - 1;
              } else {
                bonusMonth = approvalMonth - 1;
                bonusYear = approvalYear;
              }
            }
            if (bonusMonth === reportMonthForData && bonusYear === reportYearForData) {
              const workPrice = parseFloat(t.workPrice) || 0;
              const bonusVal = workPrice * 0.25;
              // Враховуємо всіх 6 інженерів
              const engineers = [
                (t.engineer1 || '').trim(),
                (t.engineer2 || '').trim(),
                (t.engineer3 || '').trim(),
                (t.engineer4 || '').trim(),
                (t.engineer5 || '').trim(),
                (t.engineer6 || '').trim()
              ].filter(eng => eng && eng.length > 0);
              
              if (engineers.includes(u.name) && engineers.length > 0) {
                engineerBonus += bonusVal / engineers.length;
              }
            }
          }
        });
        
        // Перераховуємо basePay з урахуванням мінімальних годин для користувачів з премією
        const effectiveNormalHours = engineerBonus > 0 && normalHours === 0 ? 1 : normalHours;
        const adjustedBasePay = Math.round(salary * Math.min(effectiveNormalHours, summary.workHours) / summary.workHours);
        const payout = adjustedBasePay + overtimePay + bonus + engineerBonus + weekendOvertimePay;
        // Включаємо користувачів тільки з "Загальна сума по оплаті за місяць" більша за нуль
        return payout > 0;
      });
      // Формування таблиці нарахувань для регіону
      const accrualTable = `
        <h4>Таблиця нарахування по персоналу - Регіон: ${region}</h4>
        <table>
          <thead>
            <tr>
              <th>ПІБ</th>
              <th>Ставка</th>
              <th>Відпрацьована ставка, год</th>
              <th>Понаднормові роботи, год</th>
              <th>Ціна за год, понаднормові</th>
              <th>Доплата за понаднормові</th>
              <th>Відпрацьована ставка, грн</th>
              <th>Премія за виконання сервісних робіт, грн</th>
              <th>Відпрацьовано годин в Сб,Нд</th>
              <th>Нарахованно за перепрацювання за Сб,Нд</th>
              <th>Загальна сума по оплаті за місяць</th>
            </tr>
          </thead>
          <tbody>
            ${usersWithPayment.map(u => {
              const total = data[u.id || u._id]?.total || 0;
              const salary = Number(payData[u.id || u._id]?.salary) || 25000;
              const bonus = Number(payData[u.id || u._id]?.bonus) || 0;
              
              // Розрахунок понаднормових годин - перепрацювання за день (більше 8 годин)
              let overtime = 0;
              let weekendHours = 0;
              let workDaysTotal = 0; // Години тільки робочих днів (без вихідних)
              
              const reportDays = Array.from({length: getDaysInMonth(reportYearForData, reportMonthForData)}, (_, i) => i + 1);
              reportDays.forEach(d => {
                const dayHours = parseFloat(data[u.id || u._id]?.[d]) || 0;
                const date = new Date(reportYearForData, reportMonthForData - 1, d);
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                
                // Години робочих днів (без вихідних)
                if (!isWeekend) {
                  workDaysTotal += dayHours;
                }
                
                // Понаднормові години - більше 8 годин за день (тільки робочі дні)
                if (!isWeekend && dayHours > 8) {
                  overtime += (dayHours - 8);
                }
                
                if (isWeekend && dayHours > 0) {
                  weekendHours += dayHours;
                }
              });
              
              const overtimeRate = summary.workHours > 0 ? (salary / summary.workHours) * 2 : 0;
              const overtimePay = overtime * overtimeRate;
              const weekendOvertimePay = weekendHours * overtimeRate;
              // Нормативні години робочих днів (без понаднормових) - щоб уникнути подвійної оплати
              const normalHours = workDaysTotal - overtime;
              const basePay = Math.round(salary * Math.min(normalHours, summary.workHours) / summary.workHours);
              const tasksForMonth = allTasks.filter(t => {
                if (
                  t.status !== 'Виконано' ||
                  !t.date ||
                  !t.bonusApprovalDate ||
                  !isApproved(t.approvedByWarehouse) ||
                  !isApproved(t.approvedByAccountant)
                ) return false;
                // Фільтрація по регіону - показуємо тільки завдання цього конкретного регіону
                if (t.serviceRegion !== region) return false;
                // автоконвертація bonusApprovalDate
                let bonusApprovalDate = t.bonusApprovalDate;
                if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
                  const [year, month] = bonusApprovalDate.split('-');
                  bonusApprovalDate = `${month}-${year}`;
                }
                const workDate = new Date(t.date);
                const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
                const approvalMonth = parseInt(approvalMonthStr);
                const approvalYear = parseInt(approvalYearStr);
                const workMonth = workDate.getMonth() + 1;
                const workYear = workDate.getFullYear();
                let bonusMonth, bonusYear;
                if (workMonth === approvalMonth && workYear === approvalYear) {
                  bonusMonth = workMonth;
                  bonusYear = workYear;
                } else {
                  if (approvalMonth === 1) {
                    bonusMonth = 12;
                    bonusYear = approvalYear - 1;
                  } else {
                    bonusMonth = approvalMonth - 1;
                    bonusYear = approvalYear;
                  }
                }
                return bonusMonth === reportMonthForData && bonusYear === reportYearForData;
              });
              let engineerBonus = 0;
              tasksForMonth.forEach(t => {
                const workPrice = parseFloat(t.workPrice) || 0;
                const bonusVal = workPrice * 0.25;
                // Враховуємо всіх 6 інженерів
                const engineers = [
                  (t.engineer1 || '').trim(),
                  (t.engineer2 || '').trim(),
                  (t.engineer3 || '').trim(),
                  (t.engineer4 || '').trim(),
                  (t.engineer5 || '').trim(),
                  (t.engineer6 || '').trim()
                ].filter(eng => eng && eng.length > 0);
                
                if (engineers.includes(u.name) && engineers.length > 0) {
                  engineerBonus += bonusVal / engineers.length;
                }
              });
              // Якщо є премія за сервісні роботи, встановлюємо мінімальні години для відображення
              const displayTotal = engineerBonus > 0 && workDaysTotal === 0 ? 1 : workDaysTotal;
              // Перераховуємо basePay з урахуванням мінімальних годин для користувачів з премією
              // Використовуємо нормативні години (без понаднормових) для уникнення подвійної оплати
              // normalHours вже визначено вище
              const effectiveNormalHours = engineerBonus > 0 && normalHours === 0 ? 1 : normalHours;
              const adjustedBasePay = Math.round(salary * Math.min(effectiveNormalHours, summary.workHours) / summary.workHours);
              const payout = adjustedBasePay + overtimePay + bonus + engineerBonus + weekendOvertimePay;
              return `
                <tr>
                  <td>${u.name}</td>
                  <td><input type="number" value="${salary}" onchange="console.log('Input changed for user:', '${u.id || u._id}', 'value:', this.value); window.handlePayChange('${u.id || u._id}', 'salary', this.value)" style="width:90px; border: 1px solid #ccc; padding: 4px;" /></td>
                  <td>${normalHours}</td>
                  <td>${overtime}</td>
                  <td>${overtimeRate.toFixed(2)}</td>
                  <td>${overtimePay.toFixed(2)}</td>
                  <td>${adjustedBasePay}</td>
                  <td>${engineerBonus.toFixed(2)}</td>
                  <td>${weekendHours}</td>
                  <td>${weekendOvertimePay.toFixed(2)}</td>
                  <td>${payout.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
      // Формування таблиці табеля для регіону
      const timesheetTable = `
        <h4>Табель часу - Регіон: ${region}</h4>
        <table>
          <thead>
            <tr>
              <th>ПІБ</th>
              ${days.map(d => {
                const date = new Date(year, month - 1, d);
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                return `<th${isWeekend ? ' class="weekend"' : ''}>${d}</th>`;
              }).join('')}
              <th>Всього годин</th>
            </tr>
          </thead>
          <tbody>
            ${usersWithPayment.map(u => `
              <tr>
                <td>${u.name}</td>
                ${days.map(d => {
                  const date = new Date(year, month - 1, d);
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  return `<td${isWeekend ? ' class=\"weekend\"' : ''}>${data[u.id || u._id]?.[d] || 0}</td>`;
                }).join('')}
                <td>${data[u.id || u._id]?.total || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      // Формування таблиці виконаних робіт для регіону
      const regionTasks = allTasks.filter(t => {
        if (
          t.status !== 'Виконано' ||
          !t.date ||
          !t.bonusApprovalDate ||
          !isApproved(t.approvedByWarehouse) ||
          !isApproved(t.approvedByAccountant)
        ) return false;
        // Фільтрація по регіону - показуємо тільки завдання цього конкретного регіону
        if (t.serviceRegion !== region) return false;
        
        // Перевіряємо чи інженер є серед користувачів з ненульовою оплатою
        const engineer1 = (t.engineer1 || '').trim();
        const engineer2 = (t.engineer2 || '').trim();
        const hasEngineer1 = usersWithPayment.some(u => (u.name || '').trim() === engineer1);
        const hasEngineer2 = usersWithPayment.some(u => (u.name || '').trim() === engineer2);
        
        if (!hasEngineer1 && !hasEngineer2) return false;
        // автоконвертація bonusApprovalDate
        let bonusApprovalDate = t.bonusApprovalDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
          const [year, month] = bonusApprovalDate.split('-');
          bonusApprovalDate = `${month}-${year}`;
        }
        const workDate = new Date(t.date);
        const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
        const approvalMonth = parseInt(approvalMonthStr);
        const approvalYear = parseInt(approvalYearStr);
        const workMonth = workDate.getMonth() + 1;
        const workYear = workDate.getFullYear();
        let bonusMonth, bonusYear;
        if (workMonth === approvalMonth && workYear === approvalYear) {
          bonusMonth = workMonth;
          bonusYear = workYear;
        } else {
          if (approvalMonth === 1) {
            bonusMonth = 12;
            bonusYear = approvalYear - 1;
          } else {
            bonusMonth = approvalMonth - 1;
            bonusYear = approvalYear;
          }
        }
        return bonusMonth === month && bonusYear === year;
      });
      // Розраховуємо загальні суми
      let totalServiceSum = 0;
      let totalWorkPrice = 0;
      let totalBonus = 0;
      
      regionTasks.forEach(t => {
        const serviceTotal = parseFloat(t.serviceTotal) || 0;
        const workPrice = parseFloat(t.workPrice) || 0;
        const bonus = workPrice * 0.25;
        
        totalServiceSum += serviceTotal;
        totalWorkPrice += workPrice;
        totalBonus += bonus;
      });

      const workDetailsTable = `
        <h4>Деталізація виконаних робіт - Регіон: ${region}</h4>
        <table class="details">
          <thead>
            <tr>
              <th>Номер заявки</th>
              <th>Дата</th>
              <th>Інженер</th>
              <th>Клієнт</th>
              <th>Адреса</th>
              <th>Обладнання</th>
              <th><b>Найменування робіт</b></th>
              <th>Компанія виконавець</th>
              <th>Загальна сума з матеріалами</th>
              <th>Вартість робіт</th>
              <th>Загальна премія за послугу (Без розподілення)</th>
            </tr>
          </thead>
          <tbody>
            ${regionTasks.map(t => {
              const bonus = (parseFloat(t.workPrice) || 0) * 0.25;
              const workPrice = parseFloat(t.workPrice) || 0;
              return `
                <tr>
                  <td>${t.requestNumber || ''}</td>
                  <td>${t.date || ''}</td>
                  <td>${[
                    t.engineer1 || '',
                    t.engineer2 || '',
                    t.engineer3 || '',
                    t.engineer4 || '',
                    t.engineer5 || '',
                    t.engineer6 || ''
                  ].filter(eng => eng && eng.trim().length > 0).join(', ')}</td>
                  <td>${t.client || ''}</td>
                  <td>${t.address || ''}</td>
                  <td>${t.equipment || ''}</td>
                  <td>${t.work || ''}</td>
                  <td>${t.company || ''}</td>
                  <td>${t.serviceTotal || ''}</td>
                  <td>${workPrice.toFixed(2)}</td>
                  <td>${bonus ? bonus.toFixed(2) : '0.00'}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #e9ecef; font-weight: bold;">
              <td colspan="8" style="text-align: right; padding: 8px;">ЗАГАЛЬНА СУМА:</td>
              <td style="text-align: center; padding: 8px;">${totalServiceSum.toFixed(2)}</td>
              <td style="text-align: center; padding: 8px;">${totalWorkPrice.toFixed(2)}</td>
              <td style="text-align: center; padding: 8px;">${totalBonus.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      `;
      return {
        timesheetTable,
        accrualTable,
        workDetailsTable
      };
    };
    // Генеруємо HTML для кожного регіону
    const regionsContent = showRegions.map(region => {
      const regionReport = generateRegionReport(region);
      return `
        <div style="margin-bottom: 40px; page-break-after: always;">
          <h3 style="color: #1976d2; border-bottom: 2px solid #1976d2; padding-bottom: 10px;">Регіон: ${region}</h3>
          ${regionReport.timesheetTable}
          ${regionReport.accrualTable}
          ${regionReport.workDetailsTable}
        </div>
      `;
    }).join('');
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle}</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; color: #222; padding: 24px; }
          h2 { color: #1976d2; }
          h3 { color: #1976d2; margin-top: 30px; }
          h4 { color: #1976d2; margin-top: 20px; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
          th, td { border: 1px solid #000; padding: 6px 10px; text-align: center; }
          th { background: #ffe600; color: #222; }
          .details th { background: #e0e0e0; }
          .weekend { background: #e0e0e0 !important; color: #222 !important; }
          @media print {
            .page-break { page-break-after: always; }
          }
        </style>
      </head>
      <body>
        <h2>${reportTitle}</h2>
        ${regionsContent}
        <script>
          // Функція для оновлення зарплати
          window.handlePayChange = async function(userId, field, value, inputElement) {
            console.log('handlePayChange called:', { userId, field, value });
            
            // Зберігаємо на сервер
            try {
              const apiBaseUrl = window.location.hostname === 'localhost' 
                ? 'http://localhost:3001/api'
                : 'https://darex-trading-solutions.onrender.com/api';
              // Визначаємо регіон користувача, для якого змінюється зарплата
              const userRegion = '${user?.region || 'Без регіону'}';
              const response = await fetch(\`\${apiBaseUrl}/timesheet\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  region: userRegion,
                  year: ${year},
                  month: ${month},
                  type: 'regular',
                  payData: { [userId]: { [field]: value } },
                  createdBy: '${user?.name || user?.login || 'unknown'} (${user?.id || user?._id})'
                })
              });
              if (response.ok) {
                console.log('Updated payData on server');
              }
            } catch (error) {
              console.error('Error saving payData to server:', error);
            }
            
            // Оновлюємо розрахунки в реальному часі
            const salary = parseFloat(value) || 0;
            const workHours = 176;
            const overtimeRate = workHours > 0 ? (salary / workHours) * 2 : 0;
            
            // Знаходимо рядок з цим input
            const input = inputElement || (window.event && window.event.target);
            if (!input) {
              console.error('No input element found');
              return;
            }
            
            const row = input.closest('tr');
            const cells = row.querySelectorAll('td');
            
            console.log('Found row with cells:', cells.length);
            
            // Оновлюємо ціну за годину понаднормові (колонка 5)
            if (cells[4]) {
              cells[4].textContent = overtimeRate.toFixed(2);
              console.log('Updated overtime rate:', overtimeRate.toFixed(2));
            }
            
            // Оновлюємо відпрацьовану ставку (колонка 7)
            const actualHours = parseInt(cells[2].textContent) || 0;
            const workedRate = Math.round(salary * Math.min(actualHours, workHours) / workHours);
            if (cells[6]) {
              cells[6].textContent = workedRate;
              console.log('Updated worked rate:', workedRate);
            }
            
            // Оновлюємо загальну суму (ставка + премія) (колонка 8)
            const serviceBonus = parseFloat(cells[7].textContent) || 0;
            const totalPay = workedRate + serviceBonus;
            if (cells[8]) {
              cells[8].textContent = totalPay.toFixed(2);
              console.log('Updated total pay:', totalPay.toFixed(2));
            }
            
            console.log('Salary update completed');
          };
          
          // Додаємо обробник подій для всіх input полів
          document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM loaded, setting up event listeners');
            const inputs = document.querySelectorAll('input[type="number"]');
            console.log('Found input fields:', inputs.length);
            
            inputs.forEach(input => {
              input.addEventListener('change', function() {
                console.log('Input changed:', this.value);
                // Викликаємо handlePayChange з правильними параметрами
                const onchangeAttr = this.getAttribute('onchange');
                if (onchangeAttr) {
                  // Парсимо параметри з onchange атрибута
                  const match = onchangeAttr.match(/window\.handlePayChange\('([^']+)',\s*'([^']+)',\s*this\.value\)/);
                  if (match) {
                    const userId = match[1];
                    const field = match[2];
                    window.handlePayChange(userId, field, this.value, this);
                  }
                }
              });
            });
          });
        </script>
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };
  // Діагностика
  const regionAppDebug = user?.region || '';
  // Видалено посилання на filtered, оскільки воно не доступне в цій області видимості
  // Додаємо функцію експорту в Excel
  const exportFilteredToExcel = () => {
    // Для звіту по персоналу використовуємо всі заявки, для інших вкладок - тільки потрібні
    const tasksForExport = tab === 'report' ? allTasks : tasks;
    // Логуємо всі завдання зі статусом 'Виконано'
    const completedTasks = tasksForExport.filter(t => t.status === 'Виконано');
    // Фільтруємо виконані заявки за діапазоном дат, регіоном та статусом затвердження
    const filteredTasks = tasksForExport.filter(t => {
      if (t.status !== 'Виконано') {
        return false;
      }
      if (exportFilters.dateFrom && (!t.date || t.date < exportFilters.dateFrom)) {
        return false;
      }
      if (exportFilters.dateTo && (!t.date || t.date > exportFilters.dateTo)) {
        return false;
      }
      // Фільтр по регіону користувача
      if (user?.region && user.region !== 'Україна' && t.serviceRegion !== user.region) {
        return false;
      }
      if (exportFilters.region && exportFilters.region !== 'Україна' && t.serviceRegion !== exportFilters.region) {
        return false;
      }
      // Фільтр по статусу затвердження
      if (exportFilters.approvalFilter === 'approved') {
        // Для затверджених - всі повинні бути затверджені
        if (!isApproved(t.approvedByWarehouse) || !isApproved(t.approvedByAccountant)) {
          return false;
        }
      } else if (exportFilters.approvalFilter === 'not_approved') {
        // Для незатверджених - хоча б один не затвердив
        if (isApproved(t.approvedByWarehouse) && isApproved(t.approvedByAccountant)) {
          return false;
        }
      }
      // Якщо approvalFilter === 'all', то показуємо всі
      return true;
    });
    // Додаткова перевірка - логуємо всі завдання зі статусом 'Виконано' та їх статус затвердження
    const completedTasksWithApproval = allTasks.filter(t => t.status === 'Виконано').map(t => ({
      id: t.id,
      approvedByWarehouse: t.approvedByWarehouse,
      approvedByAccountant: t.approvedByAccountant,
      approvedByRegionalManager: t.approvedByRegionalManager,
      isWarehouseApproved: isApproved(t.approvedByWarehouse),
      isAccountantApproved: isApproved(t.approvedByAccountant),
      isRegionalManagerApproved: isApproved(t.approvedByRegionalManager),
      isAllApproved: isApproved(t.approvedByWarehouse) && isApproved(t.approvedByAccountant)
    }));
    // Маппінг колонок згідно з вимогами
    const columnMapping = [
      { excelHeader: 'Відповідальний', field: 'engineer1', additionalField: 'engineer2' },
      { excelHeader: 'ДТС/ДАРЕКС', field: 'company' },
      { excelHeader: 'Найменування робіт', field: 'work' },
      { excelHeader: 'Гарантія/не гарантія/волонтерство', field: 'work' },
      { excelHeader: '№ Заявки', field: 'requestNumber' },
      { excelHeader: 'дата', field: 'date' },
      { excelHeader: 'Замовник/повна назва', field: 'client' },
      { excelHeader: 'Адреса/повна', field: 'address' },
      { excelHeader: 'Опис заявки', field: 'requestDesc' },
      { excelHeader: 'Заводський номер обладнання', field: 'equipmentSerial' },
      { excelHeader: 'Тип обладнання/повна назва', field: 'equipment' },
      { excelHeader: 'Назва оливи', field: 'oilType' },
      { excelHeader: 'Використано оливи, л', field: 'oilUsed' },
      { excelHeader: 'Ціна оливи, грн.', field: 'oilPrice' },
      { excelHeader: 'Повернуто відпрацьовану оливу, л', field: '' },
      { excelHeader: 'Фільтр масл, назва', field: 'filterName' },
      { excelHeader: 'Фільтр масл, штук', field: 'filterCount' },
      { excelHeader: 'Ціна ФМ, гривень', field: 'filterPrice' },
      { excelHeader: 'Фільтр палив, назва', field: 'fuelFilterName' },
      { excelHeader: 'Фільтр палив, штук', field: 'fuelFilterCount' },
      { excelHeader: 'Ціна ФП, гривень', field: 'fuelFilterPrice' },
      { excelHeader: 'Фільтр повітряний, назва', field: 'airFilterName' },
      { excelHeader: 'Фільтр повітряний, штук', field: 'airFilterCount' },
      { excelHeader: 'Ціна повіт фільтра, гривень', field: 'airFilterPrice' },
      { excelHeader: 'Антифріз, л', field: 'antifreezeL' },
      { excelHeader: 'Ціна антифрізу, грн.', field: 'antifreezePrice' },
      { excelHeader: 'Інші матеріали, назва/шт.', field: 'otherMaterials' },
      { excelHeader: 'Ціна інш матеріалів,грн.', field: 'otherSum' },
      { excelHeader: 'Вартість робіт, грн.', field: 'workPrice' },
      { excelHeader: 'Добові, грн', field: 'perDiem' },
      { excelHeader: 'Проживання, грн', field: 'living' },
      { excelHeader: 'Інші витрати, грн', field: 'otherExp' },
      { excelHeader: 'Держномер автотранспорту (АЕ0000АЕ)', field: 'carNumber' },
      { excelHeader: 'Транспортні витрати, км', field: 'transportKm' },
      { excelHeader: 'Вартість тр. витрат, грн.', field: 'transportSum' },
      { excelHeader: 'Загальна ціна, грн', field: 'serviceTotal' },
      { excelHeader: 'Вид оплати, нал./безнал/Дата оплати', field: 'paymentType' },
      { excelHeader: 'Альбіна', field: '' }
    ];
    // Формуємо заголовки
    const headers = columnMapping.map(col => col.excelHeader);
    // Формуємо дані для рядків
    const data = filteredTasks.map(task => {
      return columnMapping.map(col => {
        if (col.field === 'engineer1') {
          // Об'єднуємо всіх інженерів
          const engineers = [
            task.engineer1 || '',
            task.engineer2 || '',
            task.engineer3 || '',
            task.engineer4 || '',
            task.engineer5 || '',
            task.engineer6 || ''
          ].filter(eng => eng && eng.trim().length > 0);
          return engineers.join(', ');
        } else if (col.field === '') {
          return ''; // Порожні поля
        } else {
          const value = task[col.field];
          return value || '';
        }
      });
    });
    if (data.length > 0) {
    }
    // Створюємо робочий аркуш
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Заявки');
    // Налаштовуємо фільтри для всіх колонок
    worksheet['!autofilter'] = { ref: `A1:${String.fromCharCode(65 + headers.length - 1)}${data.length + 1}` };
    // Налаштовуємо стилі для заголовків (жовтий фон)
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].s = {
          fill: { fgColor: { rgb: "FFFF00" } }, // Жовтий фон
          font: { bold: true, color: { rgb: "000000" } }, // Жирний чорний текст
          alignment: { 
            horizontal: "center", 
            vertical: "center",
            wrapText: true // Перенос тексту
          },
          border: {
            top: { style: 'thin', color: { rgb: "000000" } },
            bottom: { style: 'thin', color: { rgb: "000000" } },
            left: { style: 'thin', color: { rgb: "000000" } },
            right: { style: 'thin', color: { rgb: "000000" } }
          }
        };
      }
    }
    // Налаштовуємо стилі для всіх клітинок у діапазоні (включаючи порожні)
    for (let row = 0; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        // Якщо клітинка не існує, створюємо її з базовими стилями
        if (!worksheet[cellAddress]) {
          worksheet[cellAddress] = { v: '', s: {} };
        }
        // Базові стилі для всіх клітинок
        const baseStyle = {
          border: {
            top: { style: 'thin', color: { rgb: "000000" } },
            bottom: { style: 'thin', color: { rgb: "000000" } },
            left: { style: 'thin', color: { rgb: "000000" } },
            right: { style: 'thin', color: { rgb: "000000" } }
          }
        };
        // Додаткові стилі для заголовків
        if (row === 0) {
          baseStyle.fill = { fgColor: { rgb: "FFFF00" } }; // Жовтий фон
          baseStyle.font = { bold: true, color: { rgb: "000000" } }; // Жирний чорний текст
          baseStyle.alignment = { 
            horizontal: "center", 
            vertical: "center",
            wrapText: true
          };
        } else {
          // Стилі для рядків даних
          baseStyle.alignment = { 
            wrapText: true, 
            vertical: "center",
            horizontal: "left"
          };
          // Зелений фон для затверджених зав. складом
          const taskIndex = row - 1;
          if (taskIndex < filteredTasks.length) {
            const task = filteredTasks[taskIndex];
            const isWarehouseApproved = isApproved(task.approvedByWarehouse);
            if (isWarehouseApproved) {
              baseStyle.fill = { fgColor: { rgb: "90EE90" } }; // Світло-зелений фон
              baseStyle.font = { color: { rgb: "000000" } }; // Чорний текст
            }
          }
        }
        // Застосовуємо стилі
        worksheet[cellAddress].s = {
          ...worksheet[cellAddress].s,
          ...baseStyle
        };
      }
    }
    // Налаштовуємо ширину колонок
    const colWidths = [
      20, // Відповідальний
      15, // ДТС/ДАРЕКС
      25, // Найменування робіт
      30, // Гарантія/не гарантія/волонтерство
      12, // № Заявки
      12, // дата
      25, // Замовник/повна назва
      25, // Адреса/повна
      30, // Опис заявки
      20, // Заводський номер обладнання
      25, // Тип обладнання/повна назва
      15, // Назва оливи
      15, // Використано оливи, л
      15, // Ціна оливи, грн.
      25, // Повернуто відпрацьовану оливу, л
      20, // Фільтр масл, назва
      15, // Фільтр масл, штук
      20, // Ціна ФМ, гривень
      20, // Фільтр палив, назва
      15, // Фільтр палив, штук
      20, // Ціна ФП, гривень
      20, // Фільтр повітряний, назва
      20, // Фільтр повітряний, штук
      25, // Ціна повіт фільтра, гривень
      15, // Антифріз, л
      20, // Ціна антифрізу, грн.
      25, // Інші матеріали, назва/шт.
      25, // Ціна інш матеріалів,грн.
      20, // Вартість робіт, грн.
      15, // Добові, грн
      15, // Проживання, грн
      20, // Інші витрати, грн
      30, // Держномер автотранспорту (АЕ0000АЕ)
      20, // Транспортні витрати, км
      25, // Вартість тр. витрат, грн.
      20, // Загальна ціна, грн
      30, // Вид оплати, нал./безнал/Дата оплати
      10  // Альбіна
    ];
    worksheet['!cols'] = colWidths.map(width => ({ width }));
    // Створюємо назву файлу з урахуванням фільтрів
    let fileName = 'Звіт_по_заявках_регіонального_керівника';
    if (exportFilters.dateFrom || exportFilters.dateTo) {
      fileName += `_${exportFilters.dateFrom || 'з_початку'}_${exportFilters.dateTo || 'до_кінця'}`;
    }
    if (exportFilters.region) {
      fileName += `_${exportFilters.region}`;
    }
    if (exportFilters.approvalFilter !== 'all') {
      fileName += `_${exportFilters.approvalFilter === 'approved' ? 'затверджені' : 'незатверджені'}`;
    }
    fileName += '.xlsx';
    // Запускаємо завантаження файлу
    XLSX.writeFile(workbook, fileName);
  };
  // Додаємо функцію для обробки зміни фільтрів експорту
  const handleExportFilterChange = (field, value) => {
    setExportFilters(prev => ({ ...prev, [field]: value }));
  };
  // Логіка групування по регіонам для вкладки "Звіт по персоналу"
  const allRegions = Array.from(new Set(filteredUsers.map(u => u.region || 'Без регіону')));
  const showRegions = user?.region === 'Україна' ? allRegions : 
    user?.region && user.region.includes(',') ? 
      user.region.split(',').map(r => r.trim()) : 
      [user?.region || 'Без регіону'];
  // Фільтрація завдань для регіонального керівника
  // Для звіту по персоналу використовуємо всі заявки, для інших вкладок - тільки потрібні
  // Для вкладки debt використовуємо всі завдання (як у бухгалтера)
  const tasksForFiltering = (tab === 'report' || activeTab === 'debt') ? allTasks : tasks;
  const filtered = tasksForFiltering.filter(t => {
    // Перевірка доступу до регіону заявки
    if (user?.region && user.region !== 'Україна') {
      // Якщо користувач має множинні регіони (через кому)
      if (user.region.includes(',')) {
        const userRegions = user.region.split(',').map(r => r.trim());
        
        // Якщо вибрано "Всі" або "Загальний" або нічого не вибрано, показуємо всі регіони користувача
        if (filters.serviceRegion === 'Всі' || filters.serviceRegion === 'Загальний' || !filters.serviceRegion || filters.serviceRegion === '') {
          if (!userRegions.includes(t.serviceRegion)) {
            return false;
          }
        } else {
          // Якщо вибрано конкретний регіон
          if (t.serviceRegion !== filters.serviceRegion) {
            return false;
          }
        }
      } else {
        // Якщо користувач має один регіон
        if (t.serviceRegion !== user.region) return false;
      }
    }
    
    // Обробка фільтра serviceRegion для користувачів з регіоном "Україна"
    if (user?.region === 'Україна' && filters.serviceRegion && filters.serviceRegion !== 'Всі' && filters.serviceRegion !== 'Загальний') {
      if (t.serviceRegion !== filters.serviceRegion) {
        return false;
      }
    }
    
    for (const key in filters) {
      const value = filters[key];
      if (!value) continue;
      if (key.endsWith('From')) {
        const field = key.replace('From', '');
        if (!t[field]) return false;
        const taskDate = new Date(t[field]);
        const filterDate = new Date(value);
        if (isNaN(taskDate.getTime()) || isNaN(filterDate.getTime())) return false;
        if (taskDate < filterDate) return false;
      } else if (key.endsWith('To')) {
        const field = key.replace('To', '');
        if (!t[field]) return false;
        const taskDate = new Date(t[field]);
        const filterDate = new Date(value);
        if (isNaN(taskDate.getTime()) || isNaN(filterDate.getTime())) return false;
        if (taskDate > filterDate) return false;
      } else if (key === 'date' || key === 'requestDate') {
        if (!t[key] || !t[key].includes(value)) return false;
      } else if (typeof t[key] === 'string') {
        if (!t[key].toLowerCase().includes(value.toLowerCase())) return false;
      } else if (t[key] !== value) {
        return false;
      }
    }
    return true;
  });
  return (
    <>
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        <RegionalManagerTabs tab={tab} setTab={setTab} />
      </div>
    <div style={{padding:32}}>
      {tab === 'tasks' && (
        <>
            <h2>Завдання для регіонального керівника</h2>
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              <button onClick={()=>setActiveTab('pending')} style={{width:220,padding:'10px 0',background:activeTab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='pending'?700:400,cursor:'pointer'}}>Заявки відхилені ({getTabCount('pending')})</button>
              <button onClick={()=>setActiveTab('archive')} style={{width:220,padding:'10px 0',background:activeTab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок ({getTabCount('archive')})</button>
              <button onClick={()=>setActiveTab('debt')} style={{width:220,padding:'10px 0',background:activeTab==='debt'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='debt'?700:400,cursor:'pointer'}}>Заборгованість по документам ({getTabCount('debt')})</button>
              <button onClick={exportFilteredToExcel} style={{background:'#43a047',color:'#fff',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:600,cursor:'pointer'}}>Експорт у Excel</button>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              <label style={{display:'flex',alignItems:'center',gap:4}}>
                Дата виконаних робіт з:
                <input type="date" name="dateFrom" value={exportFilters.dateFrom} onChange={(e) => handleExportFilterChange('dateFrom', e.target.value)} />
                по
                <input type="date" name="dateTo" value={exportFilters.dateTo} onChange={(e) => handleExportFilterChange('dateTo', e.target.value)} />
              </label>
              <label style={{display:'flex',alignItems:'center',gap:4}}>
                Регіон:
                <input type="text" name="region" value={exportFilters.region || ''} onChange={(e) => handleExportFilterChange('region', e.target.value)} placeholder="Україна або регіон" />
              </label>
              <label style={{display:'flex',alignItems:'center',gap:4}}>
                Статус затвердження:
                <select 
                  value={exportFilters.approvalFilter} 
                  onChange={(e) => handleExportFilterChange('approvalFilter', e.target.value)}
                  style={{padding:'4px 8px',borderRadius:'4px',border:'1px solid #ccc'}}
                >
                  <option value="all">Всі звіти</option>
                  <option value="approved">Тільки затверджені</option>
                  <option value="not_approved">Тільки незатверджені</option>
                </select>
              </label>
            </div>
            <ModalTaskForm 
              open={modalOpen} 
              onClose={()=>{setModalOpen(false);setEditTask(null);}} 
              onSave={handleSave} 
              initialData={editTask || {}} 
              mode="regional" 
              user={user}
              readOnly={editTask?._readOnly || false}
            />
            {activeTab === 'debt' ? (
              <TaskTable
                tasks={filtered.filter(task => {
                  // Використовуємо ТОЧНО ТАКУ Ж логіку як у бухгалтера:
                  // Показуємо завдання, які потребують встановлення статусу заборгованості:
                  // 1. Не мають встановленого debtStatus (undefined або порожнє)
                  // 2. Мають paymentType (не порожнє)
                  // 3. paymentType не є 'Готівка'
                  const hasPaymentType = task.paymentType && task.paymentType.trim() !== '';
                  const isNotCash = !['Готівка'].includes(task.paymentType);
                  const needsDebtStatus = !task.debtStatus || task.debtStatus === undefined || task.debtStatus === '';
                  
                  const shouldShow = needsDebtStatus && hasPaymentType && isNotCash;
                  
                  if (shouldShow) {
                    // Додаємо прапор для вкладки "debt"
                    task._debtTab = true;
                  }
                  
                  return shouldShow;
                })}
                allTasks={allTasks}
                onApprove={handleApprove}
                onEdit={handleEdit}
                role="regional"
                filters={filters}
                onFilterChange={handleFilter}
                columns={columnsWithApprove}
                allColumns={columnsWithApprove}
                approveField="approvedByRegionalManager"
                commentField="regionalManagerComment"
                user={user}
                isArchive={false}
                accessRules={accessRules}
                currentArea={currentArea}
              />
            ) : (
              <TaskTable
                tasks={activeTab === 'pending' ? filtered.filter(t => {
                  const isWarehouseRejected = isRejected(t.approvedByWarehouse);
                  const isAccountantRejected = isRejected(t.approvedByAccountant);
                  return t.status === 'Виконано' && (isWarehouseRejected || isAccountantRejected);
                }) : activeTab === 'archive' ? filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByWarehouse) && isApproved(t.approvedByAccountant)) : activeTab === 'debt' ? filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByWarehouse) && isApproved(t.approvedByAccountant)) : filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByRegionalManager))}
                allTasks={tasks}
                onApprove={activeTab === 'pending' ? undefined : handleApprove}
                onEdit={handleEdit}
                role="regional"
                filters={filters}
                onFilterChange={handleFilter}
                columns={columnsWithApprove}
                allColumns={columnsWithApprove}
                approveField="approvedByRegionalManager"
                commentField="regionalManagerComment"
                user={user}
                isArchive={activeTab === 'archive'}
                accessRules={accessRules}
                currentArea={currentArea}
              />
            )}
        </>
      )}
      {tab === 'report' && (
        <>
          <h3>Табель персоналу</h3>
          {allTasksLoading && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              padding: '20px',
              fontSize: '16px',
              color: '#666'
            }}>
              Завантаження даних з архіву в кеш для звіту...
            </div>
          )}
          <div style={{display:'flex',gap:16,alignItems:'center',marginBottom:16}}>
              <label style={{color:'#fff'}}>Місяць:
              <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{marginLeft:8}}>
                {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </label>
              <label style={{color:'#fff'}}>Рік:
              <select value={year} onChange={e => setYear(Number(e.target.value))} style={{marginLeft:8}}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
                        </div>
          <button
            onClick={handleFormTimeReport}
            style={{background:'#1976d2',color:'#fff',border:'none',borderRadius:6,padding:'10px 32px',fontWeight:600,cursor:'pointer',marginBottom:16}}
          >
            Сформувати звіт
          </button>
          {showTimeReport && timeReportContent}
          {showRegions.map(region => (
            <div key={region} style={{marginBottom:40}}>
              <h4 style={{color:'#ffe600',margin:'16px 0 8px 0',fontWeight:700,fontSize:20}}>Регіон: {region}</h4>
              <div style={{overflowX: 'auto', width: '100%', maxWidth: '100vw', boxSizing: 'border-box'}}>
                <div style={{background: 'rgba(34,51,74,0.85)', borderRadius: 8, padding: '24px 16px', marginBottom: 24, maxWidth: '100%', boxSizing: 'border-box'}}>
                  <div className="horizontal-scroll">
                    <table className="timesheet-table">
                      <thead>
                        <tr>
                          <th style={{width:40, background:'#ffe600', color:'#222'}}>№</th>
                          <th style={{width:160, minWidth:120, maxWidth:220, background:'#ffe600', color:'#222'}}>ПІБ</th>
                          {days.map(d => {
                            const date = new Date(year, month - 1, d);
                            const dayOfWeek = date.getDay();
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                            return (
                              <th key={d} style={{width:28, minWidth:24, background: isWeekend ? '#ff4d4d' : '#ffe600', color: isWeekend ? '#fff' : '#222'}}>{d}</th>
                            );
                          })}
                          <th style={{width:80, minWidth:60, background:'#b6ffb6', color:'#222'}}>Всього годин</th>
                        </tr>
                      </thead>
                      <tbody>
                          {filteredUsers.filter(u => (u.region || 'Без регіону') === region).map((u, idx) => (
                          <tr key={u.id || u._id}>
                            <td style={{background:'#ffe600', color:'#222', fontWeight:600}}>{idx+1}</td>
                            <td style={{width:160, minWidth:120, maxWidth:220}}>{u.name}</td>
                            {days.map(d => {
                              const date = new Date(year, month - 1, d);
                              const dayOfWeek = date.getDay();
                              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                              return (
                                <td key={d} style={{width:28, minWidth:24, background: isWeekend ? '#ff4d4d' : undefined}}>
                                  <input 
                                    type="number" 
                                    value={data[u.id || u._id]?.[d] || ''} 
                                    onChange={e => {
                                      const userId = u.id || u._id;
                                      console.log(`[DEBUG] Input change: userId=${userId}, day=${d}, value=${e.target.value}`);
                                      handleChange(userId, d, e.target.value);
                                    }} 
                                    style={{width:'100%'}} 
                                  />
                                </td>
                              );
                            })}
                            <td style={{width:80, minWidth:60, background:'#b6ffb6', color:'#222', fontWeight:600}}>{data[u.id || u._id]?.total || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{display:'flex',gap:24,alignItems:'center',margin:'24px 0 8px 0'}}>
                    <div style={{background:'#ffe600',color:'#222',borderRadius:6,padding:'8px 20px',fontWeight:600}}>
                      Кількість робочих днів у місяці: {summary.workDays}
                    </div>
                    <div style={{background:'#b6ffb6',color:'#222',borderRadius:6,padding:'8px 20px',fontWeight:600}}>
                      Норма робочих годин у місяці: {summary.workHours}
                    </div>
                  </div>
                  <div style={{marginTop:32}}>
                    <table style={{width:'100%', color:'#222', background:'#fff', borderRadius:8, overflow:'hidden', fontSize:'1rem'}}>
                      <thead>
                        <tr style={{background:'#ffe600', color:'#222', fontWeight:700}}>
                          <th>ПІБ</th>
                          <th>Ставка</th>
                          <th>Відпрацьована ставка, год</th>
                          <th>Понаднормові роботи, год</th>
                          <th>Ціна за год, понаднормові</th>
                          <th>Доплата за понаднормові</th>
                          <th>Відпрацьована ставка, грн</th>
                          <th>Премія за виконання сервісних робіт, грн</th>
                          <th>Відпрацьовано годин в Сб,Нд</th>
                          <th>Нарахованно за перепрацювання за Сб,Нд</th>
                          <th>Загальна сума по оплаті за місяць</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.filter(u => (u.region || 'Без регіону') === region).map(u => {
                          const total = data[u.id || u._id]?.total || 0;
                          const salary = Number(payData[u.id || u._id]?.salary) || 25000;
                          const bonus = Number(payData[u.id || u._id]?.bonus) || 0;
                          
                          // Розрахунок понаднормових годин - перепрацювання за день (більше 8 годин)
                          let overtime = 0;
                          let weekendHours = 0; // Години на вихідних (субота, неділя)
                          let workDaysTotal = 0; // Години тільки робочих днів (без вихідних)
                          
                          days.forEach(d => {
                            const dayHours = parseFloat(data[u.id || u._id]?.[d]) || 0;
                            const date = new Date(year, month - 1, d);
                            const dayOfWeek = date.getDay();
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                            
                            // Години робочих днів (без вихідних)
                            if (!isWeekend) {
                              workDaysTotal += dayHours;
                            }
                            
                            // Понаднормові години - більше 8 годин за день (тільки робочі дні)
                            if (!isWeekend && dayHours > 8) {
                              overtime += (dayHours - 8);
                            }
                            
                            // Години на вихідних
                            if (isWeekend && dayHours > 0) {
                              weekendHours += dayHours;
                            }
                          });
                          
                          const overtimeRate = summary.workHours > 0 ? (salary / summary.workHours) * 2 : 0;
                          const overtimePay = overtime * overtimeRate;
                          const weekendOvertimePay = weekendHours * overtimeRate;
                          // Нормативні години робочих днів (без понаднормових) - щоб уникнути подвійної оплати
                          const normalHours = workDaysTotal - overtime;
                          const basePay = Math.round(salary * Math.min(normalHours, summary.workHours) / summary.workHours);
                            // Використовуємо завдання з API замість localStorage
                          const isApproved = v => v === true || v === 'Підтверджено';
                          const engineerName = u.name;
                          const monthStr = String(month).padStart(2, '0');
                          const yearStr = String(year);
                          let engineerBonus = 0;
                          allTasks.forEach(t => {
                            if (
                              t.status === 'Виконано' &&
                              isApproved(t.approvedByWarehouse) &&
                              isApproved(t.approvedByAccountant)
                            ) {
                              let bonusApprovalDate = t.bonusApprovalDate;
                              // Автоконвертація з YYYY-MM-DD у MM-YYYY
                              if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
                                const [year, month] = bonusApprovalDate.split('-');
                                bonusApprovalDate = `${month}-${year}`;
                              }
                              const tDate = t.date;
                              if (tDate && bonusApprovalDate) {
                                const workDate = new Date(tDate);
                                // bonusApprovalDate має формат "MM-YYYY", наприклад "04-2025"
                                const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
                                const approvalMonth = parseInt(approvalMonthStr);
                                const approvalYear = parseInt(approvalYearStr);
                                const workMonth = workDate.getMonth() + 1;
                                const workYear = workDate.getFullYear();
                                // Визначаємо місяць для нарахування премії
                                let bonusMonth, bonusYear;
                                if (workMonth === approvalMonth && workYear === approvalYear) {
                                  bonusMonth = workMonth;
                                  bonusYear = workYear;
                                } else {
                                  if (approvalMonth === 1) {
                                    bonusMonth = 12;
                                    bonusYear = approvalYear - 1;
                                  } else {
                                    bonusMonth = approvalMonth - 1;
                                    bonusYear = approvalYear;
                                  }
                                }
                                if (bonusMonth === month && bonusYear === year) {
                                  const workPrice = parseFloat(t.workPrice) || 0;
                                  const bonus = workPrice * 0.25;
                                  // Враховуємо всіх 6 інженерів
                                  const engineers = [
                                    (t.engineer1 || '').trim(),
                                    (t.engineer2 || '').trim(),
                                    (t.engineer3 || '').trim(),
                                    (t.engineer4 || '').trim(),
                                    (t.engineer5 || '').trim(),
                                    (t.engineer6 || '').trim()
                                  ].filter(eng => eng && eng.length > 0);
                                  
                                  if (engineers.includes(engineerName) && engineers.length > 0) {
                                    engineerBonus += bonus / engineers.length;
                                  }
                                }
                              }
                            }
                          });
                          const payout = basePay + overtimePay + bonus + engineerBonus + weekendOvertimePay;
                          return (
                            <tr key={u.id || u._id}>
                              <td>{u.name}</td>
                              <td><input type="number" value={payData[u.id || u._id]?.salary || 25000} onChange={e => {const userId = u.id || u._id; console.log('🔧 RegionalManagerArea salary changed:', u.name, e.target.value); console.log('🔧 User ID:', userId); console.log('🔧 handlePayChange function:', typeof handlePayChange); console.log('🔧 payData before:', payData); console.log('🔧 setPayData function:', typeof setPayData); handlePayChange(userId, 'salary', e.target.value); console.log('🔧 handlePayChange called');}} style={{width:90}} /></td>
                              <td>{normalHours}</td>
                              <td>{overtime}</td>
                              <td>{overtimeRate.toFixed(2)}</td>
                              <td>{overtimePay.toFixed(2)}</td>
                              <td>{basePay}</td>
                              <td style={{fontWeight:600, background:'#ffe066'}}>{engineerBonus.toFixed(2)}</td>
                              <td>{weekendHours}</td>
                              <td>{weekendOvertimePay.toFixed(2)}</td>
                              <td style={{fontWeight:700, background:'#b6ffb6'}}>{payout.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
      {/* Модальне вікно для звіту */}
      {reportModalOpen && (
        <div
          style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'stretch',justifyContent:'center',overflow:'auto',padding:0}}
          onClick={handleCloseReport}
        >
          <div
            style={{background:'#fff',borderRadius:0,padding:'48px 32px 32px 32px',minWidth:'100vw',minHeight:'100vh',maxWidth:'100vw',maxHeight:'100vh',overflow:'auto',boxShadow:'none',position:'relative',margin:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start'}}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={handleCloseReport}
              aria-label="Закрити звіт"
              style={{position:'absolute',top:24,right:32,fontSize:36,background:'none',border:'none',cursor:'pointer',color:'#1976d2',zIndex:10}}
            >
              ×
            </button>
            {/* Порожній контейнер для відступу зверху */}
            <div style={{height:48}}></div>
            {/* Кнопки експорту і друку */}
            <div style={{display:'flex',gap:16,marginBottom:24,marginLeft:0,marginTop:0,justifyContent:'flex-end',width:'100%',maxWidth:1200}}>
              <button
                onClick={exportToCSV}
                style={{padding:'8px 20px',background:'#22334a',color:'#fff',border:'none',borderRadius:6,fontWeight:600,cursor:'pointer',fontSize:18,boxShadow:'0 2px 8px #0001'}}
              >
                Експорт в CSV
              </button>
              <button
                onClick={()=>window.print()}
                style={{padding:'8px 20px',background:'#00bfff',color:'#fff',border:'none',borderRadius:6,fontWeight:600,cursor:'pointer',fontSize:18,boxShadow:'0 2px 8px #0001'}}
              >
                Друк
              </button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:32,marginTop:0,width:'100%',maxWidth:1200}}>
              {reportData.map((group, groupIndex) => (
                <div
                  key={groupIndex}
                  style={{
                    background:'#fff',
                    border:'2px solid #1976d2',
                    borderRadius:12,
                    margin:'0 auto',
                    boxShadow:'0 2px 12px #0001',
                    maxWidth:1200,
                    width:'100%',
                    padding:'18px 18px 8px 18px',
                    position:'relative'
                  }}
                >
                  <div style={{fontWeight:700,fontSize:22,marginBottom:12,color:'#1976d2',letterSpacing:1}}>
                    {groupByField ? group.group : 'Звіт'}
                  </div>
                  <div style={{overflowX:'auto',width:'100%'}}>
                    <table style={{width:'100%', minWidth:1200, color:'#222', background:'#fff', borderRadius:8, overflow:'hidden', fontSize:'1rem', marginBottom:0}}>
                      <thead>
                        <tr style={{background:'#ffe600', color:'#222', fontWeight:700}}>
                          {selectedFields.map(field => (
                            <th key={field} style={{padding:'8px 6px'}}>
                              {availableFields.find(f => f.name === field)?.label || field}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item, itemIndex) => (
                          <tr key={itemIndex}>
                            {selectedFields.map(field => {
                              const isTotal = field === 'serviceTotal' || field.toLowerCase().includes('сума');
                              return (
                                <td
                                  key={field}
                                  style={{
                                    fontWeight: isTotal ? 700 : 400,
                                    background: isTotal ? '#b6ffb6' : undefined,
                                    color: isTotal ? '#222' : undefined,
                                    padding:'8px 6px',
                                    textAlign: typeof item[field] === 'number' ? 'right' : 'left'
                                  }}
                                >
                                  {typeof item[field] === 'boolean'
                                    ? (item[field] ? 'Так' : 'Ні')
                                    : item[field] || ''}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
function RegionalManagerTabs({ tab, setTab }) {
  return (
    <div style={{display:'flex',gap:8}}>
      <button 
        onClick={()=>setTab('tasks')} 
        style={{
          padding:'8px 24px',
          borderRadius:8,
          border:'none',
          background:tab==='tasks'?'#00bfff':'#eee',
          color:tab==='tasks'?'#fff':'#22334a',
          fontWeight:600,
          cursor:'pointer'
        }}
      >
        Робота з завданнями
      </button>
      <button 
        onClick={()=>setTab('report')} 
        style={{
          padding:'8px 24px',
          borderRadius:8,
          border:'none',
          background:tab==='report'?'#00bfff':'#eee',
          color:tab==='report'?'#fff':'#22334a',
          fontWeight:600,
          cursor:'pointer'
        }}
      >
        Звіт по персоналу
      </button>
    </div>
  );
}
const areas = {
  service: ServiceArea,
  operator: (props) => (
    <Suspense fallback={<div style={{padding: '20px', textAlign: 'center'}}>Завантаження...</div>}>
      <OperatorArea {...props} />
    </Suspense>
  ),
  warehouse: (props) => (
    <Suspense fallback={<div style={{padding: '20px', textAlign: 'center'}}>Завантаження...</div>}>
      <WarehouseArea {...props} />
    </Suspense>
  ),
  accountant: (props) => (
    <Suspense fallback={<div style={{padding: '20px', textAlign: 'center'}}>Завантаження...</div>}>
      <AccountantArea {...props} />
    </Suspense>
  ),
  'accountant-approval': (props) => (
    <Suspense fallback={<div style={{padding: '20px', textAlign: 'center'}}>Завантаження...</div>}>
      <AccountantApprovalArea {...props} />
    </Suspense>
  ),
  regional: (props) => <RegionalManagerArea {...props} />,
  reports: (props) => <ReportBuilder {...props} />,
  materials: (props) => <MaterialsAnalysisArea {...props} />,
  analytics: (props) => <AnalyticsArea {...props} />,
};
// Окремий об'єкт для адміністратора
const areaByRole = {
  admin: (props) => <AdminArea {...props} />,
};
function App() {
  // console.log('DEBUG App: App component rendered');
  // console.log('DEBUG App: This is a test log');
  const { t } = useTranslation();
  const [serverMsg, setServerMsg] = useState('');
  const [user, setUser] = useState(null);
  const [currentArea, setCurrentArea] = useState(null);
  const [regionalTab, setRegionalTab] = useState(() => {
    const stored = localStorage.getItem('regionalTab');
    return stored === null || stored === undefined || stored === '' ? 'tasks' : stored;
  });
  // Додаю accessRules у стан
  const [accessRules, setAccessRules] = useState({});
  const [loadingAccessRules, setLoadingAccessRules] = useState(true);
  // Функція для оновлення активності користувача
  const updateUserActivity = (userLogin) => {
    if (!userLogin) return;
    const now = Date.now();
    localStorage.setItem(`user_activity_${userLogin}`, now.toString());
  };
  // Відстеження активності користувача при взаємодії з сторінкою
  useEffect(() => {
    if (!user?.login) return;
    const handleUserActivity = () => {
      updateUserActivity(user.login);
    };
    // Оновлюємо активність при різних подіях
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('scroll', handleUserActivity);
    // Початкове оновлення активності
    updateUserActivity(user.login);
    // Очищення обробників подій
    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);
    };
  }, [user?.login]);
  // Завантаження правил доступу з API
  useEffect(() => {
    // Завантажуємо правила доступу тільки після входу користувача
    if (!user) {
      return;
    }
    
    const loadAccessRules = async () => {
      setLoadingAccessRules(true);
      try {
        // Спочатку завантажуємо ролі
        const rolesData = await rolesAPI.getAll();
        // Потім завантажуємо правила доступу
        const serverRules = await accessRulesAPI.getAll();
        if (Object.keys(serverRules).length === 0) {
          // Якщо на сервері немає правил, створюємо за замовчуванням
          const defaultRules = getDefaultAccess(rolesData);
          await accessRulesAPI.save(defaultRules);
          setAccessRules(defaultRules);
        } else {
          // Оновлюємо існуючі правила, додаючи нову вкладку materials
          const updatedRules = updateExistingRules(serverRules);
          if (JSON.stringify(updatedRules) !== JSON.stringify(serverRules)) {
            await accessRulesAPI.save(updatedRules);
            setAccessRules(updatedRules);
          } else {
            setAccessRules(serverRules);
          }
        }
      } catch (error) {
        console.error('Помилка завантаження правил доступу:', error);
        // Використовуємо правила за замовчуванням при помилці
        const defaultRoles = [
          { value: 'admin', label: 'Адміністратор' },
          { value: 'service', label: 'Сервісна служба' },
          { value: 'operator', label: 'Оператор' },
          { value: 'warehouse', label: 'Зав. склад' },
          { value: 'accountant', label: 'Бух. рахунки' },
          { value: 'regional', label: 'Регіональний керівник' },
        ];
        setAccessRules(getDefaultAccess(defaultRoles));
      } finally {
        setLoadingAccessRules(false);
      }
    };
    loadAccessRules();
  }, [user]);
  // Функція для оновлення існуючих правил з новою вкладкою
  const updateExistingRules = (existingRules) => {
    const updatedRules = { ...existingRules };
    Object.keys(updatedRules).forEach(roleKey => {
      if (!updatedRules[roleKey].materials) {
        // Додаємо права для нової вкладки materials
        if (roleKey === 'admin' || roleKey === 'administrator') {
          updatedRules[roleKey].materials = 'full';
        } else {
          updatedRules[roleKey].materials = 'read';
        }
      }
      // Додаємо права для нової вкладки accountant-approval
      if (!updatedRules[roleKey]['accountant-approval']) {
        if (roleKey === 'admin' || roleKey === 'administrator') {
          updatedRules[roleKey]['accountant-approval'] = 'full';
        } else if (roleKey === 'buhgalteria' || roleKey === 'accountant') {
          updatedRules[roleKey]['accountant-approval'] = 'full';
        } else {
          updatedRules[roleKey]['accountant-approval'] = 'none';
        }
      }
    });
    return updatedRules;
  };
  useEffect(() => {
    localStorage.setItem('regionalTab', regionalTab);
  }, [regionalTab]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/ping`)
      .then(res => res.json())
      .then(data => setServerMsg(data.message))
      .catch(() => setServerMsg('Сервер недоступний...'))
  }, []);
  // Запуск KeepAlive сервісу після успішного входу
  useEffect(() => {
    if (user) {
      keepAliveService.start();
      // Обробка подій видимості сторінки
      const handleVisibilityChange = () => {
        if (document.hidden) {
          keepAliveService.stop();
        } else {
          keepAliveService.start();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      // Зупинка KeepAlive при виході з додатку
      return () => {
        keepAliveService.stop();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [user]);
  if (!user) {
    return <Login onLogin={u => { setUser(u); setCurrentArea(u.role); }} />
  }
  if (loadingAccessRules) {
    return (
      <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>
        <div>Завантаження правил доступу...</div>
      </div>
    );
  }
  // Перевіряємо права доступу до поточної вкладки
  const hasAccessToCurrentArea = accessRules[user.role] && 
    accessRules[user.role][currentArea] && 
    accessRules[user.role][currentArea] !== 'none';
  // Якщо користувач не має доступу до поточної вкладки, перенаправляємо на першу доступну
  if (!hasAccessToCurrentArea) {
    const availableAreas = Object.keys(accessRules[user.role] || {}).filter(area => 
      accessRules[user.role][area] && accessRules[user.role][area] !== 'none'
    );
    if (availableAreas.length > 0) {
      setCurrentArea(availableAreas[0]);
      return null; // Повертаємо null щоб уникнути рендерингу
    }
  }
  // Функція для обробки вибору вкладки з перевіркою прав
  const handleAreaSelect = (area) => {
    const hasAccess = accessRules[user.role] && 
      accessRules[user.role][area] && 
      accessRules[user.role][area] !== 'none';
    if (hasAccess) {
      setCurrentArea(area);
    } else {
      alert('У вас немає доступу до цієї вкладки');
    }
  };
  const Area = currentArea === 'admin' 
    ? areaByRole.admin 
    : areas[currentArea] || (() => <div>Оберіть область</div>);
  // Якщо користувач у режимі перегляду, показуємо мобільний інтерфейс
  if (user.isViewMode) {
    return (
      <>
        <div className='bg-logo'></div>
        <div style={{ 
          minHeight: '100vh',
          background: '#ffffff'
        }}>
          <div style={{
            background: '#22334a',
            color: '#fff',
            padding: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h1 style={{ margin: 0, fontSize: '20px' }}>{t('company_name')}</h1>
            <div style={{ fontSize: '14px' }}>
              {user.name} ({user.role})
            </div>
          </div>
          <MobileViewArea user={user} />
        </div>
      </>
    );
  }
  return (
    <>
      <div className='bg-logo'></div>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingBottom: '70px' }}>
        <div style={{ display: 'flex', flex: 1 }}>
          <Sidebar role={user.role} onSelect={handleAreaSelect} current={currentArea} accessRules={accessRules} />
          <div style={{ flex: 1 }}>
            <h1 style={{marginLeft:24}}>{t('company_name')}</h1>
            {(user.role === 'regional' || (user.role === 'admin' && currentArea === 'regional')) && false /* <RegionalManagerTabs tab={regionalTab} setTab={setRegionalTab} /> */}
            <div style={{
              marginLeft: 0,
              marginRight: currentArea === 'analytics' ? '0%' : '6%',
              width: currentArea === 'analytics' ? '100%' : 'auto'
            }}>
              <Area key={`${user.login}-${currentArea}`} user={user} accessRules={accessRules} currentArea={currentArea} />
            </div>
          </div>
        </div>
        <TasksStatisticsBar user={user} />
      </div>
    </>
  )
}

// Компонент для відображення статистики заявок в роботі в нижньому барі
function TasksStatisticsBar({ user }) {
  const [tasksStatistics, setTasksStatistics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatistics = async () => {
      try {
        setLoading(true);
        const statistics = await analyticsAPI.getTasksStatistics({
          region: user?.region || ''
        });
        setTasksStatistics(statistics);
      } catch (error) {
        console.error('Помилка завантаження статистики заявок:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStatistics();
    // Оновлюємо статистику кожні 30 секунд
    const interval = setInterval(loadStatistics, 30000);
    return () => clearInterval(interval);
  }, [user?.region]);

  const COLORS = {
    notInWork: '#9E9E9E',
    inWork: '#FF9800',
    pendingWarehouse: '#FFC107',
    pendingAccountant: '#FF5722',
    pendingInvoiceRequests: '#9C27B0'
  };

  // Не приховуємо бар під час завантаження - показуємо "Завантаження..."
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#1a2636',
      borderTop: '2px solid #3a4451',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      flexWrap: 'wrap',
      gap: '20px',
      boxShadow: '0 -2px 8px rgba(0,0,0,0.3)',
      zIndex: 1000
    }}>
      <div style={{ 
        color: '#fff', 
        fontSize: '14px', 
        fontWeight: 600,
        marginRight: '20px'
      }}>
        Заявки в роботі (на сьогоднішній день):
      </div>
      {tasksStatistics ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: COLORS.notInWork 
            }}></div>
            <span style={{ color: '#aaa', fontSize: '13px' }}>Не взято в роботу:</span>
            <span style={{ color: COLORS.notInWork, fontSize: '16px', fontWeight: 'bold' }}>
              {tasksStatistics.notInWork || 0}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: COLORS.inWork 
            }}></div>
            <span style={{ color: '#aaa', fontSize: '13px' }}>Виконується:</span>
            <span style={{ color: COLORS.inWork, fontSize: '16px', fontWeight: 'bold' }}>
              {tasksStatistics.inWork || 0}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: COLORS.pendingWarehouse 
            }}></div>
            <span style={{ color: '#aaa', fontSize: '13px' }}>Не підтверджено завскладом:</span>
            <span style={{ color: COLORS.pendingWarehouse, fontSize: '16px', fontWeight: 'bold' }}>
              {tasksStatistics.pendingWarehouse || 0}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: COLORS.pendingAccountant 
            }}></div>
            <span style={{ color: '#aaa', fontSize: '13px' }}>Не підтверджено бухгалтером:</span>
            <span style={{ color: COLORS.pendingAccountant, fontSize: '16px', fontWeight: 'bold' }}>
              {tasksStatistics.pendingAccountant || 0}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: COLORS.pendingInvoiceRequests 
            }}></div>
            <span style={{ color: '#aaa', fontSize: '13px' }}>Не виконані Заявки на рахунки:</span>
            <span style={{ color: COLORS.pendingInvoiceRequests, fontSize: '16px', fontWeight: 'bold' }}>
              {tasksStatistics.pendingInvoiceRequests || 0}
            </span>
          </div>
        </>
      ) : (
        <span style={{ color: '#aaa', fontSize: '13px' }}>Завантаження статистики...</span>
      )}
    </div>
  );
}
function calcTotal(row) {
  return [row.d1, row.d2, row.d3, row.d4, row.d5].reduce((sum, v) => sum + (isNaN(Number(v)) ? 0 : Number(v)), 0);
}
function PersonnelTimesheet({ user }) {
  const [users, setUsers] = useState([]);
  const allRegions = Array.from(new Set(users.map(u => u.region).filter(Boolean)));
  const [region, setRegion] = useState('');
  // Завантаження користувачів з MongoDB
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await columnsSettingsAPI.getAllUsers();
        setUsers(usersData);
      } catch (error) {
        console.error('Помилка завантаження користувачів:', error);
        setUsers([]);
      }
    };
    loadUsers();
  }, []);
  const serviceUsers = users.filter(u => {
    if (u.role !== 'service') return false;
    if (user?.region === 'Україна') return true;
    if (user?.region && user.region !== 'Україна') {
      return u.region === user.region;
    }
    return true;
  });
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [year, setYear] = useState(now.getFullYear());
  const storageKey = `timesheetData_${year}_${month}`;
  // Кількість днів у місяці згідно календаря
  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate(); // month: 1-12
  }
  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({length: daysInMonth}, (_, i) => i + 1);
  // --- Автоматичне заповнення для сервісної служби: робочі дні = 8, вихідні = 0 ---
  function getDefaultServiceTimesheet() {
    const result = {};
    serviceUsers.forEach(u => {
      const userData = {};
      days.forEach(d => {
        const date = new Date(year, month - 1, d); // JS: month 0-11
        const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
        userData[d] = (dayOfWeek === 0 || dayOfWeek === 6) ? 0 : 8;
      });
      userData.total = days.reduce((sum, d) => sum + (userData[d] || 0), 0);
      result[u.id] = userData;
    });
    return result;
  }
  
  // --- Окремий стан для сервісної служби ---
  const [serviceData, setServiceData] = useState(() => {
    const saved = localStorage.getItem(`serviceTimesheetData_${year}_${month}`);
    if (saved) return JSON.parse(saved);
    return getDefaultServiceTimesheet();
  });
  useEffect(() => {
    const saved = localStorage.getItem(`serviceTimesheetData_${year}_${month}`);
    setServiceData(saved ? JSON.parse(saved) : getDefaultServiceTimesheet());
  }, [`serviceTimesheetData_${year}_${month}`, serviceUsers.length]);
  useEffect(() => {
    localStorage.setItem(`serviceTimesheetData_${year}_${month}`, JSON.stringify(serviceData));
  }, [serviceData, `serviceTimesheetData_${year}_${month}`]);
  // --- Підсумковий блок ---
  // Зберігаємо налаштування підсумку по періоду
  const summaryKey = `timesheetSummary_${year}_${month}`;
  const [summary, setSummary] = useState(() => {
    const saved = localStorage.getItem(summaryKey);
    // Кількість робочих днів у місяці
    let workDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) workDays++;
    }
    return saved ? {...JSON.parse(saved), workDays, workHours: workDays * 8} : { workDays, workHours: workDays * 8 };
  });
  useEffect(() => {
    const saved = localStorage.getItem(summaryKey);
    let workDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) workDays++;
    }
    setSummary(saved ? {...JSON.parse(saved), workDays, workHours: workDays * 8} : { workDays, workHours: workDays * 8 });
  }, [summaryKey, daysInMonth, year, month]);
  useEffect(() => {
    localStorage.setItem(summaryKey, JSON.stringify(summary));
  }, [summary, summaryKey]);
  // --- Параметри для кожного співробітника ---
  const [payData, setPayData] = useState(() => {
    const saved = localStorage.getItem(`payData_${year}_${month}`);
    return saved ? JSON.parse(saved) : {};
  });
  useEffect(() => {
    const saved = localStorage.getItem(`payData_${year}_${month}`);
    setPayData(saved ? JSON.parse(saved) : {});
  }, [year, month]);
  useEffect(() => {
    console.log('💾 Saving payData to localStorage:', payData);
    localStorage.setItem(`payData_${year}_${month}`, JSON.stringify(payData));
  }, [payData, year, month]);
  // --- Функція для зміни параметрів виплат ---
  const handlePayChange = (userId, field, value) => {
    console.log('🔧 handlePayChange called:', { userId, field, value });
    console.log('🔧 Current payData before update:', payData);
    
    // Логування на сервер
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: `handlePayChange: userId=${userId}, field=${field}, value=${value}`, 
        type: 'info' 
      })
    }).catch(err => console.error('Failed to log to server:', err));
    
    setPayData(prev => {
      const userPay = prev[userId] || { salary: '', bonus: '' };
      const newUserPay = { ...userPay, [field]: value };
      const newData = { ...prev, [userId]: newUserPay };
      console.log('🔧 Updated payData state:', newData);
      
      // Логування оновлення стану
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: `payData updated: ${JSON.stringify(newData)}`, 
          type: 'info' 
        })
      }).catch(err => console.error('Failed to log state update:', err));
      
      return newData;
    });
    
    console.log('🔧 handlePayChange completed');
  };
  // --- Експорт у Excel (CSV) ---
  function exportToCSV() {
    let csv = '';
    // Заголовок
    csv += ['ПІБ', ...days.map(d => `День ${d}`), 'Всього годин', 'Оклад, грн', 'Бонус, грн', 'Підсумкова виплата, грн'].join(';') + '\n';
    filteredUsers.forEach(u => {
      const row = [];
      row.push(u.name);
      days.forEach(d => row.push(data[u.id || u._id]?.[d] || ''));
      row.push(data[u.id || u._id]?.total || 0);
      const salary = Number(payData[u.id || u._id]?.salary) || 0;
      const bonus = Number(payData[u.id || u._id]?.bonus) || 0;
      const payout = summary.workHours > 0 ? Math.round((salary * (data[u.id || u._id]?.total || 0) / summary.workHours) + bonus) : 0;
      row.push(salary);
      row.push(bonus);
      row.push(payout);
      csv += row.join(';') + '\n';
    });
    // Додаємо BOM для Excel
    csv = '\uFEFF' + csv;
    // Завантаження
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Табель_${year}_${month}${region ? '_' + region : ''}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  // --- Масиви місяців і років ---
  const months = [
    'Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'
  ];
  const years = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) years.push(y);
  useEffect(() => {
    if (serviceUsers.length === 0) {
      // Очищаємо всі дані табеля, виплат і підсумків для всіх місяців/років
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('timesheetData_') || key.startsWith('payData_') || key.startsWith('timesheetSummary_')) {
          localStorage.removeItem(key);
        }
      });
    }
  }, [serviceUsers.length]);
  return (
    <div style={{overflowX: 'auto', width: '100%', maxWidth: '100vw', boxSizing: 'border-box'}}>
      <div style={{background: 'rgba(34,51,74,0.85)', borderRadius: 8, padding: '24px 16px', marginBottom: 24, maxWidth: '100%', boxSizing: 'border-box'}}>
        <div style={{display:'flex',gap:16,alignItems:'center',marginBottom:16}}>
          <label style={{color:'#fff'}}>Місяць:
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{marginLeft:8}}>
              {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </label>
          <label style={{color:'#fff'}}>Рік:
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{marginLeft:8}}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label style={{color:'#fff'}}>Регіон:
            <select value={region} onChange={e => setRegion(e.target.value)} style={{marginLeft:8}}>
              <option value="">Україна</option>
              {Array.from(new Set(users.map(u => u.region).filter(Boolean))).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <button onClick={exportToCSV} style={{background:'#00bfff',color:'#fff',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:600,cursor:'pointer'}}>Експорт у Excel</button>
        </div>
        <div className="horizontal-scroll">
          {serviceUsers.length === 0 ? (
            <div style={{color:'#fff',padding:'24px',fontSize:'1.2em'}}>Немає працівників з ролью service</div>
          ) : (
          <table className="timesheet-table">
            <thead>
              <tr>
                <th style={{width:160, minWidth:120, maxWidth:220}}>ПІБ</th>
                {days.map(d => {
                  const date = new Date(year, month - 1, d);
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  return (
                    <th key={d} style={{width:28, minWidth:24, background: isWeekend ? '#ff4d4d' : undefined, color: isWeekend ? '#fff' : undefined}}>{d}</th>
                  );
                })}
                <th style={{width:80, minWidth:60}}>Всього годин</th>
              </tr>
            </thead>
            <tbody>
              {serviceUsers.map(u => (
                <tr key={u.id || u._id}>
                  <td style={{width:160, minWidth:120, maxWidth:220}}>{u.name}</td>
                  {days.map(d => {
                    const date = new Date(year, month - 1, d);
                    const dayOfWeek = date.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    return (
                      <td key={d} style={{width:28, minWidth:24, background: isWeekend ? '#ff4d4d' : undefined}}>
                        <input 
                          type="number" 
                          value={serviceData[u.id || u._id]?.[d] || ''} 
                          onChange={e => {
                            const userId = u.id || u._id;
                            console.log(`[DEBUG] Service input change: userId=${userId}, day=${d}, value=${e.target.value}`);
                            handleServiceChange(userId, d, e.target.value);
                          }} 
                          style={{width:'100%'}} 
                        />
                      </td>
                    );
                  })}
                  <td style={{width:80, minWidth:60}}>{serviceData[u.id || u._id]?.total || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        {/* Підсумковий блок */}
        <div style={{background: 'transparent', borderRadius: 8, padding: 0, marginTop: 24}}>
          <div style={{display:'flex',gap:24,alignItems:'center',marginBottom:12, color:'#fff'}}>
            <label>Робочих днів у місяці: <input type="number" min={0} max={31} value={summary.workDays} onChange={e => setSummary(s => ({...s, workDays: Number(e.target.value)}))} style={{width:60,marginLeft:8}} /></label>
            <label>Робочих годин у місяці: <input type="number" min={0} max={744} value={summary.workHours} onChange={e => setSummary(s => ({...s, workHours: Number(e.target.value)}))} style={{width:80,marginLeft:8}} /></label>
          </div>
          <table style={{width:'100%', color:'#fff'}}>
            <thead>
              <tr>
                <th>ПІБ</th>
                <th>Відпрацьовано годин</th>
                <th>Оклад, грн</th>
                <th>Бонус, грн</th>
                <th>Підсумкова виплата, грн</th>
              </tr>
            </thead>
            <tbody>
              {serviceUsers.map(u => {
                const total = data[u.id || u._id]?.total || 0;
                const salary = Number(payData[u.id || u._id]?.salary) || 0;
                const bonus = Number(payData[u.id || u._id]?.bonus) || 0;
                // Пропорційна виплата
                const payout = summary.workHours > 0 ? Math.round((salary * total / summary.workHours) + bonus) : 0;
                return (
                  <tr key={u.id || u._id}>
                    <td>{u.name}</td>
                    <td>{total}</td>
                    <td><input type="number" value={payData[u.id || u._id]?.salary || ''} onChange={e => {const userId = u.id || u._id; handlePayChange(userId, 'salary', e.target.value);}} style={{width:90}} /></td>
                    <td><input type="number" value={payData[u.id || u._id]?.bonus || ''} onChange={e => {const userId = u.id || u._id; handlePayChange(userId, 'bonus', e.target.value);}} style={{width:90}} /></td>
                    <td style={{fontWeight:600}}>{payout}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
// 2. Додаю компонент для редагування заявок адміністратором
function AdminEditTasksArea({ user }) {
  const [tasks, setTasks] = useState([]);
  const [importedTasks, setImportedTasks] = useState([]); // Новий стан для імпортованих заявок
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    requestDesc: '', serviceRegion: '', address: '', equipmentSerial: '', equipment: '', work: '', date: ''
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false); // Новий стан для модального вікна імпорту
  const [editTask, setEditTask] = useState(null);
  const [tab, setTab] = useState(() => {
    const savedTab = localStorage.getItem('adminEditTab');
    return savedTab || 'imported'; // Змінюємо початкову вкладку на імпортовані
  });
  // Додаємо useEffect для оновлення filters при зміні allTaskFields
  // але зберігаємо вже введені користувачем значення
  useEffect(() => {
    const newFilterKeys = {
      requestDesc: '', serviceRegion: '', address: '', equipmentSerial: '', equipment: '', work: '', date: ''
    };
    // Оновлюємо filters, зберігаючи вже введені значення
    setFilters(prevFilters => {
      const updatedFilters = { ...newFilterKeys };
      // Зберігаємо вже введені значення
      Object.keys(prevFilters).forEach(key => {
        if (prevFilters[key] && prevFilters[key] !== '') {
          updatedFilters[key] = prevFilters[key];
        }
      });
      return updatedFilters;
    });
  }, []); // Запускаємо тільки один раз при монтуванні
  useEffect(() => {
    localStorage.setItem('adminEditTab', tab);
  }, [tab]);
  useEffect(() => {
    setLoading(true);
    Promise.all([
      tasksAPI.getAll(),
      importedTasksAPI.getAll()
    ]).then(([tasksData, importedData]) => {
      setTasks(tasksData);
      setImportedTasks(importedData);
    }).finally(() => setLoading(false));
  }, []);
  const handleApprove = async (id, approved, comment) => {
    setLoading(true);
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    // Перевіряємо чи всі підтвердження пройшли для автоматичного заповнення bonusApprovalDate
    let bonusApprovalDate = t.bonusApprovalDate;
    if (
      approved === 'Підтверджено' &&
      t.status === 'Виконано' &&
      (t.approvedByWarehouse === 'Підтверджено' || t.approvedByWarehouse === true) &&
      (t.approvedByAccountant === 'Підтверджено' || t.approvedByAccountant === true)
    ) {
      const d = new Date();
      const currentDay = d.getDate();
      const currentMonth = d.getMonth() + 1;
      const currentYear = d.getFullYear();
      
      // Перевіряємо дату виконання робіт
      const workDate = new Date(t.date);
      const workMonth = workDate.getMonth() + 1;
      const workYear = workDate.getFullYear();
      
      // Нова логіка: якщо день >= 16 і місяць затвердження != місяць виконання
      if (currentDay >= 16 && (workMonth !== currentMonth || workYear !== currentYear)) {
        // Встановлюємо поточний місяць + 1
        if (currentMonth === 12) {
          bonusApprovalDate = `01-${currentYear + 1}`;
        } else {
          bonusApprovalDate = `${String(currentMonth + 1).padStart(2, '0')}-${currentYear}`;
        }
      } else {
        // Стара логіка: поточний місяць
        bonusApprovalDate = `${String(currentMonth).padStart(2, '0')}-${currentYear}`;
      }
    }
    const updated = await tasksAPI.update(id, {
        ...t, 
        approvedByAccountant: approved, 
        accountantComment: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.accountantComment),
        accountantComments: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.accountantComments),
        bonusApprovalDate: bonusApprovalDate
    });
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    setLoading(false);
  };
  const handleFilter = useCallback(e => {
    console.log('DEBUG AccountantArea: handleFilter - e.target.name =', e.target.name);
    console.log('DEBUG AccountantArea: handleFilter - e.target.value =', e.target.value);
    setFilters(prevFilters => {
      const newFilters = { ...prevFilters, [e.target.name]: e.target.value };
      console.log('DEBUG AccountantArea: handleFilter - old filters =', prevFilters);
      console.log('DEBUG AccountantArea: handleFilter - newFilters =', newFilters);
      return newFilters;
    });
  }, []);
  const handleEdit = t => {
    const taskReadOnly = t._readOnly;
    const taskData = { ...t };
    delete taskData._readOnly; // Видаляємо прапорець з даних завдання
    setEditTask(taskData);
    setModalOpen(true);
    // Передаємо readOnly в ModalTaskForm якщо задача має _readOnly або якщо доступ тільки для читання
    if (taskReadOnly || isReadOnly) {
      // Встановлюємо прапорець для ModalTaskForm
      setEditTask(prev => ({ ...prev, _readOnly: true }));
    }
  };
  // Функція для збереження тільки поля bonusApprovalDate
  const handleSaveBonusDate = async (taskId, newDate) => {
    setLoading(true);
    try {
      // Знаходимо поточну заявку
      const currentTask = tasks.find(t => t.id === taskId);
      if (!currentTask) {
        console.error('[ERROR] handleSaveBonusDate - заявка не знайдена:', taskId);
        return;
      }
      // Оновлюємо тільки поле bonusApprovalDate
      const updatedTask = { ...currentTask, bonusApprovalDate: newDate };
      const updated = await tasksAPI.update(taskId, updatedTask);
      // Оновлюємо локальний стан
      setTasks(tasks => tasks.map(t => t.id === taskId ? updated : t));
    } catch (error) {
      console.error('[ERROR] handleSaveBonusDate - помилка збереження:', error);
    } finally {
      setLoading(false);
    }
  };

  // Основна функція handleSave
  const handleSave = async (taskData) => {
    setLoading(true);
    try {
      if (editTask) {
        const updated = await tasksAPI.update(editTask.id, taskData);
        setTasks(tasks => tasks.map(t => t.id === editTask.id ? updated : t));
      } else {
        const newTask = await tasksAPI.create(taskData);
        setTasks(tasks => [...tasks, newTask]);
      }
      setModalOpen(false);
      setEditTask(null);
    } catch (error) {
      console.error('Помилка збереження заявки:', error);
      alert('Помилка збереження заявки');
    } finally {
      setLoading(false);
    }
  };

  // Функція для обробки імпортованих заявок
  const handleImportTasks = async (importedTasksData) => {
    console.log('[IMPORT] Отримано імпортовані заявки:', importedTasksData);
    try {
      setLoading(true);
      const savedTasks = await importedTasksAPI.create(importedTasksData);
      setImportedTasks(savedTasks);
      alert(`Успішно імпортовано ${savedTasks.length} заявок. Вони з'явилися у вкладці "Імпортовані заявки".`);
    } catch (error) {
      console.error('[ERROR] handleImportTasks - помилка:', error);
      alert('Помилка збереження імпортованих заявок');
    } finally {
      setLoading(false);
    }
  };

  // Модифікована функція handleSave для роботи з імпортованими заявками
  const handleSaveImported = async (taskData) => {
    setLoading(true);
    try {
      if (editTask) {
        // Якщо це імпортована заявка, переміщуємо її в основну базу
        if (importedTasks.find(t => t._id === editTask._id)) {
          const newTask = await importedTasksAPI.approve(editTask._id, taskData);
          setTasks(tasks => [...tasks, newTask]);
          setImportedTasks(importedTasks => importedTasks.filter(t => t._id !== editTask._id));
          alert('Заявка успішно додана до системи!');
        } else {
          // Звичайне оновлення існуючої заявки
          const updated = await tasksAPI.update(editTask.id, taskData);
          setTasks(tasks => tasks.map(t => t.id === editTask.id ? updated : t));
        }
      } else {
        const newTask = await tasksAPI.create(taskData);
        setTasks(tasks => [...tasks, newTask]);
      }
      setModalOpen(false);
      setEditTask(null);
    } catch (error) {
      console.error('Помилка збереження заявки:', error);
      alert('Помилка збереження заявки');
    } finally {
      setLoading(false);
    }
  };

  // Функція для видалення імпортованих заявок
  const handleDeleteImported = async (taskId) => {
    if (window.confirm('Ви впевнені, що хочете видалити цю імпортовану заявку?')) {
      try {
        setLoading(true);
        await importedTasksAPI.delete(taskId);
        setImportedTasks(importedTasks => importedTasks.filter(t => t._id !== taskId));
        alert('Імпортована заявка видалена!');
      } catch (error) {
        console.error('[ERROR] handleDeleteImported - помилка:', error);
        alert('Помилка видалення імпортованої заявки');
      } finally {
        setLoading(false);
      }
    }
  };
  const filtered = tasks.filter(t =>
    (!filters.requestDesc || t.requestDesc.toLowerCase().includes(filters.requestDesc.toLowerCase())) &&
    (!filters.serviceRegion || t.serviceRegion.toLowerCase().includes(filters.serviceRegion.toLowerCase())) &&
    (!filters.address || t.address.toLowerCase().includes(filters.address.toLowerCase())) &&
    (!filters.equipmentSerial || t.equipmentSerial.toLowerCase().includes(filters.equipmentSerial.toLowerCase())) &&
    (!filters.equipment || t.equipment.toLowerCase().includes(filters.equipment.toLowerCase())) &&
    (!filters.work || t.work.toLowerCase().includes(filters.work.toLowerCase())) &&
    (!filters.date || t.date.includes(filters.date))
  );
  
  // Фільтрація імпортованих заявок
  const filteredImported = importedTasks.filter(t =>
    (!filters.requestDesc || t.requestDesc.toLowerCase().includes(filters.requestDesc.toLowerCase())) &&
    (!filters.serviceRegion || t.serviceRegion.toLowerCase().includes(filters.serviceRegion.toLowerCase())) &&
    (!filters.address || t.address.toLowerCase().includes(filters.address.toLowerCase())) &&
    (!filters.equipmentSerial || t.equipmentSerial.toLowerCase().includes(filters.equipmentSerial.toLowerCase())) &&
    (!filters.equipment || t.equipment.toLowerCase().includes(filters.equipment.toLowerCase())) &&
    (!filters.work || t.work.toLowerCase().includes(filters.work.toLowerCase())) &&
    (!filters.date || t.date.includes(filters.date))
  );
  
  const pending = filtered.filter(t => t.status === 'Виконано' && isPending(t.approvedByAccountant));
  const archive = filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByAccountant));
  
  // Визначаємо дані для таблиці залежно від вкладки
  const tableData = tab === 'imported' ? filteredImported : (tab === 'pending' ? pending : archive);
  const columns = allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: [
      'requestDate', 'requestDesc', 'serviceRegion', 'client', 'address', 'equipmentSerial', 'equipment', 'work', 'date', 'serviceTotal'
    ].includes(f.name)
  }));
  return (
    <div style={{padding:32}}>
      <h2>Редагування заявок (Адміністратор)</h2>
      {loading && <div>Завантаження...</div>}
      
      {/* Кнопка імпорту Excel */}
      <div style={{marginBottom:16, display:'flex', gap:8, alignItems:'center'}}>
        <button 
          onClick={() => setImportModalOpen(true)}
          style={{
            padding: '10px 20px',
            background: '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          📊 Завантажити дані з Excel
        </button>
        <span style={{color: '#666', fontSize: '14px'}}>
          Імпортовано заявок: {importedTasks.length}
        </span>
      </div>
      
      {/* Модальне вікно імпорту Excel */}
      <ExcelImportModal 
        open={importModalOpen} 
        onClose={() => setImportModalOpen(false)} 
        onImport={handleImportTasks}
      />
      
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button onClick={()=>setTab('imported')} style={{width:220,padding:'10px 0',background:tab==='imported'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='imported'?700:400,cursor:'pointer'}}>Імпортовані заявки</button>
        <button onClick={()=>setTab('pending')} style={{width:220,padding:'10px 0',background:tab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='pending'?700:400,cursor:'pointer'}}>Заявка на підтвердженні</button>
        <button onClick={()=>setTab('archive')} style={{width:220,padding:'10px 0',background:tab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
      </div>
      
      <ModalTaskForm 
        open={modalOpen} 
        onClose={()=>{setModalOpen(false);setEditTask(null);}} 
        onSave={tab === 'imported' ? handleSaveImported : handleSave} 
        initialData={editTask || {}} 
        mode="admin" 
        user={user} 
        readOnly={editTask?._readOnly || false} 
      />
      
      <TaskTable
        tasks={tableData}
        allTasks={tab === 'imported' ? importedTasks : tasks}
        onApprove={tab === 'imported' ? undefined : handleApprove}
        onEdit={handleEdit}
        onDelete={tab === 'imported' ? handleDeleteImported : undefined}
        onSaveBonusDate={tab === 'imported' ? undefined : handleSaveBonusDate}
        role="admin"
        user={user}
        filters={filters}
        onFilterChange={handleFilter}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        approveField="approvedByAccountant"
        commentField="accountantComment"
        isArchive={tab === 'archive'}
        isImported={tab === 'imported'}
      />
    </div>
  );
}
// 3. Оновлюю AdminArea для підвкладок
function AdminArea({ user }) {
  const [tab, setTab] = useState('system');
  return (
    <div style={{padding:32}}>
      <div style={{display:'flex',gap:8,marginBottom:24}}>
        <button onClick={()=>setTab('system')} style={{padding:'10px 32px',background:tab==='system'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='system'?700:400,cursor:'pointer'}}>Системні параметри</button>
        <button onClick={()=>setTab('edit')} style={{padding:'10px 32px',background:tab==='edit'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='edit'?700:400,cursor:'pointer'}}>Редагування заявок</button>
        <button onClick={()=>setTab('backup')} style={{padding:'10px 32px',background:tab==='backup'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='backup'?700:400,cursor:'pointer'}}>Відновлення даних</button>
        <button onClick={()=>setTab('events')} style={{padding:'10px 32px',background:tab==='events'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='events'?700:400,cursor:'pointer'}}>Журнал подій</button>
        <button onClick={()=>setTab('notifications')} style={{padding:'10px 32px',background:tab==='notifications'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='notifications'?700:400,cursor:'pointer'}}>Telegram сповіщення</button>
        <button onClick={()=>setTab('userNotifications')} style={{padding:'10px 32px',background:tab==='userNotifications'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='userNotifications'?700:400,cursor:'pointer'}}>Управління сповіщеннями</button>
        <button onClick={()=>setTab('debugNotifications')} style={{padding:'10px 32px',background:tab==='debugNotifications'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='debugNotifications'?700:400,cursor:'pointer'}}>🔧 Дебаг сповіщень</button>
      </div>
      {tab === 'system' && <AdminSystemParamsArea />}
      {tab === 'edit' && <AdminEditTasksArea user={user} />}
      {tab === 'backup' && <AdminBackupArea user={user} />}
      {tab === 'events' && <EventLogArea user={user} />}
      {tab === 'notifications' && <NotificationSettings user={user} />}
      {tab === 'userNotifications' && <UserNotificationManager user={user} />}
      {tab === 'debugNotifications' && <NotificationDebugPanel user={user} />}
    </div>
  );
}
// --- Компонент для відновлення даних ---
function AdminBackupArea({ user }) {
  const [backups, setBackups] = useState(() => {
    try {
    const saved = localStorage.getItem('backups');
      if (saved) {
        const parsedBackups = JSON.parse(saved);
        // Обмежуємо кількість завантажених бекапів до 10
        if (parsedBackups.length > 10) {
          const limitedBackups = parsedBackups.slice(-10);
          localStorage.setItem('backups', JSON.stringify(limitedBackups));
          return limitedBackups;
        }
        return parsedBackups;
      }
      return [];
    } catch (error) {
      console.error('[BACKUP] Помилка парсингу бекапів при ініціалізації:', error);
      return [];
    }
  });
  const [serverBackups, setServerBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [autoInterval, setAutoInterval] = useState(() => {
    const saved = localStorage.getItem('backupInterval');
    return saved || 'day';
  });
  const [lastAutoBackup, setLastAutoBackup] = useState(() => {
    const saved = localStorage.getItem('lastAutoBackup');
    return saved ? new Date(saved) : null;
  });
  // Завантаження бекапів з сервера
  const loadServerBackups = async () => {
    if (!user?.login) return;
    try {
      setLoadingBackups(true);
      const serverBackupsData = await backupAPI.getAll(user.login);
      setServerBackups(serverBackupsData);
    } catch (error) {
      console.error('[BACKUP] Помилка завантаження серверних бекапів:', error);
    } finally {
      setLoadingBackups(false);
    }
  };
  // Завантажуємо серверні бекапи при зміні користувача
  useEffect(() => {
    if (user?.login) {
      loadServerBackups();
    }
  }, [user?.login]);
  const [showExcelImport, setShowExcelImport] = useState(false);
  // --- Функція для експорту всіх завдань в Excel ---
  const handleExportToExcel = async () => {
    try {
      const tasksToExport = await tasksAPI.getAll();
    if (tasksToExport.length === 0) {
      alert('Немає завдань для експорту.');
      return;
    }
    // Використовуємо українські назви з allTaskFields для заголовків
    const headers = allTaskFields.map(field => field.label);
    // Формуємо дані для рядків
    const data = tasksToExport.map(task => {
      return allTaskFields.map(field => task[field.name] || '');
    });
    // Створюємо робочий аркуш
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Усі завдання');
    // Запускаємо завантаження файлу
    XLSX.writeFile(workbook, 'export_all_tasks.xlsx');
    } catch (error) {
      console.error('Помилка експорту:', error);
      alert('Помилка при експорті завдань. Спробуйте ще раз.');
    }
  };
  // --- Функція для перегляду бекапу ---
  const [viewingBackup, setViewingBackup] = useState(null);
  const [backupPreview, setBackupPreview] = useState(null);
  const viewBackup = (backup) => {
    try {
      const tasksData = JSON.parse(backup.data);
      setBackupPreview({
        ...backup,
        tasks: tasksData.slice(0, 10), // Перші 10 завдань
        totalTasks: tasksData.length
      });
      setViewingBackup(backup);
    } catch (error) {
      console.error('[ERROR] Помилка парсингу даних бекапу:', error);
      alert('Помилка при перегляді бекапу');
    }
  };
  const closeBackupView = () => {
    setViewingBackup(null);
    setBackupPreview(null);
  };
  // --- Додаю створення бекапу ---
  const createBackup = async () => {
    try {
    const now = new Date();
      // Додаємо невелику затримку для забезпечення оновлення бази
      await new Promise(resolve => setTimeout(resolve, 1000));
      const tasksData = await tasksAPI.getAll();
      // Логуємо перші кілька завдань для перевірки актуальності даних
      if (tasksData.length > 0) {
      }
      // Оптимізуємо дані - зберігаємо тільки необхідні поля
      const optimizedTasks = tasksData.map(task => ({
        id: task.id,
        taskNumber: task.taskNumber,
        status: task.status,
        company: task.company,
        client: task.client,
        address: task.address,
        workDescription: task.workDescription,
        serviceEngineers: task.serviceEngineers,
        workPrice: task.workPrice,
        serviceTotal: task.serviceTotal,
        paymentType: task.paymentType,
        paymentDate: task.paymentDate,
        requestDate: task.requestDate,
        date: task.date,
        serviceRegion: task.serviceRegion,
        approvedByWarehouse: task.approvedByWarehouse,
        approvedByAccountant: task.approvedByAccountant,
        approvedByRegionalManager: task.approvedByRegionalManager,
        warehouseComment: task.warehouseComment,
        accountantComment: task.accountantComment,
        regionalManagerComment: task.regionalManagerComment,
        bonusApprovalDate: task.bonusApprovalDate,
        accountantComments: task.accountantComments
      }));
      const backupData = JSON.stringify(optimizedTasks);
      const backupName = `Бекап ${now.toLocaleDateString('uk-UA')} ${now.toLocaleTimeString('uk-UA')}`;
      // Створюємо бекап для локального зберігання
      const localBackup = {
      id: Date.now(),
      date: now.toISOString(),
        data: backupData
      };
      // Зберігаємо на сервері
      let serverSuccess = false;
      try {
        const serverBackup = await backupAPI.create({
          userId: user?.login || 'system',
          name: backupName,
          description: `Автоматичний бекап з ${tasksData.length} завданнями`,
          data: backupData,
          taskCount: tasksData.length,
          isAuto: false
        });
        serverSuccess = true;
      } catch (serverError) {
        console.error('[BACKUP] Помилка збереження на сервері:', serverError);
        // Продовжуємо з локальним збереженням навіть якщо сервер недоступний
      }
      // Зберігаємо локально
      let newBackups = [...backups, localBackup];
      if (newBackups.length > 10) {
        newBackups = newBackups.slice(newBackups.length - 10);
      }
      // Перевіряємо розмір перед збереженням
      const backupString = JSON.stringify(newBackups);
      const sizeInMB = new Blob([backupString]).size / (1024 * 1024);
      if (sizeInMB > 4) { // Якщо більше 4MB, зберігаємо тільки 5 останніх
        newBackups = newBackups.slice(-5);
      }
    setBackups(newBackups);
      try {
    localStorage.setItem('backups', JSON.stringify(newBackups));
    setLastAutoBackup(now);
    localStorage.setItem('lastAutoBackup', now.toISOString());
        // Перевіряємо, чи вдалося зберегти на сервері
        if (serverSuccess) {
          alert('Бекап успішно створено! Збережено локально та на сервері.');
        } else {
          alert('Бекап створено локально, але не вдалося зберегти на сервері. Спробуйте ще раз пізніше.');
        }
      } catch (storageError) {
        console.error('[BACKUP] Помилка збереження в localStorage:', storageError);
        // Якщо localStorage переповнений, зберігаємо тільки 3 останні бекапи
        const minimalBackups = newBackups.slice(-3);
        localStorage.setItem('backups', JSON.stringify(minimalBackups));
        setBackups(minimalBackups);
        alert('Бекап створено на сервері, але локально збережено тільки 3 останні бекапи через обмеження браузера');
      }
    } catch (error) {
      console.error('[BACKUP] Помилка створення бекапу:', error);
      alert(`Помилка при створенні бекапу: ${error.message}. Спробуйте ще раз.`);
    }
  };
  // --- Видалення бекапу ---
  const deleteBackup = async (id) => {
    try {
      // Видаляємо з сервера (якщо це серверний бекап)
      try {
        await backupAPI.delete(id, user?.login || 'system');
      } catch (serverError) {
        console.error('[BACKUP] Помилка видалення з сервера:', serverError);
        // Продовжуємо з локальним видаленням
      }
      // Видаляємо локально
    const newBackups = backups.filter(b => b.id !== id);
    setBackups(newBackups);
    localStorage.setItem('backups', JSON.stringify(newBackups));
    } catch (error) {
      console.error('[BACKUP] Помилка видалення бекапу:', error);
      alert('Помилка при видаленні бекапу. Спробуйте ще раз.');
    }
  };
  // --- Автоматичний бекап ---
  useEffect(() => {
    if (!lastAutoBackup) return;
    const now = new Date();
    let nextBackup = new Date(lastAutoBackup);
    if (autoInterval === 'day') nextBackup.setDate(nextBackup.getDate() + 1);
    if (autoInterval === '3days') nextBackup.setDate(nextBackup.getDate() + 3);
    if (autoInterval === 'week') nextBackup.setDate(nextBackup.getDate() + 7);
    if (autoInterval === 'month') nextBackup.setMonth(nextBackup.getMonth() + 1);
    if (now >= nextBackup) createBackup();
    // eslint-disable-next-line
  }, [autoInterval, lastAutoBackup]);
  // --- Зміна інтервалу ---
  const handleIntervalChange = e => {
    setAutoInterval(e.target.value);
    localStorage.setItem('backupInterval', e.target.value);
  };
  // --- Відновлення з бекапу ---
  const restoreBackup = async backup => {
    if (window.confirm('Відновити дані з цього бекапу? Поточні дані будуть замінені.')) {
      if (backup.data) {
        try {
          const tasksData = JSON.parse(backup.data);
          // Очищаємо поточні завдання
          const currentTasks = await tasksAPI.getAll();
          for (const task of currentTasks) {
            await tasksAPI.remove(task.id);
          }
          // Додаємо завдання з бекапу
          for (const task of tasksData) {
            await tasksAPI.add(task);
          }
        alert('Дані успішно відновлено! Оновіть сторінку для застосування змін.');
        } catch (error) {
          console.error('Помилка відновлення:', error);
          alert('Помилка при відновленні даних. Спробуйте ще раз.');
        }
      } else {
        alert('У цьому бекапі немає даних для відновлення.');
      }
    }
  };
  // --- Обробка імпорту Excel ---
  const handleExcelImport = async (importedTasks) => {
    try {
      // Додаємо нові завдання через API
      for (const task of importedTasks) {
        await tasksAPI.add(task);
      }
      // Створюємо бекап перед імпортом
      await createBackup();
      alert(`Успішно імпортовано ${importedTasks.length} завдань!`);
      // Оновлюємо сторінку для відображення нових завдань
      window.location.reload();
    } catch (error) {
      console.error('Помилка імпорту:', error);
      alert('Помилка при імпорті завдань. Спробуйте ще раз.');
    }
  };
  return (
    <div style={{padding:32}}>
      <h2>Відновлення даних</h2>
      {/* Кнопки імпорту та бекапу */}
      <div style={{display:'flex',gap:16,alignItems:'center',marginBottom:24,flexWrap:'wrap'}}>
        <button 
          onClick={() => setShowExcelImport(true)} 
          style={{
            background:'#28a745',
            color:'#fff',
            border:'none',
            borderRadius:6,
            padding:'10px 32px',
            fontWeight:600,
            cursor:'pointer'
          }}
        >
          📊 Завантажити дані з Excel
        </button>
        <button 
          onClick={handleExportToExcel}
          style={{
            background:'#ff8c00',
            color:'#fff',
            border:'none',
            borderRadius:6,
            padding:'10px 32px',
            fontWeight:600,
            cursor:'pointer'
          }}
        >
          📤 Експорт в Excel
        </button>
        <button 
          onClick={createBackup} 
          style={{
            background:'#00bfff',
            color:'#fff',
            border:'none',
            borderRadius:6,
            padding:'10px 32px',
            fontWeight:600,
            cursor:'pointer'
          }}
        >
          💾 Створити бекап
        </button>
        <label style={{display:'flex',alignItems:'center',gap:8}}>
          Автоматичний бекап:
          <select value={autoInterval} onChange={handleIntervalChange} style={{padding:'4px 8px'}}>
            <option value="day">Кожен день</option>
            <option value="3days">Кожні 3 дні</option>
            <option value="week">Кожен тиждень</option>
            <option value="month">Кожен місяць</option>
          </select>
        </label>
        <span style={{color:'#666'}}>
          Останній бекап: {lastAutoBackup ? new Date(lastAutoBackup).toLocaleString() : '—'}
        </span>
      </div>
      {/* Інформація про імпорт */}
      <div style={{
        background:'#e8f5e8',
        border:'1px solid #28a745',
        borderRadius:6,
        padding:16,
        marginBottom:24
      }}>
        <h3 style={{margin:'0 0 8px 0',color:'#155724'}}>📊 Імпорт з Excel</h3>
        <p style={{margin:0,color:'#155724'}}>
          Завантажте Excel файл з виконаними завданнями. Система автоматично розпізнає колонки 
          та дозволить налаштувати залежність між полями Excel та полями системи. 
          Імпортовані завдання будуть додані до бази даних та розподілені по відповідних вкладках.
        </p>
      </div>
      {/* Таблиця бекапів */}
      <div style={{marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{color:'#22334a',margin:0}}>Історія бекапів</h3>
        <button 
          onClick={loadServerBackups}
          disabled={loadingBackups}
          style={{
            background: loadingBackups ? '#ccc' : '#007bff',
            color:'#fff',
            border:'none',
            padding:'6px 12px',
            borderRadius:4,
            fontSize:'12px',
            cursor: loadingBackups ? 'not-allowed' : 'pointer'
          }}
        >
          {loadingBackups ? 'Завантаження...' : 'Оновити з сервера'}
        </button>
      </div>
      {/* Локальні бекапи */}
      <div style={{marginBottom:24}}>
        <h4 style={{marginBottom:8,color:'#666'}}>Локальні бекапи ({backups.length})</h4>
      <table style={{width:'100%',background:'#22334a',color:'#fff',borderRadius:8,overflow:'hidden'}}>
        <thead>
          <tr>
            <th style={{padding:12,textAlign:'left'}}>Дата бекапу</th>
            <th style={{padding:12,textAlign:'left'}}>Дія</th>
          </tr>
        </thead>
        <tbody>
          {backups.slice().reverse().map(b => (
            <tr key={b.id}>
              <td style={{padding:12}}>{new Date(b.date).toLocaleString()}</td>
              <td style={{padding:12}}>
                  <button 
                    onClick={()=>viewBackup(b)} 
                    style={{
                      background:'#17a2b8',
                      color:'#fff',
                      border:'none',
                      borderRadius:4,
                      padding:'4px 12px',
                      cursor:'pointer',
                      marginRight:8
                    }}
                  >
                    Переглянути
                  </button>
                <button 
                  onClick={()=>restoreBackup(b)} 
                  style={{
                    background:'#43a047',
                    color:'#fff',
                    border:'none',
                    borderRadius:4,
                    padding:'4px 12px',
                    cursor:'pointer',
                    marginRight:8
                  }}
                >
                  Відновити
                </button>
                <button 
                  onClick={()=>deleteBackup(b.id)} 
                  style={{
                    background:'#f66',
                    color:'#fff',
                    border:'none',
                    borderRadius:4,
                    padding:'4px 12px',
                    cursor:'pointer'
                  }}
                >
                  Видалити
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {/* Серверні бекапи */}
      <div>
        <h4 style={{marginBottom:8,color:'#666'}}>Серверні бекапи ({serverBackups.length})</h4>
        <table style={{width:'100%',background:'#e3f2fd',color:'#333',borderRadius:8,overflow:'hidden'}}>
          <thead>
            <tr style={{background:'#bbdefb'}}>
              <th style={{padding:12,textAlign:'left'}}>Назва</th>
              <th style={{padding:12,textAlign:'left'}}>Дата</th>
              <th style={{padding:12,textAlign:'left'}}>Розмір</th>
              <th style={{padding:12,textAlign:'left'}}>Дія</th>
            </tr>
          </thead>
          <tbody>
            {serverBackups.slice().reverse().map(b => (
              <tr key={b._id}>
                <td style={{padding:12}}>{b.name}</td>
                <td style={{padding:12}}>{new Date(b.createdAt).toLocaleString()}</td>
                <td style={{padding:12}}>{(b.size / 1024).toFixed(1)} KB</td>
                <td style={{padding:12}}>
                  <button 
                    onClick={()=>viewBackup(b)} 
                    style={{
                      background:'#17a2b8',
                      color:'#fff',
                      border:'none',
                      borderRadius:4,
                      padding:'4px 12px',
                      cursor:'pointer',
                      marginRight:8
                    }}
                  >
                    Переглянути
                  </button>
                  <button 
                    onClick={()=>restoreBackup(b)} 
                    style={{
                      background:'#43a047',
                      color:'#fff',
                      border:'none',
                      borderRadius:4,
                      padding:'4px 12px',
                      cursor:'pointer',
                      marginRight:8
                    }}
                  >
                    Відновити
                  </button>
                  <button 
                    onClick={()=>deleteBackup(b._id)} 
                    style={{
                      background:'#f66',
                      color:'#fff',
                      border:'none',
                      borderRadius:4,
                      padding:'4px 12px',
                      cursor:'pointer'
                    }}
                  >
                    Видалити
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Модальне вікно імпорту Excel */}
      <ExcelImportModal
        open={showExcelImport}
        onClose={() => setShowExcelImport(false)}
        onImport={handleExcelImport}
      />
      {/* Модальне вікно перегляду бекапу */}
      {viewingBackup && backupPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 8,
            padding: 20,
            maxWidth: '90%',
            maxHeight: '90%',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
              borderBottom: '1px solid #eee',
              paddingBottom: 10
            }}>
              <h3 style={{margin: 0, color: '#333'}}>
                Перегляд бекапу: {backupPreview.name || 'Бекап'}
              </h3>
              <button
                onClick={closeBackupView}
                style={{
                  background: '#f66',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  padding: '8px 16px',
                  cursor: 'pointer'
                }}
              >
                Закрити
              </button>
            </div>
            <div style={{marginBottom: 15, color: '#333'}}>
              <strong style={{color: '#333'}}>Загальна інформація:</strong>
              <ul style={{margin: '5px 0', paddingLeft: 20, color: '#333'}}>
                <li style={{color: '#333'}}>Дата створення: {new Date(backupPreview.date || backupPreview.createdAt).toLocaleString()}</li>
                <li style={{color: '#333'}}>Кількість завдань: {backupPreview.totalTasks}</li>
                <li style={{color: '#333'}}>Розмір: {backupPreview.size ? (backupPreview.size / 1024).toFixed(1) + ' KB' : 'Невідомо'}</li>
                <li style={{color: '#333'}}>Опис: {backupPreview.description || 'Немає опису'}</li>
              </ul>
            </div>
            <div style={{color: '#333'}}>
              <strong style={{color: '#333'}}>Перші 10 завдань з бекапу:</strong>
              <div style={{
                maxHeight: '400px',
                overflow: 'auto',
                border: '1px solid #ddd',
                borderRadius: 4,
                marginTop: 10
              }}>
                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{background: '#f5f5f5'}}>
                      <th style={{padding: 8, border: '1px solid #ddd', textAlign: 'left'}}>№</th>
                      <th style={{padding: 8, border: '1px solid #ddd', textAlign: 'left'}}>Статус</th>
                      <th style={{padding: 8, border: '1px solid #ddd', textAlign: 'left'}}>Компанія</th>
                      <th style={{padding: 8, border: '1px solid #ddd', textAlign: 'left'}}>Клієнт</th>
                      <th style={{padding: 8, border: '1px solid #ddd', textAlign: 'left'}}>Адреса</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupPreview.tasks.map((task, index) => (
                      <tr key={task.id || index}>
                        <td style={{padding: 8, border: '1px solid #ddd', color: '#333'}}>{task.taskNumber || index + 1}</td>
                        <td style={{padding: 8, border: '1px solid #ddd', color: '#333'}}>{task.status || 'Невідомо'}</td>
                        <td style={{padding: 8, border: '1px solid #ddd', color: '#333'}}>{task.company || 'Невідомо'}</td>
                        <td style={{padding: 8, border: '1px solid #ddd', color: '#333'}}>{task.client || 'Невідомо'}</td>
                        <td style={{padding: 8, border: '1px solid #ddd', color: '#333'}}>{task.address || 'Невідомо'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {backupPreview.totalTasks > 10 && (
                <p style={{marginTop: 10, color: '#333', fontSize: '14px'}}>
                  ... та ще {backupPreview.totalTasks - 10} завдань
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App
