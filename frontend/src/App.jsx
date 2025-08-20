import React from 'react'
import { useState, useEffect, useMemo } from 'react'
import './App.css'
import './i18n'
import { useTranslation } from 'react-i18next'
import logoImg from './assets/Designer (4).jpeg'
import FinancialReport from './FinancialReport'
import ReportsList from './ReportsList'
import Login from './Login'
import Sidebar from './Sidebar'
import ModalTaskForm, { fields as allTaskFields } from './ModalTaskForm'
import TaskTable from './components/TaskTable'
import ExcelImportModal from './components/ExcelImportModal'
import ServiceReminderModal from './components/ServiceReminderModal'
import MobileViewArea from './components/MobileViewArea'
// Підключення кастомного шрифту Roboto для jsPDF відбувається через <script src="/Roboto-normal.js"></script> у public/index.html

// Додаю імпорт на початку файлу
import AccountantArea from './areas/AccountantArea';
import WarehouseArea from './areas/WarehouseArea';
import OperatorArea from './areas/OperatorArea';
import MaterialsAnalysisArea from './areas/MaterialsAnalysisArea';
import ReportBuilder from './areas/ReportBuilder';
import EventLogArea from './areas/EventLogArea';
import * as XLSX from 'xlsx-js-style';
import { columnsSettingsAPI } from './utils/columnsSettingsAPI';
import API_BASE_URL from './config.js';
import { tasksAPI } from './utils/tasksAPI';
import { accessRulesAPI } from './utils/accessRulesAPI';
import { rolesAPI } from './utils/rolesAPI';
import { regionsAPI } from './utils/regionsAPI';
import keepAliveService from './utils/keepAlive.js';

const roles = [
  { value: 'admin', label: 'Адміністратор' },
  { value: 'service', label: 'Сервісна служба' },
  { value: 'operator', label: 'Оператор' },
  { value: 'warehouse', label: 'Зав. склад' },
  { value: 'accountant', label: 'Бухгалтер' },
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
    { value: 'accountant', label: 'Бухгалтер' },
    { value: 'regional', label: 'Регіональний керівник' },
  ];
  
  const tabs = [
    { key: 'service', label: 'Сервісна служба' },
    { key: 'operator', label: 'Оператор' },
    { key: 'warehouse', label: 'Зав. склад' },
    { key: 'accountant', label: 'Бухгалтер' },
    { key: 'regional', label: 'Регіональний керівник' },
    { key: 'admin', label: 'Адміністратор' },
    { key: 'reports', label: 'Звіти' },
    { key: 'materials', label: 'Аналіз ціни матеріалів' },
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
      } else if (tab.key === 'reports') {
        // Всі ролі мають доступ для читання до звітів
        defaultAccess[role.value][tab.key] = 'read';
      } else if (tab.key === 'materials') {
        // Всі ролі мають доступ для читання до аналізу матеріалів
        defaultAccess[role.value][tab.key] = 'read';
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
    { value: 'accountant', label: 'Бухгалтер' },
    { value: 'regional', label: 'Регіональний керівник' },
  ];
    }
  };
  
  const tabs = [
    { key: 'service', label: 'Сервісна служба' },
    { key: 'operator', label: 'Оператор' },
    { key: 'warehouse', label: 'Зав. склад' },
    { key: 'accountant', label: 'Бухгалтер' },
    { key: 'regional', label: 'Регіональний керівник' },
    { key: 'admin', label: 'Адміністратор' },
    { key: 'reports', label: 'Звіти' },
    { key: 'materials', label: 'Аналіз ціни матеріалів' },
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
        console.log('[DEBUG][AccessRulesModal] Завантажені правила з сервера:', JSON.stringify(serverRules, null, 2));
        
        if (Object.keys(serverRules).length === 0) {
          // Якщо на сервері немає правил, використовуємо за замовчуванням
          const defaultRules = getDefaultAccess(rolesData);
          console.log('[DEBUG][AccessRulesModal] Створюємо правила за замовчуванням:', JSON.stringify(defaultRules, null, 2));
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
          { value: 'accountant', label: 'Бухгалтер' },
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
  
  const handleChange = (role, tab, value) => {
    setAccess(a => ({ ...a, [role]: { ...a[role], [tab]: value } }));
  };
  
  const handleSave = async () => {
    try {
      console.log('[DEBUG][AccessRulesModal] Зберігаємо правила доступу:', JSON.stringify(access, null, 2));
      const success = await accessRulesAPI.save(access);
      if (success) {
        console.log('[DEBUG][AccessRulesModal] Правила доступу успішно збережено');
        onClose();
      } else {
        console.error('[DEBUG][AccessRulesModal] Помилка збереження правил доступу');
        alert('Помилка збереження правил доступу');
      }
    } catch (error) {
      console.error('[DEBUG][AccessRulesModal] Помилка збереження правил доступу:', error);
      alert('Помилка збереження правил доступу: ' + error.message);
    }
  };
  
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
          <button onClick={handleSave} style={{flex:1,background:'#00bfff',color:'#fff',padding:'12px 0',fontWeight:600}}>Зберегти</button>
          <button onClick={onClose} style={{flex:1,background:'#888',color:'#fff',padding:'12px 0'}}>Скасувати</button>
        </div>
      </div>
    </div>
  );
}

function AdminSystemParamsArea({ user }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({ login: '', password: '', role: 'service', name: '', region: '' });
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
    return onlineUsers.has(userLogin);
  };

  // Функція для оновлення статусу активності користувача
  const updateUserActivity = (userLogin) => {
    const now = Date.now();
    localStorage.setItem(`user_activity_${userLogin}`, now.toString());
  };

  // Функція для перевірки чи користувач активний (онлайн)
  const checkUserActivity = (userLogin) => {
    const lastActivity = localStorage.getItem(`user_activity_${userLogin}`);
    if (!lastActivity) return false;
    
    const lastActivityTime = parseInt(lastActivity);
    const now = Date.now();
    const timeDiff = now - lastActivityTime;
    
    // Користувач вважається онлайн, якщо активний протягом останніх 2 хвилин
    return timeDiff < 2 * 60 * 1000;
  };

  // Функція для отримання списку активних користувачів
  const getActiveUsers = () => {
    const activeUsers = new Set();
    users.forEach(user => {
      if (checkUserActivity(user.login)) {
        activeUsers.add(user.login);
      }
    });
    return activeUsers;
  };

  // Відстеження активності поточного користувача
  useEffect(() => {
    if (!user?.login) return;

    // Оновлюємо активність поточного користувача кожні 30 секунд
    const activityInterval = setInterval(() => {
      updateUserActivity(user.login);
    }, 30000);

    // Початкове оновлення активності
    updateUserActivity(user.login);

    return () => clearInterval(activityInterval);
  }, [user?.login]);

  // Оновлення списку онлайн користувачів
  useEffect(() => {
    const updateOnlineUsers = () => {
      const activeUsers = getActiveUsers();
      setOnlineUsers(activeUsers);
    };

    // Оновлюємо список кожні 30 секунд
    const interval = setInterval(updateOnlineUsers, 30000);
    
    // Початкове оновлення
    updateOnlineUsers();

    return () => clearInterval(interval);
  }, [users]);

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
          region: regions[0]?.name || ''
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
            { key: 'accountant', label: 'Бухгалтер' },
            { key: 'regional', label: 'Регіональний керівник' },
            { key: 'admin', label: 'Адміністратор' },
            { key: 'reports', label: 'Звіти' },
            { key: 'materials', label: 'Аналіз ціни матеріалів' },
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
      region: user.region
    });
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
        setForm({ login: '', password: '', role: rolesList[0]?.value || '', name: '', region: regions[0]?.name || '' });
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
        {editMode && <button type="button" onClick={() => { setEditMode(false); setEditUser(null); setForm({ login: '', password: '', role: rolesList[0]?.value || '', name: '', region: regions[0]?.name || '' }); }} style={{flex:'1 1 100px', minWidth:100, background:'#f66', color:'#fff', border:'none', borderRadius:4, padding:'4px 12px', cursor:'pointer'}}>Скасувати</button>}
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
            <th>Роль</th>
            <th>ПІБ</th>
            <th>Регіон</th>
            <th>Статус</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.login}</td>
              <td>{rolesList.find(r => r.value === u.role)?.label || u.role}</td>
              <td>{u.name}</td>
              <td>{u.region}</td>
              <td>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: isUserOnline(u.login) ? '#4CAF50' : '#f44336',
                  display: 'inline-block',
                  marginRight: 8
                }}></div>
                <span style={{fontSize: '12px'}}>
                  {isUserOnline(u.login) ? 'Онлайн' : 'Офлайн'}
                </span>
              </td>
              <td>
                <button onClick={() => handleEdit(u)} style={{background:'#4CAF50', color:'#fff', border:'none', borderRadius:4, padding:'4px 12px', cursor:'pointer', marginRight:8}}>Редагувати</button>
                <button onClick={() => handleDelete(u.id)} style={{background:'#f66', color:'#fff', border:'none', borderRadius:4, padding:'4px 12px', cursor:'pointer'}}>Видалити</button>
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

function ServiceArea({ user }) {
  const region = user?.region || '';
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
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
  const [editTask, setEditTask] = useState(null);
  const [tab, setTab] = useState('notDone');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

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

  // Кешуємо колонки за допомогою useMemo
  const columns = useMemo(() => allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: true
  })), []);

  useEffect(() => {
    setLoading(true);
    tasksAPI.getAll().then(setTasks).finally(() => setLoading(false));
  }, []);

  // useEffect для перевірки та показу нагадування
  useEffect(() => {
    if (!loading && tasks.length > 0 && tab === 'notDone') {
      // Перевіряємо, чи є заявки зі статусом "Заявка"
      const requestTasks = tasks.filter(task => task.status === 'Заявка');
      
      if (requestTasks.length > 0) {
        setReminderModalOpen(true);
      }
    }
  }, [loading, tasks, tab]);

  const handleSave = async (task) => {
    console.log('[DEBUG] handleSave called with task:', task);
    console.log('[DEBUG] handleSave - editTask:', editTask);
    
    setLoading(true);
    if (editTask && editTask.id) {
      console.log('[DEBUG] handleSave - оновлюємо існуючу заявку з ID:', editTask.id);
      const updated = await tasksAPI.update(editTask.id, task);
      console.log('[DEBUG] handleSave - отримано оновлену заявку:', updated);
      
      setTasks(tasks => {
        console.log('[DEBUG] handleSave - поточні заявки:', tasks.length);
        const newTasks = tasks.map(t => t.id === editTask.id ? updated : t);
        console.log('[DEBUG] handleSave - оновлені заявки:', newTasks.length);
        return newTasks;
      });
    } else {
      console.log('[DEBUG] handleSave - додаємо нову заявку');
      const added = await tasksAPI.add(task);
      console.log('[DEBUG] handleSave - отримано нову заявку:', added);
      setTasks(tasks => [...tasks, added]);
    }
    setEditTask(null);
    setLoading(false);
    
    // Оновлюємо дані з бази після збереження
    try {
      const freshTasks = await tasksAPI.getAll();
      setTasks(freshTasks);
      console.log('[DEBUG] handleSave - дані оновлено з бази, завдань:', freshTasks.length);
      
      // Оновлюємо editTask, якщо він ще встановлений
      if (editTask && editTask.id) {
        const updatedTask = freshTasks.find(t => t.id === editTask.id);
        if (updatedTask) {
          setEditTask(updatedTask);
        }
      }
    } catch (error) {
      console.error('[ERROR] handleSave - помилка оновлення даних з бази:', error);
    }
    
    if (task.status === 'Новий' || task.status === 'В роботі') setTab('notDone');
    else if (task.status === 'Виконано' && (!task.approvedByWarehouse || !task.approvedByAccountant || !task.approvedByRegionalManager)) setTab('pending');
    else if (task.status === 'Виконано' && task.approvedByWarehouse && task.approvedByAccountant && task.approvedByRegionalManager) setTab('done');
    else if (task.status === 'Заблоковано') setTab('blocked');
  };
  const handleEdit = t => {
    const isReadOnly = t._readOnly;
    const taskData = { ...t };
    delete taskData._readOnly; // Видаляємо прапорець з даних завдання
    
    setEditTask(taskData);
    setModalOpen(true);
    // Передаємо readOnly в ModalTaskForm
    if (isReadOnly) {
      // Встановлюємо прапорець для ModalTaskForm
      setEditTask(prev => ({ ...prev, _readOnly: true }));
    }
  };
  const handleStatus = async (id, status) => {
    setLoading(true);
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
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    setLoading(false);
  };
  const handleDelete = async (id) => {
    setLoading(true);
    await tasksAPI.remove(id);
    setTasks(tasks => tasks.filter(t => t.id !== id));
    setLoading(false);
  };
  const handleFilter = e => {
    console.log('[DEBUG] handleFilter called:', e.target.name, e.target.value);
    console.log('[DEBUG] Current filters before update:', filters);
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    console.log('[DEBUG] New filters after update:', newFilters);
    setFilters(newFilters);
  };
  const filtered = tasks.filter(t => {
    if (user?.region && user.region !== 'Україна' && t.serviceRegion !== user.region) return false;
    for (const key in filters) {
      const value = filters[key];
      if (!value) continue;
      if (key.endsWith('From')) {
        const field = key.replace('From', '');
        if (!t[field] || t[field] < value) return false;
      } else if (key.endsWith('To')) {
        const field = key.replace('To', '');
        if (!t[field] || t[field] > value) return false;
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
        if (!t[key] || !t[key].toString().toLowerCase().includes(value.toLowerCase())) return false;
      } else if (typeof t[key] === 'string' || typeof t[key] === 'number') {
        if (!t[key]?.toString().toLowerCase().includes(value.toLowerCase())) return false;
      }
    }
    return true;
  });
  const notDone = filtered.filter(t => t.status === 'Заявка' || t.status === 'В роботі');
  const pending = filtered.filter(t => t.status === 'Виконано' && (
    isPending(t.approvedByWarehouse) ||
    isPending(t.approvedByAccountant) ||
    isPending(t.approvedByRegionalManager) ||
    isRejected(t.approvedByWarehouse) ||
    isRejected(t.approvedByAccountant) ||
    isRejected(t.approvedByRegionalManager)
  ));
  const done = filtered.filter(t => t.status === 'Виконано' && 
    isApproved(t.approvedByWarehouse) && 
    isApproved(t.approvedByAccountant) && 
    isApproved(t.approvedByRegionalManager)
  );
  const blocked = filtered.filter(t => t.status === 'Заблоковано');
  let tableData = notDone;
  if (tab === 'pending') tableData = pending;
  if (tab === 'done') tableData = done;
  if (tab === 'blocked') tableData = blocked;

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
                <span class="info-value">${task.engineer1 || ''} ${task.engineer2 ? ', ' + task.engineer2 : ''}</span>
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
      <button onClick={()=>{setEditTask(null);setModalOpen(true);}} style={{marginBottom:16}}>Додати заявку</button>
      <ModalTaskForm 
        open={modalOpen} 
        onClose={()=>{setModalOpen(false);setEditTask(null);}} 
        onSave={handleSave} 
        initialData={editTask||initialTask} 
        mode={tab === 'done' ? 'admin' : 'service'} 
        user={user}
        readOnly={editTask?._readOnly || false}
      />
      <div style={{display:'flex',gap:8,marginBottom:24,justifyContent:'flex-start'}}>
        <button onClick={()=>setTab('notDone')} style={{width:220,padding:'10px 0',background:tab==='notDone'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='notDone'?700:400,cursor:'pointer'}}>Невиконані заявки</button>
        <button onClick={()=>setTab('pending')} style={{width:220,padding:'10px 0',background:tab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='pending'?700:400,cursor:'pointer'}}>Заявка на підтвердженні</button>
        <button onClick={()=>setTab('done')} style={{width:220,padding:'10px 0',background:tab==='done'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='done'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
        <button onClick={()=>setTab('blocked')} style={{width:220,padding:'10px 0',background:tab==='blocked'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='blocked'?700:400,cursor:'pointer'}}>Заблоковані заявки</button>
      </div>
      <TaskTable
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
        isArchive={tab === 'done'}
        onHistoryClick={openClientReport}
      />
      <ServiceReminderModal
        isOpen={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
        tasks={tasks}
      />
    </div>
  );
}

function RegionalManagerArea({ tab: propTab, user }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(propTab || 'tasks');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [taskTab, setTaskTab] = useState('pending');
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
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [region, setRegion] = useState('');
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportWithDetails, setReportWithDetails] = useState(false);
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

  // Завантаження завдань з API
  useEffect(() => {
    setLoading(true);
    tasksAPI.getAll().then(setTasks).finally(() => setLoading(false));
  }, []);

  // useEffect для перевірки та показу нагадування
  useEffect(() => {
    if (!loading && tasks.length > 0 && tab === 'notDone') {
      // Перевіряємо, чи є заявки зі статусом "Заявка"
      const requestTasks = tasks.filter(task => task.status === 'Заявка');
      
      if (requestTasks.length > 0) {
        setReminderModalOpen(true);
      }
    }
  }, [loading, tasks, tab]);

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

  // --- Заглушка для handleSave, якщо немає ---
  function handleSave() {}

  // --- Функція handleEdit для редагування задачі ---
  function handleEdit(task) {
    setEditTask(task);
    setModalOpen(true);
  }

  // --- Функція handleFilter для TaskTable ---
  function handleFilter(e) {
    console.log('[DEBUG] handleFilter called:', e.target.name, e.target.value);
    console.log('[DEBUG] Current filters before update:', filters);
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    console.log('[DEBUG] New filters after update:', newFilters);
    setFilters(newFilters);
  }

  // --- Функція handleApprove для підтвердження задач ---
  async function handleApprove(id, approved, comment) {
    setLoading(true);
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    let next = {
      ...t,
      approvedByRegionalManager: approved,
      regionalManagerComment: comment !== undefined ? comment : t.regionalManagerComment
    };
    let bonusApprovalDate = t.bonusApprovalDate;
    if (
      next.status === 'Виконано' &&
      (next.approvedByWarehouse === 'Підтверджено' || next.approvedByWarehouse === true) &&
      (next.approvedByAccountant === 'Підтверджено' || next.approvedByAccountant === true) &&
      (next.approvedByRegionalManager === 'Підтверджено' || next.approvedByRegionalManager === true)
    ) {
      const d = new Date();
      bonusApprovalDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }
    const updated = await tasksAPI.update(id, {
      ...next,
      bonusApprovalDate
    });
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    setLoading(false);
  }

  // --- Аналогічно для handleApprove адміністратора ---
  const handleApproveAdmin = async (id, approved, comment) => {
    setLoading(true);
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    let next = {
      ...t,
      approvedByAccountant: approved,
      accountantComment: comment !== undefined ? comment : t.accountantComment,
      accountantComments: comment !== undefined ? comment : t.accountantComments
    };
    let bonusApprovalDate = t.bonusApprovalDate;
    if (
      next.status === 'Виконано' &&
      (next.approvedByWarehouse === 'Підтверджено' || next.approvedByWarehouse === true) &&
      (next.approvedByAccountant === 'Підтверджено' || next.approvedByAccountant === true) &&
      (next.approvedByRegionalManager === 'Підтверджено' || next.approvedByRegionalManager === true)
    ) {
      const d = new Date();
      bonusApprovalDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }
    const updated = await tasksAPI.update(id, {
      ...next,
      bonusApprovalDate
    });
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    setLoading(false);
  };

  // Add filtered tasks definition
  const filtered = tasks.filter(t => {
    // Region filtering - використовуємо user.region замість змінної region
    if (user?.region && user.region !== 'Україна' && t.serviceRegion !== user.region) return false;
    
    // Comprehensive field filtering
    for (const key in filters) {
      const value = filters[key];
      if (!value) continue;
      
      if (key.endsWith('From')) {
        const field = key.replace('From', '');
        if (!t[field] || t[field] < value) return false;
      } else if (key.endsWith('To')) {
        const field = key.replace('To', '');
        if (!t[field] || t[field] > value) return false;
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
        if (!t[key] || !t[key].toString().toLowerCase().includes(value.toLowerCase())) return false;
      } else if (typeof t[key] === 'string' || typeof t[key] === 'number') {
        if (!t[key]?.toString().toLowerCase().includes(value.toLowerCase())) return false;
      }
    }
    return true;
  });

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
    setData(prev => {
      const userData = prev[userId] || {};
      const newUserData = { ...userData, [day]: value };
      const total = days.reduce((sum, d) => sum + (isNaN(Number(newUserData[d])) ? 0 : Number(newUserData[d])), 0);
      newUserData.total = total;
      return { ...prev, [userId]: newUserData };
    });
  }

  // --- Оголошення data/setData тільки ОДНЕ! ---
  const [data, setData] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
    return getDefaultTimesheet();
  });
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    setData(saved ? JSON.parse(saved) : getDefaultTimesheet());
  }, [storageKey, filteredUsers.length]);
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, storageKey]);

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
    localStorage.setItem(`payData_${year}_${month}`, JSON.stringify(payData));
  }, [payData, year, month]);

  // --- Функція для зміни параметрів виплат ---
  const handlePayChange = (userId, field, value) => {
    setPayData(prev => {
      const userPay = prev[userId] || { salary: '', bonus: '' };
      const newUserPay = { ...userPay, [field]: value };
      return { ...prev, [userId]: newUserPay };
    });
  };

  // --- Експорт у Excel (CSV) ---
  function exportToCSV() {
    let csv = '';
    // Заголовок
    csv += ['ПІБ', ...days.map(d => `День ${d}`), 'Всього годин', 'Оклад, грн', 'Бонус, грн', 'Підсумкова виплата, грн'].join(';') + '\n';
    filteredUsers.forEach(u => {
      const row = [];
      row.push(u.name);
      days.forEach(d => row.push(data[u.id]?.[d] || ''));
      row.push(data[u.id]?.total || 0);
      const salary = Number(payData[u.id]?.salary) || 0;
      const bonus = Number(payData[u.id]?.bonus) || 0;
      const payout = summary.workHours > 0 ? Math.round((salary * (data[u.id]?.total || 0) / summary.workHours) + bonus) : 0;
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

  const handleGenerateReport = () => {
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
    
    const storageKey = `timesheetData_${reportYear}_${reportMonth}`;
    const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const summaryKey = `timesheetSummary_${reportYear}_${reportMonth}`;
    const summary = JSON.parse(localStorage.getItem(summaryKey) || '{}');
    const payData = JSON.parse(localStorage.getItem(`payData_${reportYear}_${reportMonth}`) || '{}');
    // Використовуємо завдання з API замість localStorage
    const isApproved = v => v === true || v === 'Підтверджено';
    const monthStr = String(reportMonth).padStart(2, '0');
    const yearStr = String(reportYear);
    let table = (
      <div>
        {filteredUsers.map(u => {
          const total = data[u.id]?.total || 0;
          const salary = Number(payData[u.id]?.salary) || 25000;
          const bonus = Number(payData[u.id]?.bonus) || 0;
          const overtime = Math.max(0, total - (summary.workHours || 168));
          const overtimeRate = summary.workHours > 0 ? (salary / summary.workHours) * 2 : 0;
          const overtimePay = overtime * overtimeRate;
          const basePay = Math.round(salary * Math.min(total, summary.workHours || 168) / (summary.workHours || 168));
          let engineerBonus = 0;
          let details = [];
          tasks.forEach(t => {
            if (
              t.status === 'Виконано' &&
              isApproved(t.approvedByWarehouse) &&
              isApproved(t.approvedByAccountant) &&
              isApproved(t.approvedByRegionalManager)
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
                console.log('[DEBUG] Bonus calculation:', {
                  taskId: t.id,
                  engineerName: u.name,
                  workDate: tDate,
                  bonusApprovalDate: bonusApprovalDate,
                  workMonth,
                  workYear,
                  approvalMonth,
                  approvalYear,
                  bonusMonth,
                  bonusYear,
                  currentMonth: month,
                  currentYear: year,
                  monthStr,
                  yearStr,
                  workPrice: t.workPrice,
                  engineer1: t.engineer1,
                  engineer2: t.engineer2,
                  status: t.status,
                  approvedByWarehouse: t.approvedByWarehouse,
                  approvedByAccountant: t.approvedByAccountant,
                  approvedByRegionalManager: t.approvedByRegionalManager
                });
                if (bonusMonth === month && bonusYear === year) {
                  const workPrice = parseFloat(t.workPrice) || 0;
                  const bonusVal = workPrice * 0.25;
                  let addBonus = 0;
                  // Діагностика імен
                  const engineer1 = (t.engineer1 || '').trim();
                  const engineer2 = (t.engineer2 || '').trim();
                  const userName = (u.name || '').trim();
                  const hasEngineer2 = !!engineer2;
                  if (engineer1 === userName && hasEngineer2) {
                    addBonus = bonusVal / 2;
                    console.log('[PREMIUM][OK] Інженер1 з інженером2:', {taskId: t.id, engineer1, engineer2, userName, workPrice, bonusVal, addBonus});
                  } else if (engineer2 === userName && engineer1) {
                    addBonus = bonusVal / 2;
                    console.log('[PREMIUM][OK] Інженер2 з інженером1:', {taskId: t.id, engineer1, engineer2, userName, workPrice, bonusVal, addBonus});
                  } else if (engineer1 === userName && !hasEngineer2) {
                    addBonus = bonusVal;
                    console.log('[PREMIUM][OK] Тільки інженер1:', {taskId: t.id, engineer1, engineer2, userName, workPrice, bonusVal, addBonus});
                  } else {
                    console.log('[PREMIUM][NO BONUS] Не співпадає інженер:', {taskId: t.id, engineer1, engineer2, userName, workPrice, bonusVal});
                  }
                  if (addBonus > 0) {
                    engineerBonus += addBonus;
                    if (reportWithDetails) {
                      details.push({
                        date: bonusApprovalDate, // Показуємо дату затвердження премії
                        client: t.client,
                        address: t.address,
                        invoice: t.invoice,
                        paymentType: t.paymentType,
                        serviceTotal: t.serviceTotal,
                        equipment: t.equipment,
                        equipmentSerial: t.equipmentSerial,
                        bonus: addBonus,
                      });
                    }
                  }
                } else {
                  // Діагностика чому не співпав місяць/рік
                  console.log('[PREMIUM][NO BONUS] Місяць/рік не співпав:', {
                    taskId: t.id,
                    bonusMonth, month, bonusYear, year,
                    tDate, bonusApprovalDate: t.bonusApprovalDate
                  });
                }
              }
            }
          });
          const payout = basePay + overtimePay + bonus + engineerBonus;
          return (
            <div key={u.id} style={{background:'#f8fafc',border:'2px solid #1976d2',borderRadius:12,margin:'24px 0',padding:'18px 18px 8px 18px',boxShadow:'0 2px 12px #0001'}}>
              <div style={{fontWeight:700,fontSize:20,marginBottom:8,color:'#1976d2',letterSpacing:1}}>{u.name}</div>
              <table style={{width:'100%', color:'#222', background:'#fff', borderRadius:8, overflow:'hidden', fontSize:'1rem', marginBottom:details.length>0?16:0}}>
                <thead>
                  <tr style={{background:'#ffe600', color:'#222', fontWeight:700}}>
                    <th>Ставка</th>
                    <th>Фактично відпрацьовано годин</th>
                    <th>Понаднормові роботи, год</th>
                    <th>Ціна за год, понаднормові</th>
                    <th>Доплата за понаднормові</th>
                    <th>Відпрацьована ставка, грн</th>
                    <th>Премія за виконання сервісних робіт, грн</th>
                    <th>Загальна сума по оплаті за місяць</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{background:'#e3f2fd',fontWeight:600}}>
                    <td>{salary}</td>
                    <td>{total}</td>
                    <td>{overtime}</td>
                    <td>{overtimeRate.toFixed(2)}</td>
                    <td>{overtimePay.toFixed(2)}</td>
                    <td>{basePay}</td>
                    <td style={{background:'#ffe066'}}>{engineerBonus.toFixed(2)}</td>
                    <td style={{background:'#b6ffb6'}}>{payout}</td>
                  </tr>
                </tbody>
              </table>
              {reportWithDetails && details.length > 0 && (
                <div style={{background:'#f1f8e9',borderRadius:8,padding:'8px 8px 8px 8px',marginTop:0}}>
                  <div style={{fontWeight:600,marginBottom:4,color:'#222'}}>Виконані роботи з премією:</div>
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
          th, td { border: 1px solid #bbb; padding: 6px 10px; text-align: center; }
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
    console.log('[DEBUG][REPORT] month:', month, 'year:', year);
    console.log('[DEBUG][REPORT] filteredUsers:', filteredUsers);
    console.log('[DEBUG][REPORT] data:', data);
    console.log('[DEBUG][REPORT] payData:', payData);
    console.log('[DEBUG][REPORT] summary:', summary);
    console.log('[DEBUG][REPORT] tasks:', tasks);
    // Додаю детальний вивід задач для діагностики
    console.log('[DEBUG][REPORT][ALL TASKS]', JSON.stringify(tasks, null, 2));
    // Додатковий лог по bonusApprovalDate
    tasks.forEach((t, i) => {
      if (!t.bonusApprovalDate) {
        console.warn(`[WARN][REPORT] Task #${i} (id=${t.id}) has no bonusApprovalDate`, t);
      } else if (!/^[\d]{2}-[\d]{4}$/.test(t.bonusApprovalDate)) {
        console.error(`[ERROR][REPORT] Task #${i} (id=${t.id}) has invalid bonusApprovalDate format:`, t.bonusApprovalDate, t);
      }
    });
    const monthName = months[month - 1];
    const reportTitle = `Звіт по табелю часу та виконаних робіт за ${monthName} ${year}`;
    
    // Логіка групування по регіонам для звіту
    const allRegions = Array.from(new Set(filteredUsers.map(u => u.region || 'Без регіону')));
    const showRegions = user?.region === 'Україна' ? allRegions : [user?.region || 'Без регіону'];
    
    // Генеруємо звіт з групуванням по регіонам
    const generateRegionReport = (region) => {
      const regionUsers = filteredUsers.filter(u => (u.region || 'Без регіону') === region);
      
      // Формування таблиці нарахувань для регіону
      const accrualTable = `
        <h4>Таблиця нарахування по персоналу - Регіон: ${region}</h4>
        <table>
          <thead>
            <tr>
              <th>ПІБ</th>
              <th>Ставка</th>
              <th>Фактично відпрацьовано годин</th>
              <th>Понаднормові роботи, год</th>
              <th>Ціна за год, понаднормові</th>
              <th>Доплата за понаднормові</th>
              <th>Відпрацьована ставка, грн</th>
              <th>Премія за виконання сервісних робіт, грн</th>
              <th>Загальна сума по оплаті за місяць</th>
            </tr>
          </thead>
          <tbody>
            ${regionUsers.map(u => {
              const total = data[u.id]?.total || 0;
              const salary = Number(payData[u.id]?.salary) || 25000;
              const bonus = Number(payData[u.id]?.bonus) || 0;
              const overtime = Math.max(0, total - summary.workHours);
              const overtimeRate = summary.workHours > 0 ? (salary / summary.workHours) * 2 : 0;
              const overtimePay = overtime * overtimeRate;
              const basePay = Math.round(salary * Math.min(total, summary.workHours) / summary.workHours);
              const tasksForMonth = tasks.filter(t => {
                if (
                  t.status !== 'Виконано' ||
                  !t.date ||
                  !t.bonusApprovalDate ||
                  !isApproved(t.approvedByWarehouse) ||
                  !isApproved(t.approvedByAccountant) ||
                  !isApproved(t.approvedByRegionalManager)
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
                return bonusMonth === month && bonusYear === year;
              });
              let engineerBonus = 0;
              tasksForMonth.forEach(t => {
                const workPrice = parseFloat(t.workPrice) || 0;
                const bonusVal = workPrice * 0.25;
                if (t.engineer1 === u.name && t.engineer2) {
                  engineerBonus += bonusVal / 2;
                } else if (t.engineer2 === u.name && t.engineer1) {
                  engineerBonus += bonusVal / 2;
                } else if (t.engineer1 === u.name && !t.engineer2) {
                  engineerBonus += bonusVal;
                }
              });
              const payout = basePay + overtimePay + bonus + engineerBonus;
              return `
                <tr>
                  <td>${u.name}</td>
                  <td>${salary}</td>
                  <td>${total}</td>
                  <td>${overtime}</td>
                  <td>${overtimeRate.toFixed(2)}</td>
                  <td>${overtimePay.toFixed(2)}</td>
                  <td>${basePay}</td>
                  <td>${engineerBonus.toFixed(2)}</td>
                  <td>${payout}</td>
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
            ${regionUsers.map(u => `
              <tr>
                <td>${u.name}</td>
                ${days.map(d => {
                  const date = new Date(year, month - 1, d);
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  return `<td${isWeekend ? ' class=\"weekend\"' : ''}>${data[u.id]?.[d] || 0}</td>`;
                }).join('')}
                <td>${data[u.id]?.total || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      
      // Формування таблиці виконаних робіт для регіону
      const regionTasks = tasks.filter(t => {
        if (
          t.status !== 'Виконано' ||
          !t.date ||
          !t.bonusApprovalDate ||
          !isApproved(t.approvedByWarehouse) ||
          !isApproved(t.approvedByAccountant) ||
          !isApproved(t.approvedByRegionalManager)
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
        return bonusMonth === month && bonusYear === year;
      });
      
      const workDetailsTable = `
        <h4>Деталізація виконаних робіт - Регіон: ${region}</h4>
        <table class="details">
          <thead>
            <tr>
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
              return `
                <tr>
                  <td>${t.date || ''}</td>
                  <td>${t.engineer1 || ''}${t.engineer2 ? ', ' + t.engineer2 : ''}</td>
                  <td>${t.client || ''}</td>
                  <td>${t.address || ''}</td>
                  <td>${t.equipment || ''}</td>
                  <td>${t.work || ''}</td>
                  <td>${t.company || ''}</td>
                  <td>${t.serviceTotal || ''}</td>
                  <td>${t.workPrice || ''}</td>
                  <td>${bonus ? bonus.toFixed(2) : '0.00'}</td>
                </tr>
              `;
            }).join('')}
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
          th, td { border: 1px solid #bbb; padding: 6px 10px; text-align: center; }
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
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  // Діагностика
  const regionAppDebug = user?.region || '';
  console.log('[DEBUG][APP] user.region:', regionAppDebug);
  console.log('[DEBUG][APP] tasks.map(serviceRegion):', tasks.map(t => t.serviceRegion));
  // Додаю фільтрацію як у areas/RegionalManagerArea.jsx
  const filteredAppDebug = tasks.filter(t => {
    if (
      regionAppDebug !== '' &&
      regionAppDebug !== 'Україна' &&
      (typeof t.serviceRegion !== 'string' ||
        t.serviceRegion.trim().toLowerCase() !== regionAppDebug.trim().toLowerCase())
    ) return false;
    return true;
  });
  console.log('[DEBUG][APP] filtered:', filteredAppDebug.map(t => ({id: t.id, serviceRegion: t.serviceRegion})));

  // Додаємо функцію експорту в Excel
  const exportFilteredToExcel = () => {
    console.log('[DEBUG] Starting export with filters:', exportFilters);
    console.log('[DEBUG] Total tasks:', tasks.length);
    console.log('[DEBUG] User region:', user?.region);
    
    // Логуємо всі завдання зі статусом 'Виконано'
    const completedTasks = tasks.filter(t => t.status === 'Виконано');
    console.log('[DEBUG] Completed tasks:', completedTasks.length);
    console.log('[DEBUG] Sample completed task:', completedTasks[0]);
    
    // Фільтруємо виконані заявки за діапазоном дат, регіоном та статусом затвердження
    const filteredTasks = tasks.filter(t => {
      console.log('[DEBUG] Checking task:', t.id, 'status:', t.status, 'date:', t.date, 'region:', t.serviceRegion, 'approvals:', {
        warehouse: t.approvedByWarehouse,
        accountant: t.approvedByAccountant,
        regionalManager: t.approvedByRegionalManager
      });
      
      if (t.status !== 'Виконано') {
        console.log('[DEBUG] Task', t.id, 'filtered out: status not Виконано');
        return false;
      }
      
      if (exportFilters.dateFrom && (!t.date || t.date < exportFilters.dateFrom)) {
        console.log('[DEBUG] Task', t.id, 'filtered out: date before', exportFilters.dateFrom);
        return false;
      }
      
      if (exportFilters.dateTo && (!t.date || t.date > exportFilters.dateTo)) {
        console.log('[DEBUG] Task', t.id, 'filtered out: date after', exportFilters.dateTo);
        return false;
      }
      
      // Фільтр по регіону користувача
      if (user?.region && user.region !== 'Україна' && t.serviceRegion !== user.region) {
        console.log('[DEBUG] Task', t.id, 'filtered out: user region', user.region, 'task region', t.serviceRegion);
        return false;
      }
      
      if (exportFilters.region && exportFilters.region !== 'Україна' && t.serviceRegion !== exportFilters.region) {
        console.log('[DEBUG] Task', t.id, 'filtered out: filter region', exportFilters.region, 'task region', t.serviceRegion);
        return false;
      }
      
      // Фільтр по статусу затвердження
      if (exportFilters.approvalFilter === 'approved') {
        // Для затверджених - всі повинні бути затверджені
        if (!isApproved(t.approvedByWarehouse) || !isApproved(t.approvedByAccountant) || !isApproved(t.approvedByRegionalManager)) {
          console.log('[DEBUG] Task', t.id, 'filtered out: not approved by all managers');
          return false;
        }
      } else if (exportFilters.approvalFilter === 'not_approved') {
        // Для незатверджених - хоча б один не затвердив
        if (isApproved(t.approvedByWarehouse) && isApproved(t.approvedByAccountant) && isApproved(t.approvedByRegionalManager)) {
          console.log('[DEBUG] Task', t.id, 'filtered out: approved by all managers');
          return false;
        }
        console.log('[DEBUG] Task', t.id, 'included: not approved by at least one manager', {
          warehouse: t.approvedByWarehouse,
          accountant: t.approvedByAccountant,
          regionalManager: t.approvedByRegionalManager
        });
      }
      // Якщо approvalFilter === 'all', то показуємо всі
      
      console.log('[DEBUG] Task', t.id, 'passed all filters');
      return true;
    });

    console.log('[DEBUG] Filtered tasks for export:', filteredTasks.length, filteredTasks);
    
    // Додаткова перевірка - логуємо всі завдання зі статусом 'Виконано' та їх статус затвердження
    const completedTasksWithApproval = tasks.filter(t => t.status === 'Виконано').map(t => ({
      id: t.id,
      approvedByWarehouse: t.approvedByWarehouse,
      approvedByAccountant: t.approvedByAccountant,
      approvedByRegionalManager: t.approvedByRegionalManager,
      isWarehouseApproved: isApproved(t.approvedByWarehouse),
      isAccountantApproved: isApproved(t.approvedByAccountant),
      isRegionalManagerApproved: isApproved(t.approvedByRegionalManager),
      isAllApproved: isApproved(t.approvedByWarehouse) && isApproved(t.approvedByAccountant) && isApproved(t.approvedByRegionalManager)
    }));
    console.log('[DEBUG] All completed tasks with approval status:', completedTasksWithApproval);

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
      console.log('[DEBUG] Processing task for export:', task.id, task);
      return columnMapping.map(col => {
        if (col.field === 'engineer1') {
          // Об'єднуємо інженерів
          const engineer1 = task.engineer1 || '';
          const engineer2 = task.engineer2 || '';
          const result = engineer2 ? `${engineer1}, ${engineer2}` : engineer1;
          console.log(`[DEBUG] Field ${col.field} (engineers):`, result);
          return result;
        } else if (col.field === '') {
          return ''; // Порожні поля
        } else {
          const value = task[col.field];
          console.log(`[DEBUG] Field ${col.field}:`, value);
          return value || '';
        }
      });
    });

    console.log('[DEBUG] Export data:', data);
    if (data.length > 0) {
      console.log('[DEBUG] First row data:', data[0]);
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
  const showRegions = user?.region === 'Україна' ? allRegions : [user?.region || 'Без регіону'];

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
              <button onClick={()=>setTaskTab('pending')} style={{width:220,padding:'10px 0',background:taskTab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:taskTab==='pending'?700:400,cursor:'pointer'}}>Заявка на підтвердженні</button>
              <button onClick={()=>setTaskTab('archive')} style={{width:220,padding:'10px 0',background:taskTab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:taskTab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
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
            <TaskTable
              tasks={taskTab === 'pending' ? filtered.filter(t => t.status === 'Виконано' && isPending(t.approvedByRegionalManager)) : filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByRegionalManager))}
                allTasks={tasks}
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
              />
        </>
      )}
      {tab === 'report' && (
        <>
          <h3>Табель персоналу</h3>
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
                          <tr key={u.id}>
                            <td style={{background:'#ffe600', color:'#222', fontWeight:600}}>{idx+1}</td>
                            <td style={{width:160, minWidth:120, maxWidth:220}}>{u.name}</td>
                            {days.map(d => {
                              const date = new Date(year, month - 1, d);
                              const dayOfWeek = date.getDay();
                              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                              return (
                                <td key={d} style={{width:28, minWidth:24, background: isWeekend ? '#ff4d4d' : undefined}}>
                                  <input type="number" value={data[u.id]?.[d] || ''} onChange={e => handleChange(u.id, d, e.target.value)} style={{width:'100%'}} />
                                </td>
                              );
                            })}
                            <td style={{width:80, minWidth:60, background:'#b6ffb6', color:'#222', fontWeight:600}}>{data[u.id]?.total || 0}</td>
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
                          <th>Фактично відпрацьовано годин</th>
                          <th>Понаднормові роботи, год</th>
                          <th>Ціна за год, понаднормові</th>
                          <th>Доплата за понаднормові</th>
                          <th>Відпрацьована ставка, грн</th>
                          <th>Премія за виконання сервісних робіт, грн</th>
                          <th>Загальна сума по оплаті за місяць</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.filter(u => (u.region || 'Без регіону') === region).map(u => {
                          const total = data[u.id]?.total || 0;
                          const salary = Number(payData[u.id]?.salary) || 25000;
                          const bonus = Number(payData[u.id]?.bonus) || 0;
                          const overtime = Math.max(0, total - summary.workHours);
                          const overtimeRate = summary.workHours > 0 ? (salary / summary.workHours) * 2 : 0;
                          const overtimePay = overtime * overtimeRate;
                          const basePay = Math.round(salary * Math.min(total, summary.workHours) / summary.workHours);
                            // Використовуємо завдання з API замість localStorage
                          const isApproved = v => v === true || v === 'Підтверджено';
                          const engineerName = u.name;
                          const monthStr = String(month).padStart(2, '0');
                          const yearStr = String(year);
                          let engineerBonus = 0;
                          tasks.forEach(t => {
                            if (
                              t.status === 'Виконано' &&
                              isApproved(t.approvedByWarehouse) &&
                              isApproved(t.approvedByAccountant) &&
                              isApproved(t.approvedByRegionalManager)
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
                                  if (t.engineer1 === engineerName && t.engineer2) {
                                    engineerBonus += bonus / 2;
                                  } else if (t.engineer2 === engineerName && t.engineer1) {
                                    engineerBonus += bonus / 2;
                                  } else if (t.engineer1 === engineerName && !t.engineer2) {
                                    engineerBonus += bonus;
                                  }
                                }
                              }
                            }
                          });
                          const payout = basePay + overtimePay + bonus + engineerBonus;
                          return (
                            <tr key={u.id}>
                              <td>{u.name}</td>
                              <td><input type="number" value={payData[u.id]?.salary || 25000} onChange={e => handlePayChange(u.id, 'salary', e.target.value)} style={{width:90}} /></td>
                              <td>{total}</td>
                              <td>{overtime}</td>
                              <td>{overtimeRate.toFixed(2)}</td>
                              <td>{overtimePay.toFixed(2)}</td>
                              <td>{basePay}</td>
                              <td style={{fontWeight:600, background:'#ffe066'}}>{engineerBonus.toFixed(2)}</td>
                              <td style={{fontWeight:700, background:'#b6ffb6'}}>{payout}</td>
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
  operator: OperatorArea,
  warehouse: WarehouseArea,
  accountant: (props) => <AccountantArea {...props} />,
  regional: (props) => <RegionalManagerArea {...props} />,
  reports: (props) => <ReportBuilder {...props} />,
  materials: (props) => <MaterialsAnalysisArea {...props} />,
};

// Окремий об'єкт для адміністратора
const areaByRole = {
  admin: (props) => <AdminArea {...props} />,
};

function App() {
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
    const loadAccessRules = async () => {
      setLoadingAccessRules(true);
      try {
        // Спочатку завантажуємо ролі
        const rolesData = await rolesAPI.getAll();
        
        // Потім завантажуємо правила доступу
        const serverRules = await accessRulesAPI.getAll();
        console.log('[DEBUG][App] Завантажені правила доступу з сервера:', JSON.stringify(serverRules, null, 2));
        
        if (Object.keys(serverRules).length === 0) {
          // Якщо на сервері немає правил, створюємо за замовчуванням
          const defaultRules = getDefaultAccess(rolesData);
          console.log('[DEBUG][App] Створюємо правила за замовчуванням:', JSON.stringify(defaultRules, null, 2));
          await accessRulesAPI.save(defaultRules);
          setAccessRules(defaultRules);
        } else {
          // Оновлюємо існуючі правила, додаючи нову вкладку materials
          const updatedRules = updateExistingRules(serverRules);
          if (JSON.stringify(updatedRules) !== JSON.stringify(serverRules)) {
            console.log('[DEBUG][App] Оновлюємо правила доступу з новою вкладкою materials');
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
          { value: 'accountant', label: 'Бухгалтер' },
          { value: 'regional', label: 'Регіональний керівник' },
        ];
        setAccessRules(getDefaultAccess(defaultRoles));
      } finally {
        setLoadingAccessRules(false);
      }
    };
    
    
    loadAccessRules();
  }, []);

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
    });
    
    return updatedRules;
  };

  console.log('user:', user, 'currentArea:', currentArea);

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
      console.log('Користувач увійшов, запуск KeepAlive сервісу...');
      keepAliveService.start();
      
      // Обробка подій видимості сторінки
      const handleVisibilityChange = () => {
        if (document.hidden) {
          console.log('Сторінка прихована, зупинка KeepAlive...');
          keepAliveService.stop();
        } else {
          console.log('Сторінка видима, запуск KeepAlive...');
          keepAliveService.start();
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Зупинка KeepAlive при виході з додатку
      return () => {
        console.log('Користувач вийшов, зупинка KeepAlive сервісу...');
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
  
  console.log('[DEBUG][App] User role:', user.role);
  console.log('[DEBUG][App] Current area:', currentArea);
  console.log('[DEBUG][App] Access rules for user role:', accessRules[user.role]);
  console.log('[DEBUG][App] Has access to current area:', hasAccessToCurrentArea);

  // Якщо користувач не має доступу до поточної вкладки, перенаправляємо на першу доступну
  if (!hasAccessToCurrentArea) {
    console.log('[DEBUG][App] User does not have access to current area, redirecting...');
    const availableAreas = Object.keys(accessRules[user.role] || {}).filter(area => 
      accessRules[user.role][area] && accessRules[user.role][area] !== 'none'
    );
    
    if (availableAreas.length > 0) {
      console.log('[DEBUG][App] Available areas:', availableAreas);
      setCurrentArea(availableAreas[0]);
      return null; // Повертаємо null щоб уникнути рендерингу
    }
  }

  // Функція для обробки вибору вкладки з перевіркою прав
  const handleAreaSelect = (area) => {
    console.log('[DEBUG][App] Attempting to select area:', area);
    console.log('[DEBUG][App] User role:', user.role);
    console.log('[DEBUG][App] Access rules for user role:', accessRules[user.role]);
    
    const hasAccess = accessRules[user.role] && 
      accessRules[user.role][area] && 
      accessRules[user.role][area] !== 'none';
    
    console.log('[DEBUG][App] Has access to area:', area, ':', hasAccess);
    
    if (hasAccess) {
      setCurrentArea(area);
    } else {
      console.log('[DEBUG][App] Access denied to area:', area);
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
          background: '#f5f5f5'
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
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar role={user.role} onSelect={handleAreaSelect} current={currentArea} accessRules={accessRules} />
        <div style={{ flex: 1 }}>
          <h1 style={{marginLeft:24}}>{t('company_name')}</h1>
          {(user.role === 'regional' || (user.role === 'admin' && currentArea === 'regional')) && false /* <RegionalManagerTabs tab={regionalTab} setTab={setRegionalTab} /> */}
          <div style={{marginLeft:0,marginRight:'6%'}}>
            <Area key={`${user.login}-${currentArea}`} user={user} />
          </div>
        </div>
      </div>
    </>
  )
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
        console.log('[DEBUG][PersonnelTimesheet] usersData from API:', usersData);
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

  // --- Автоматичне заповнення: робочі дні = 8, вихідні = 0 ---
  function getDefaultTimesheet() {
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

  const [data, setData] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
    return getDefaultTimesheet();
  });
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    setData(saved ? JSON.parse(saved) : getDefaultTimesheet());
  }, [storageKey, serviceUsers.length]);
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, storageKey]);

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
    localStorage.setItem(`payData_${year}_${month}`, JSON.stringify(payData));
  }, [payData, year, month]);

  // --- Функція для зміни параметрів виплат ---
  const handlePayChange = (userId, field, value) => {
    setPayData(prev => {
      const userPay = prev[userId] || { salary: '', bonus: '' };
      const newUserPay = { ...userPay, [field]: value };
      return { ...prev, [userId]: newUserPay };
    });
  };

  // --- Експорт у Excel (CSV) ---
  function exportToCSV() {
    let csv = '';
    // Заголовок
    csv += ['ПІБ', ...days.map(d => `День ${d}`), 'Всього годин', 'Оклад, грн', 'Бонус, грн', 'Підсумкова виплата, грн'].join(';') + '\n';
    filteredUsers.forEach(u => {
      const row = [];
      row.push(u.name);
      days.forEach(d => row.push(data[u.id]?.[d] || ''));
      row.push(data[u.id]?.total || 0);
      const salary = Number(payData[u.id]?.salary) || 0;
      const bonus = Number(payData[u.id]?.bonus) || 0;
      const payout = summary.workHours > 0 ? Math.round((salary * (data[u.id]?.total || 0) / summary.workHours) + bonus) : 0;
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
                <tr key={u.id}>
                  <td style={{width:160, minWidth:120, maxWidth:220}}>{u.name}</td>
                  {days.map(d => {
                    const date = new Date(year, month - 1, d);
                    const dayOfWeek = date.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    return (
                      <td key={d} style={{width:28, minWidth:24, background: isWeekend ? '#ff4d4d' : undefined}}>
                        <input type="number" value={data[u.id]?.[d] || ''} onChange={e => handleChange(u.id, d, e.target.value)} style={{width:'100%'}} />
                      </td>
                    );
                  })}
                  <td style={{width:80, minWidth:60}}>{data[u.id]?.total || 0}</td>
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
                const total = data[u.id]?.total || 0;
                const salary = Number(payData[u.id]?.salary) || 0;
                const bonus = Number(payData[u.id]?.bonus) || 0;
                // Пропорційна виплата
                const payout = summary.workHours > 0 ? Math.round((salary * total / summary.workHours) + bonus) : 0;
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{total}</td>
                    <td><input type="number" value={payData[u.id]?.salary || ''} onChange={e => handlePayChange(u.id, 'salary', e.target.value)} style={{width:90}} /></td>
                    <td><input type="number" value={payData[u.id]?.bonus || ''} onChange={e => handlePayChange(u.id, 'bonus', e.target.value)} style={{width:90}} /></td>
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
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    requestDesc: '', serviceRegion: '', address: '', equipmentSerial: '', equipment: '', work: '', date: ''
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [tab, setTab] = useState(() => {
    const savedTab = localStorage.getItem('adminEditTab');
    return savedTab || 'pending';
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
    tasksAPI.getAll().then(setTasks).finally(() => setLoading(false));
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
      (t.approvedByRegionalManager === 'Підтверджено' || t.approvedByRegionalManager === true)
    ) {
      const d = new Date();
      bonusApprovalDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }
    
    const updated = await tasksAPI.update(id, {
        ...t, 
        approvedByAccountant: approved, 
        accountantComment: comment !== undefined ? comment : t.accountantComment,
        accountantComments: comment !== undefined ? comment : t.accountantComments,
        bonusApprovalDate: bonusApprovalDate
    });
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    setLoading(false);
  };
  const handleFilter = e => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };
  const handleEdit = t => {
    const isReadOnly = t._readOnly;
    const taskData = { ...t };
    delete taskData._readOnly; // Видаляємо прапорець з даних завдання
    
    setEditTask(taskData);
    setModalOpen(true);
    // Передаємо readOnly в ModalTaskForm
    if (isReadOnly) {
      // Встановлюємо прапорець для ModalTaskForm
      setEditTask(prev => ({ ...prev, _readOnly: true }));
    }
  };
  const handleSave = async (task) => {
    console.log('[DEBUG] handleSave called with task:', task);
    console.log('[DEBUG] handleSave - editTask:', editTask);
    
    setLoading(true);
    if (editTask && editTask.id) {
      console.log('[DEBUG] handleSave - оновлюємо існуючу заявку з ID:', editTask.id);
      const updated = await tasksAPI.update(editTask.id, task);
      console.log('[DEBUG] handleSave - отримано оновлену заявку:', updated);
      
      setTasks(tasks => {
        console.log('[DEBUG] handleSave - поточні заявки:', tasks.length);
        const newTasks = tasks.map(t => t.id === editTask.id ? updated : t);
        console.log('[DEBUG] handleSave - оновлені заявки:', newTasks.length);
        return newTasks;
      });
    } else {
      console.log('[DEBUG] handleSave - додаємо нову заявку');
      const added = await tasksAPI.add(task);
      console.log('[DEBUG] handleSave - отримано нову заявку:', added);
      setTasks(tasks => [...tasks, added]);
    }
    setEditTask(null);
    setLoading(false);
    
    // Оновлюємо дані з бази після збереження
    try {
      const freshTasks = await tasksAPI.getAll();
      setTasks(freshTasks);
      console.log('[DEBUG] handleSave - дані оновлено з бази, завдань:', freshTasks.length);
      
      // Оновлюємо editTask, якщо він ще встановлений
      if (editTask && editTask.id) {
        const updatedTask = freshTasks.find(t => t.id === editTask.id);
        if (updatedTask) {
          setEditTask(updatedTask);
        }
      }
    } catch (error) {
      console.error('[ERROR] handleSave - помилка оновлення даних з бази:', error);
    }
    
    if (task.status === 'Новий' || task.status === 'В роботі') setTab('notDone');
    else if (task.status === 'Виконано' && (!task.approvedByWarehouse || !task.approvedByAccountant || !task.approvedByRegionalManager)) setTab('pending');
    else if (task.status === 'Виконано' && task.approvedByWarehouse && task.approvedByAccountant && task.approvedByRegionalManager) setTab('done');
    else if (task.status === 'Заблоковано') setTab('blocked');
  };
  // Функція для збереження тільки поля bonusApprovalDate
  const handleSaveBonusDate = async (taskId, newDate) => {
    console.log('[DEBUG] handleSaveBonusDate called with taskId:', taskId, 'newDate:', newDate);
    
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
      console.log('[DEBUG] handleSaveBonusDate - отримано оновлену заявку:', updated);
      
      // Оновлюємо локальний стан
      setTasks(tasks => tasks.map(t => t.id === taskId ? updated : t));
      
      console.log('[DEBUG] handleSaveBonusDate - успішно збережено');
    } catch (error) {
      console.error('[ERROR] handleSaveBonusDate - помилка збереження:', error);
    } finally {
      setLoading(false);
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
  const pending = filtered.filter(t => t.status === 'Виконано' && isPending(t.approvedByAccountant));
  const archive = filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByAccountant));
  const tableData = tab === 'pending' ? pending : archive;
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
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button onClick={()=>setTab('pending')} style={{width:220,padding:'10px 0',background:tab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='pending'?700:400,cursor:'pointer'}}>Заявка на підтвердженні</button>
        <button onClick={()=>setTab('archive')} style={{width:220,padding:'10px 0',background:tab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
      </div>
      <ModalTaskForm open={modalOpen} onClose={()=>{setModalOpen(false);setEditTask(null);}} onSave={handleSave} initialData={editTask || {}} mode="admin" user={user} readOnly={editTask?._readOnly || false} />
      <TaskTable
        tasks={tableData}
        allTasks={tasks}
        onApprove={handleApprove}
        onEdit={handleEdit}
        onSaveBonusDate={handleSaveBonusDate}
        role="admin"
        user={user}
        filters={filters}
        onFilterChange={handleFilter}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        approveField="approvedByAccountant"
        commentField="accountantComment"
        isArchive={tab === 'archive'}
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
      </div>
      {tab === 'system' && <AdminSystemParamsArea />}
      {tab === 'edit' && <AdminEditTasksArea user={user} />}
      {tab === 'backup' && <AdminBackupArea />}
      {tab === 'events' && <EventLogArea user={user} />}
    </div>
  );
}

// --- Компонент для відновлення даних ---
function AdminBackupArea() {
  const [backups, setBackups] = useState(() => {
    const saved = localStorage.getItem('backups');
    return saved ? JSON.parse(saved) : [];
  });
  const [autoInterval, setAutoInterval] = useState(() => {
    const saved = localStorage.getItem('backupInterval');
    return saved || 'day';
  });
  const [lastAutoBackup, setLastAutoBackup] = useState(() => {
    const saved = localStorage.getItem('lastAutoBackup');
    return saved ? new Date(saved) : null;
  });
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

  // --- Додаю створення бекапу ---
  const createBackup = async () => {
    try {
    const now = new Date();
      const tasksData = await tasksAPI.getAll();
    const backup = {
      id: Date.now(),
      date: now.toISOString(),
        data: JSON.stringify(tasksData) // зберігаємо дані завдань з API
    };
    let newBackups = [...backups, backup];
    if (newBackups.length > 50) newBackups = newBackups.slice(newBackups.length - 50);
    setBackups(newBackups);
    localStorage.setItem('backups', JSON.stringify(newBackups));
    setLastAutoBackup(now);
    localStorage.setItem('lastAutoBackup', now.toISOString());
    } catch (error) {
      console.error('Помилка створення бекапу:', error);
      alert('Помилка при створенні бекапу. Спробуйте ще раз.');
    }
  };

  // --- Видалення бекапу ---
  const deleteBackup = id => {
    const newBackups = backups.filter(b => b.id !== id);
    setBackups(newBackups);
    localStorage.setItem('backups', JSON.stringify(newBackups));
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
      <h3 style={{marginBottom:16,color:'#22334a'}}>Історія бекапів</h3>
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

      {/* Модальне вікно імпорту Excel */}
      <ExcelImportModal
        open={showExcelImport}
        onClose={() => setShowExcelImport(false)}
        onImport={handleExcelImport}
      />
    </div>
  );
}

export default App
