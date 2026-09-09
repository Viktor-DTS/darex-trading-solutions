import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import API_BASE_URL from '../config';
import WarehouseManagement from './equipment/WarehouseManagement';
import CategoryManagement from './equipment/CategoryManagement';
import ProductCardManagement from './equipment/ProductCardManagement';
import SystemCoefficientsSettings from './SystemCoefficientsSettings';
import OneCWorkerPanel from './onec/OneCWorkerPanel';
import TaskExportPanel from './TaskExportPanel';
import SystemHealthDashboard from './systemHealth/SystemHealthDashboard';
import { Modal, Button, Badge, EmptyState } from './ui';
import './AdminDashboard.css';
import { applyBczvsklAccessDefaults } from '../constants/bczvsklRole';

/** Ключі панелей у матриці (як у App.jsx) */
const ACCESS_PANEL_KEYS_FOR_MATRIX = [
  'service',
  'operator',
  'warehouse',
  'inventory',
  'manager',
  'marketing',
  'salesAccounting',
  'testing',
  'finance',
  'accountant',
  'accountantApproval',
  'regional',
  'reports',
  'analytics',
  'procurement',
  'tenders',
  'admin'
];

const SUPERADMIN_ACCESS_ROLES = ['admin', 'administrator'];

function buildFullAccessRulesRow() {
  const row = {};
  ACCESS_PANEL_KEYS_FOR_MATRIX.forEach((k) => {
    row[k] = 'full';
  });
  return row;
}

/** У додатку ці ролі завжди мають усі панелі; вирівнюємо БД і відображення матриці. */
function normalizeAccessRulesForSuperAdmins(rules) {
  if (!rules || typeof rules !== 'object') return rules || {};
  const out = { ...rules };
  for (const role of SUPERADMIN_ACCESS_ROLES) {
    out[role] = { ...(out[role] || {}), ...buildFullAccessRulesRow() };
  }
  return out;
}

// Вкладки адміністратора
const ADMIN_TABS = [
  { id: 'users', label: '👥 Користувачі', icon: '👥' },
  { id: 'activeUsers', label: '🟢 Активні користувачі', icon: '🟢' },
  { id: 'access', label: '🔑 Права доступу', icon: '🔑' },
  { id: 'regions', label: '🌍 Регіони', icon: '🌍' },
  { id: 'roles', label: '🎭 Ролі', icon: '🎭' },
  { id: 'telegram', label: '📱 Telegram', icon: '📱' },
  { id: 'notifications', label: '🔔 Сповіщення', icon: '🔔' },
  { id: 'advertising', label: '📢 Реклама', icon: '📢' },
  { id: 'taskExport', label: '📤 Експорт заявок', icon: '📤' },
  { id: 'backup', label: '💾 Бекап', icon: '💾' },
  { id: 'logs', label: '📜 Логи', icon: '📜' },
  { id: 'warehouses', label: '🏢 Управління складами', icon: '🏢' },
  { id: 'categories', label: '📂 Категорії номенклатури', icon: '📂' },
  { id: 'productCards', label: '📇 Карточки продуктів', icon: '📇' },
  { id: 'systemCoefficients', label: '🔢 Системні коефіцієнти', icon: '🔢' },
  { id: 'onecAgent', label: '🤖 Агент 1С', icon: '🤖' },
  { id: 'systemHealth', label: '🩺 Аналіз роботи системи', icon: '🩺' },
];

const EMPTY_USER_FORM = {
  login: '',
  password: '',
  name: '',
  role: 'service',
  region: '',
  phone: '',
  telegramChatId: '',
  dismissed: false
};

function isTelegramConnected(u) {
  const chatId = String(u?.telegramChatId || '').trim();
  return Boolean(chatId && chatId !== 'Chat ID' && /^\d+$/.test(chatId));
}

function roleLabel(roles, roleValue) {
  return roles.find((r) => r.value === roleValue)?.label || roleValue || '—';
}

function AdminDashboard({ user }) {
  const isSuperAdmin = SUPERADMIN_ACCESS_ROLES.includes(String(user?.role || '').toLowerCase());
  const visibleTabs = ADMIN_TABS.filter((tab) => !tab.superAdminOnly || isSuperAdmin);
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(false);
  
  // Дані
  const [users, setUsers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [accessRules, setAccessRules] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  
  // Форма для користувача
  const [userForm, setUserForm] = useState({ ...EMPTY_USER_FORM });
  const [editingUser, setEditingUser] = useState(null);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userFilterRegion, setUserFilterRegion] = useState('');
  const [userFilterRole, setUserFilterRole] = useState('');
  const [userFilterOnline, setUserFilterOnline] = useState(false);
  const [userFilterTelegram, setUserFilterTelegram] = useState('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const [userMenu, setUserMenu] = useState(null);
  const userMenuRef = useRef(null);
  
  // Форми для регіонів та ролей
  const [newRegion, setNewRegion] = useState('');
  const [newRole, setNewRole] = useState({ value: '', label: '' });

  // Завантаження даних
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [usersRes, regionsRes, rolesRes, accessRes] = await Promise.all([
        fetch(`${API_BASE_URL}/users?includeDismissed=true`, { headers }),
        fetch(`${API_BASE_URL}/regions`, { headers }),
        fetch(`${API_BASE_URL}/roles`, { headers }).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/accessRules`, { headers }).catch(() => ({ ok: false }))
      ]);
      
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data);
      }
      
      if (regionsRes.ok) {
        const data = await regionsRes.json();
        setRegions(data.map(r => typeof r === 'object' ? r : { name: r }));
      }
      
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        // Перетворюємо з {name} у {value, label}
        const rolesFormatted = data.map(r => ({
          value: r.name || r.value,
          label: r.name || r.label || r.value
        }));
        setRoles(rolesFormatted);
      } else {
        // Якщо не вдалося - беремо унікальні ролі з користувачів
        const uniqueRoles = [...new Set(users.map(u => u.role).filter(Boolean))];
        setRoles(uniqueRoles.map(r => ({ value: r, label: r })));
      }
      
      if (accessRes.ok) {
        const data = await accessRes.json();
        setAccessRules(applyBczvsklAccessDefaults(normalizeAccessRulesForSuperAdmins(data)));
      }
    } catch (error) {
      console.error('Помилка завантаження даних:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Перевірка онлайн статусу
  useEffect(() => {
    const checkOnlineStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/users/online`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setOnlineUsers(new Set(data));
        }
      } catch (error) {
        // Ігноруємо помилку
      }
    };
    
    checkOnlineStatus();
    const interval = setInterval(checkOnlineStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const userStats = useMemo(() => {
    const active = users.filter((u) => !u.dismissed);
    return {
      total: users.length,
      active: active.length,
      dismissed: users.length - active.length,
      online: active.filter((u) => onlineUsers.has(u.login)).length,
      noTelegram: active.filter((u) => !isTelegramConnected(u)).length
    };
  }, [users, onlineUsers]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (!showDismissed && u.dismissed) return false;
      if (userFilterRegion && (u.region || 'Без регіону') !== userFilterRegion) return false;
      if (userFilterRole && u.role !== userFilterRole) return false;
      if (userFilterOnline && !onlineUsers.has(u.login)) return false;
      if (userFilterTelegram === 'connected' && !isTelegramConnected(u)) return false;
      if (userFilterTelegram === 'missing' && isTelegramConnected(u)) return false;
      if (q) {
        const hay = [u.login, u.name, u.phone, u.role, u.region]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    users,
    userSearch,
    userFilterRegion,
    userFilterRole,
    userFilterOnline,
    userFilterTelegram,
    showDismissed,
    onlineUsers
  ]);

  const usersByRegion = useMemo(() => {
    const regionNames = [...new Set(filteredUsers.map((u) => u.region || 'Без регіону'))]
      .sort((a, b) => a.localeCompare(b, 'uk'));
    return regionNames.map((region) => ({
      region,
      users: filteredUsers
        .filter((u) => (u.region || 'Без регіону') === region)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'))
    }));
  }, [filteredUsers]);

  useEffect(() => {
    if (!userMenu) return undefined;
    const onPointerDown = (event) => {
      if (userMenuRef.current && userMenuRef.current.contains(event.target)) return;
      setUserMenu(null);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setUserMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenu]);

  // ==================== КОРИСТУВАЧІ ====================
  
  const handleUserFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUserForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveUser = async (e) => {
    e?.preventDefault?.();
    if (!userForm.login || !userForm.name || !userForm.role) {
      alert('Заповніть обов\'язкові поля: Логін, ПІБ, Роль');
      return;
    }
    if (!editingUser && !userForm.password) {
      alert('Вкажіть пароль для нового користувача');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const method = editingUser ? 'PUT' : 'POST';
      const url = editingUser
        ? `${API_BASE_URL}/users/${editingUser._id || editingUser.id}`
        : `${API_BASE_URL}/users`;

      // Лише поля форми. Не розгортаємо весь об'єкт користувача —
      // PUT робить $set і міг би затерти пароль / сповіщення / Telegram.
      const payload = {
        login: userForm.login,
        name: userForm.name,
        role: userForm.role,
        region: userForm.region || '',
        phone: userForm.phone || '',
        telegramChatId: userForm.telegramChatId || ''
      };
      if (editingUser) {
        payload.dismissed = !!userForm.dismissed;
        if (userForm.password) {
          payload.password = userForm.password;
        }
      } else {
        payload.password = userForm.password;
        payload.dismissed = false;
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const savedUser = await res.json();
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: editingUser ? 'update' : 'create',
              entityType: 'user',
              entityId: savedUser._id || savedUser.id || editingUser?._id || editingUser?.id,
              description: editingUser 
                ? `Редагування користувача ${userForm.name || userForm.login}`
                : `Створення користувача ${userForm.name || userForm.login}`,
              details: {
                login: userForm.login,
                name: userForm.name,
                role: userForm.role,
                region: userForm.region
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        loadData();
        resetUserForm();
        setUserFormOpen(false);
        alert(editingUser ? 'Користувача оновлено!' : 'Користувача додано!');
      } else {
        const err = await res.json();
        alert('Помилка: ' + (err.message || err.error));
      }
    } catch (error) {
      alert('Помилка збереження: ' + error.message);
    }
  };

  const handleEditUser = (u) => {
    setUserMenu(null);
    setEditingUser(u);
    setUserForm({
      login: u.login || '',
      password: '',
      name: u.name || '',
      role: u.role || 'service',
      region: u.region || '',
      phone: u.phone || '',
      telegramChatId: u.telegramChatId || '',
      dismissed: u.dismissed || false
    });
    setUserFormOpen(true);
  };

  const handleOpenCreateUser = () => {
    setUserMenu(null);
    resetUserForm();
    setUserFormOpen(true);
  };

  const handleCloseUserForm = () => {
    resetUserForm();
    setUserFormOpen(false);
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Видалити користувача ${u.name || u.login}?`)) return;
    setUserMenu(null);
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/users/${u._id || u.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'delete',
              entityType: 'user',
              entityId: u._id || u.id,
              description: `Видалення користувача ${u.name || u.login}`,
              details: {
                login: u.login,
                name: u.name,
                role: u.role
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        loadData();
        alert('Користувача видалено!');
      } else {
        alert('Помилка видалення');
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    }
  };

  const handleToggleDismissed = async (u) => {
    const nextDismissed = !u.dismissed;
    const actionLabel = nextDismissed ? 'Звільнити' : 'Відновити';
    if (!window.confirm(`${actionLabel} користувача ${u.name || u.login}?`)) return;
    setUserMenu(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/users/${u._id || u.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ dismissed: nextDismissed })
      });
      
      if (res.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'update',
              entityType: 'user',
              entityId: u._id || u.id,
              description: !u.dismissed 
                ? `Звільнення користувача ${u.name || u.login}`
                : `Відновлення користувача ${u.name || u.login}`,
              details: {
                field: 'dismissed',
                oldValue: u.dismissed,
                newValue: !u.dismissed
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        loadData();
      }
    } catch (error) {
      console.error('Помилка:', error);
    }
  };

  const resetUserForm = () => {
    setEditingUser(null);
    setUserForm({
      ...EMPTY_USER_FORM,
      role: roles[0]?.value || 'service',
      region: regions[0]?.name || ''
    });
  };

  // ==================== РЕГІОНИ ====================
  
  const handleAddRegion = async () => {
    if (!newRegion.trim()) return;
    if (regions.some(r => r.name === newRegion.trim())) {
      alert('Такий регіон вже існує');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const updatedRegions = [...regions, { name: newRegion.trim() }];
      
      const res = await fetch(`${API_BASE_URL}/regions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedRegions)
      });
      
      if (res.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'create',
              entityType: 'region',
              entityId: newRegion.trim(),
              description: `Додавання регіону ${newRegion.trim()}`,
              details: {
                region: newRegion.trim()
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        setRegions(updatedRegions);
        setNewRegion('');
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    }
  };

  const handleDeleteRegion = async (regionName) => {
    const usersInRegion = users.filter(u => u.region === regionName);
    if (usersInRegion.length > 0) {
      alert(`Не можна видалити - є ${usersInRegion.length} користувачів у цьому регіоні`);
      return;
    }
    
    if (!window.confirm(`Видалити регіон "${regionName}"?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const updatedRegions = regions.filter(r => r.name !== regionName);
      
      const res = await fetch(`${API_BASE_URL}/regions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedRegions)
      });
      
      if (res.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'delete',
              entityType: 'region',
              entityId: regionName,
              description: `Видалення регіону ${regionName}`,
              details: {
                region: regionName
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        setRegions(updatedRegions);
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    }
  };

  // ==================== РОЛІ ====================
  
  const handleAddRole = async () => {
    if (!newRole.value.trim()) return;
    const roleValue = newRole.value.trim();
    const roleLabel = newRole.label.trim() || roleValue;
    
    if (roles.some(r => r.value === roleValue)) {
      alert('Така роль вже існує');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const updatedRoles = [...roles, { value: roleValue, label: roleLabel }];
      
      // Зберігаємо у форматі {name} для бекенду
      const rolesToSave = updatedRoles.map(r => ({ name: r.value }));
      
      const res = await fetch(`${API_BASE_URL}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(rolesToSave)
      });
      
      if (res.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'create',
              entityType: 'role',
              entityId: roleValue,
              description: `Додавання ролі ${roleLabel} (${roleValue})`,
              details: {
                role: roleValue,
                label: roleLabel
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        setRoles(updatedRoles);
        setNewRole({ value: '', label: '' });
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    }
  };

  const handleDeleteRole = async (roleValue) => {
    const usersWithRole = users.filter(u => u.role === roleValue);
    if (usersWithRole.length > 0) {
      alert(`Не можна видалити - є ${usersWithRole.length} користувачів з цією роллю`);
      return;
    }
    
    if (!window.confirm(`Видалити роль "${roleValue}"?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const updatedRoles = roles.filter(r => r.value !== roleValue);
      
      // Зберігаємо у форматі {name} для бекенду
      const rolesToSave = updatedRoles.map(r => ({ name: r.value }));
      
      const res = await fetch(`${API_BASE_URL}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(rolesToSave)
      });
      
      if (res.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'delete',
              entityType: 'role',
              entityId: roleValue,
              description: `Видалення ролі ${roleValue}`,
              details: {
                role: roleValue
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        setRoles(updatedRoles);
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    }
  };

  // ==================== РЕНДЕРИНГ ====================

  const openUserMenu = (event, u) => {
    event.stopPropagation();
    const id = String(u._id || u.id);
    if (userMenu && String(userMenu.user._id || userMenu.user.id) === id) {
      setUserMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 220;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setUserMenu({ user: u, top: rect.bottom + 4, left });
  };

  const renderUsersTab = () => (
    <div className="users-page">
      <div className="users-page__head">
        <div>
          <h3 className="users-page__title">Користувачі</h3>
          <p className="users-page__sub">
            Показано {filteredUsers.length} з {showDismissed ? userStats.total : userStats.active}
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenCreateUser}>Додати користувача</Button>
      </div>

      <div className="users-stats">
        <button
          type="button"
          className={`users-stat ${!userFilterOnline && userFilterTelegram === 'all' && !showDismissed ? 'is-active' : ''}`}
          onClick={() => {
            setUserFilterOnline(false);
            setUserFilterTelegram('all');
            setShowDismissed(false);
          }}
        >
          <strong>{userStats.active}</strong>
          <span>Працюють</span>
        </button>
        <button
          type="button"
          className={`users-stat ${userFilterOnline ? 'is-active' : ''}`}
          onClick={() => setUserFilterOnline((v) => !v)}
        >
          <strong>{userStats.online}</strong>
          <span>Онлайн</span>
        </button>
        <button
          type="button"
          className={`users-stat ${userFilterTelegram === 'missing' ? 'is-active' : ''}`}
          onClick={() => setUserFilterTelegram((v) => (v === 'missing' ? 'all' : 'missing'))}
        >
          <strong>{userStats.noTelegram}</strong>
          <span>Без Telegram</span>
        </button>
        <button
          type="button"
          className={`users-stat ${showDismissed ? 'is-active' : ''}`}
          onClick={() => setShowDismissed((v) => !v)}
        >
          <strong>{userStats.dismissed}</strong>
          <span>Звільнені</span>
        </button>
      </div>

      <div className="users-toolbar">
        <input
          className="users-search"
          type="search"
          placeholder="Пошук за логіном, ПІБ або телефоном"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
        />
        <select
          className="users-filter"
          value={userFilterRegion}
          onChange={(e) => setUserFilterRegion(e.target.value)}
        >
          <option value="">Усі регіони</option>
          {regions.map((r) => (
            <option key={r.name} value={r.name}>{r.name}</option>
          ))}
          <option value="Без регіону">Без регіону</option>
        </select>
        <select
          className="users-filter"
          value={userFilterRole}
          onChange={(e) => setUserFilterRole(e.target.value)}
        >
          <option value="">Усі ролі</option>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <select
          className="users-filter"
          value={userFilterTelegram}
          onChange={(e) => setUserFilterTelegram(e.target.value)}
        >
          <option value="all">Telegram: усі</option>
          <option value="connected">Підключено</option>
          <option value="missing">Немає</option>
        </select>
      </div>

      <div className="users-table-wrapper users-table-wrapper--fill">
        {filteredUsers.length === 0 ? (
          <EmptyState
            title="Нікого не знайдено"
            description="Змініть пошук або фільтри. Звільнені приховані, доки не увімкнете лічильник «Звільнені»."
          />
        ) : (
          <table className="users-table users-table--readable">
            <thead>
              <tr>
                <th>Статус</th>
                <th>Користувач</th>
                <th>Роль</th>
                <th>Телефон</th>
                <th>Telegram</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {usersByRegion.map(({ region, users: regionUsers }) => (
                <React.Fragment key={region}>
                  <tr className="region-header">
                    <td colSpan="6">
                      <span className="region-name">{region}</span>
                      <span className="region-count">{regionUsers.length}</span>
                    </td>
                  </tr>
                  {regionUsers.map((u) => {
                    const uid = String(u._id || u.id);
                    const isOnline = onlineUsers.has(u.login);
                    return (
                      <tr
                        key={uid}
                        className={`${isOnline ? 'online' : ''} ${u.dismissed ? 'dismissed' : ''}`}
                      >
                        <td className="status-cell">
                          <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td>
                          <div className="user-cell">
                            <span className="user-cell__name">{u.name || '—'}</span>
                            <span className="user-cell__login">{u.login}</span>
                          </div>
                        </td>
                        <td>{roleLabel(roles, u.role)}</td>
                        <td className="users-phone">{u.phone || '—'}</td>
                        <td>
                          {isTelegramConnected(u) ? (
                            <Badge tone="success">Підключено</Badge>
                          ) : (
                            <Badge tone="neutral">Немає</Badge>
                          )}
                        </td>
                        <td className="actions-cell">
                          <button
                            type="button"
                            className="users-menu-btn"
                            aria-label={`Дії для ${u.name || u.login}`}
                            aria-expanded={userMenu && String(userMenu.user._id || userMenu.user.id) === uid}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => openUserMenu(e, u)}
                          >
                            ⋯
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const renderUserFormModal = () => (
    <Modal
      open={userFormOpen}
      onClose={handleCloseUserForm}
      title={editingUser ? 'Редагування користувача' : 'Новий користувач'}
      subtitle={editingUser ? editingUser.login : 'Обліковий запис для входу в систему'}
      size="md"
      footer={(
        <>
          <Button variant="ghost" onClick={handleCloseUserForm}>Скасувати</Button>
          <Button variant="primary" onClick={handleSaveUser}>
            {editingUser ? 'Зберегти' : 'Додати'}
          </Button>
        </>
      )}
    >
      <form className="user-form user-form--modal" onSubmit={handleSaveUser}>
        <label className="user-field">
          <span>Логін *</span>
          <input
            name="login"
            value={userForm.login}
            onChange={handleUserFormChange}
            disabled={!!editingUser}
            autoComplete="off"
          />
        </label>
        <label className="user-field">
          <span>{editingUser ? 'Новий пароль' : 'Пароль *'}</span>
          <input
            name="password"
            type="password"
            value={userForm.password}
            onChange={handleUserFormChange}
            autoComplete="new-password"
            placeholder={editingUser ? 'Залиште порожнім, щоб не змінювати' : ''}
          />
        </label>
        <label className="user-field">
          <span>ПІБ *</span>
          <input name="name" value={userForm.name} onChange={handleUserFormChange} />
        </label>
        <label className="user-field">
          <span>Роль *</span>
          <select name="role" value={userForm.role} onChange={handleUserFormChange}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
        <label className="user-field">
          <span>Регіон</span>
          <select name="region" value={userForm.region} onChange={handleUserFormChange}>
            <option value="">— Не вказано —</option>
            {regions.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="user-field">
          <span>Телефон</span>
          <input
            name="phone"
            placeholder="380XXXXXXXXX"
            value={userForm.phone}
            onChange={handleUserFormChange}
          />
        </label>
        <label className="user-field">
          <span>Telegram Chat ID</span>
          <input
            name="telegramChatId"
            value={userForm.telegramChatId}
            onChange={handleUserFormChange}
            placeholder="заповнюється після реєстрації в боті"
          />
        </label>
        {editingUser && (
          <label className="checkbox-label user-field user-field--check">
            <input
              type="checkbox"
              name="dismissed"
              checked={userForm.dismissed}
              onChange={handleUserFormChange}
            />
            Звільнений
          </label>
        )}
      </form>
    </Modal>
  );

  const renderActiveUsersTab = () => {
    // Фільтруємо тільки активних користувачів
    const activeUsersList = users.filter(u => onlineUsers.has(u.login) && !u.dismissed);
    
    return (
      <div className="admin-section">
        <div className="section-header">
          <h3>🟢 Активні користувачі</h3>
          <div className="section-info">
            <span className="info-badge">Всього активних: {activeUsersList.length}</span>
            <button className="btn-refresh" onClick={() => {
              const checkOnlineStatus = async () => {
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch(`${API_BASE_URL}/users/online`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setOnlineUsers(new Set(data));
                  }
                } catch (error) {
                  console.error('Помилка оновлення статусу:', error);
                }
              };
              checkOnlineStatus();
            }}>
              🔄 Оновити
            </button>
          </div>
        </div>

        {activeUsersList.length === 0 ? (
          <div className="empty-state">
            <p>📭 Немає активних користувачів в системі</p>
            <p className="hint">Користувачі вважаються активними, якщо вони були в системі за останні 5 хвилин</p>
          </div>
        ) : (
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Логін</th>
                  <th>ПІБ</th>
                  <th>Роль</th>
                  <th>Регіон</th>
                  <th>Telegram</th>
                  <th>Дії</th>
                </tr>
              </thead>
              <tbody>
                {activeUsersList
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'))
                  .map(u => (
                    <tr key={u._id || u.id} className="online">
                      <td className="status-cell">
                        <span className="status-badge online">🟢 Online</span>
                      </td>
                      <td>{u.login}</td>
                      <td>{u.name}</td>
                      <td>{roles.find(r => r.value === u.role)?.label || u.role}</td>
                      <td>{u.region || 'Без регіону'}</td>
                      <td>{u.telegramChatId || '-'}</td>
                      <td className="actions-cell">
                        <button className="btn-edit" onClick={() => handleEditUser(u)} title="Редагувати">✏️</button>
                        <button 
                          className={`btn-dismiss ${u.dismissed ? 'active' : ''}`}
                          onClick={() => handleToggleDismissed(u)}
                          title={u.dismissed ? 'Відновити' : 'Звільнити'}
                        >
                          {u.dismissed ? '✅' : '🚫'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderRegionsTab = () => (
    <div className="admin-section">
      <h3>🌍 Управління регіонами</h3>
      
      <div className="add-form">
        <input
          placeholder="Назва нового регіону"
          value={newRegion}
          onChange={e => setNewRegion(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleAddRegion()}
        />
        <button onClick={handleAddRegion} className="btn-add">➕ Додати</button>
      </div>

      <div className="items-grid">
        {regions.map(r => (
          <div key={r.name} className="item-card">
            <span className="item-name">{r.name}</span>
            <span className="item-count">
              {users.filter(u => u.region === r.name).length} користувачів
            </span>
            <button 
              className="btn-delete-small" 
              onClick={() => handleDeleteRegion(r.name)}
              title="Видалити"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderRolesTab = () => (
    <div className="admin-section">
      <h3>🎭 Управління ролями</h3>
      
      <div className="add-form">
        <input
          placeholder="Код ролі (англ.)"
          value={newRole.value}
          onChange={e => setNewRole({ ...newRole, value: e.target.value })}
        />
        <input
          placeholder="Назва ролі"
          value={newRole.label}
          onChange={e => setNewRole({ ...newRole, label: e.target.value })}
        />
        <button onClick={handleAddRole} className="btn-add">➕ Додати</button>
      </div>

      <div className="items-grid">
        {roles.map(r => (
          <div key={r.value} className="item-card role-card">
            <span className="item-code">{r.value}</span>
            <span className="item-name">{r.label}</span>
            <span className="item-count">
              {users.filter(u => u.role === r.value).length} користувачів
            </span>
            <button 
              className="btn-delete-small" 
              onClick={() => handleDeleteRole(r.value)}
              title="Видалити"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // Панелі системи (ключі повинні співпадати з App.jsx)
  const PANELS = [
    { key: 'service', label: 'Сервісна служба' },
    { key: 'operator', label: 'Оператор' },
    { key: 'warehouse', label: 'Зав. склад' },
    { key: 'inventory', label: 'Складський облік' },
    { key: 'manager', label: 'Менеджери' },
    { key: 'marketing', label: 'Маркетинговий віділ' },
    { key: 'salesAccounting', label: 'Відділ продаж — бухгалтерія' },
    { key: 'testing', label: 'Відділ тестування' },
    { key: 'finance', label: 'Фінансовий відділ' },
    { key: 'accountant', label: 'Бух. рахунки' },
    { key: 'accountantApproval', label: 'Бух. на Затвердженні' },
    { key: 'regional', label: 'Регіональний керівник' },
    { key: 'reports', label: 'Звіти' },
    { key: 'analytics', label: 'Аналітика' },
    { key: 'procurement', label: 'Відділ закупівель' },
    { key: 'ved', label: 'Відділ ВЕД' },
    { key: 'tenders', label: 'Тендерний відділ' },
    { key: 'admin', label: 'Адміністратор' },
  ];

  const ACCESS_LEVELS = [
    { value: 'none', label: '❌ Немає', color: '#f44336' },
    { value: 'read', label: '👁️ Перегляд', color: '#ff9800' },
    { value: 'full', label: '✅ Повний', color: '#4caf50' },
  ];

  const handleAccessChange = (role, panel, value) => {
    if (SUPERADMIN_ACCESS_ROLES.includes(role)) return;
    setAccessRules(prev => ({
      ...prev,
      [role]: {
        ...(prev[role] || {}),
        [panel]: value
      }
    }));
  };

  const handleSaveAccess = async () => {
    try {
      const token = localStorage.getItem('token');
      const payload = applyBczvsklAccessDefaults(normalizeAccessRulesForSuperAdmins(accessRules));
      const res = await fetch(`${API_BASE_URL}/accessRules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'update',
              entityType: 'accessRules',
              entityId: 'system',
              description: 'Зміна правил доступу до панелей',
              details: {
                rules: payload
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        setAccessRules(payload);
        alert('✅ Права доступу збережено!\n\nКористувачі побачать зміни після перезаходу в систему.');
      } else {
        alert('❌ Помилка збереження');
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    }
  };

  const renderAccessTab = () => (
    <div className="admin-section admin-access-section">
      <div className="access-header">
        <h3>🔑 Права доступу до панелей</h3>
        <button className="btn-save-access" onClick={handleSaveAccess}>
          💾 Зберегти зміни
        </button>
      </div>
      
      <div className="access-table-wrapper">
        <table className="access-table">
          <thead>
            <tr>
              <th>Роль</th>
              {PANELS.map(p => (
                <th key={p.key}>{p.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map(role => (
              <tr key={role.value}>
                <td className="role-cell">{role.label}</td>
                {PANELS.map(panel => {
                  const isSuper = SUPERADMIN_ACCESS_ROLES.includes(role.value);
                  const currentAccess = isSuper
                    ? 'full'
                    : accessRules[role.value]?.[panel.key] || 'none';
                  return (
                    <td key={panel.key} className="access-cell">
                      <select
                        value={currentAccess}
                        onChange={(e) => handleAccessChange(role.value, panel.key, e.target.value)}
                        className={`access-select ${currentAccess}`}
                        disabled={isSuper}
                        title={
                          isSuper
                            ? 'Ролі admin та administrator завжди мають повний доступ до всіх панелей'
                            : undefined
                        }
                      >
                        {ACCESS_LEVELS.map(level => (
                          <option key={level.value} value={level.value}>
                            {level.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="access-legend">
        <span className="legend-item">
          <span className="legend-dot none"></span> Немає доступу
        </span>
        <span className="legend-item">
          <span className="legend-dot read"></span> Тільки перегляд
        </span>
        <span className="legend-item">
          <span className="legend-dot full"></span> Повний доступ
        </span>
      </div>
    </div>
  );

  // Стан для бекапів
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [lastExport, setLastExport] = useState(null);

  const handleExportJSON = async () => {
    setExportLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Завантажуємо всі дані паралельно
      const [tasksRes, usersRes, regionsRes, rolesRes, accessRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tasks/filter?filter=all`, { headers }),
        fetch(`${API_BASE_URL}/users?includeDismissed=true`, { headers }),
        fetch(`${API_BASE_URL}/regions`, { headers }),
        fetch(`${API_BASE_URL}/roles`, { headers }),
        fetch(`${API_BASE_URL}/accessRules`, { headers })
      ]);
      
      const rawAccess = accessRes.ok ? await accessRes.json() : {};
      const exportData = {
        exportDate: new Date().toISOString(),
        exportedBy: user?.name || user?.login || 'Admin',
        version: '2.0',
        data: {
          tasks: tasksRes.ok ? await tasksRes.json() : [],
          users: usersRes.ok ? await usersRes.json() : [],
          regions: regionsRes.ok ? await regionsRes.json() : [],
          roles: rolesRes.ok ? await rolesRes.json() : [],
          accessRules: normalizeAccessRulesForSuperAdmins(rawAccess)
        }
      };
      
      // Логування події
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      try {
        await fetch(`${API_BASE_URL}/event-log`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: currentUser._id || currentUser.id,
            userName: currentUser.name || currentUser.login,
            userRole: currentUser.role,
            action: 'export',
            entityType: 'backup',
            entityId: 'json',
            description: 'Експорт резервної копії JSON (всі дані)',
            details: {
              type: 'json',
              tasksCount: exportData.data.tasks?.length || 0,
              usersCount: exportData.data.users?.length || 0
            }
          })
        });
      } catch (logErr) {
        console.error('Помилка логування:', logErr);
      }
      
      // Створюємо файл для завантаження
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `backup_${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      setLastExport(new Date());
      alert(`✅ Експортовано!\n\nЗаявок: ${exportData.data.tasks.length}\nКористувачів: ${exportData.data.users.length}`);
    } catch (error) {
      alert('❌ Помилка експорту: ' + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setExportLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/tasks/filter?filter=all`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('Помилка завантаження');
      
      const tasks = await res.json();
      
      if (tasks.length === 0) {
        alert('Немає заявок для експорту');
        return;
      }
      
      // Визначаємо всі поля
      const allFields = new Set();
      tasks.forEach(t => Object.keys(t).forEach(k => {
        if (k !== '_id' && k !== '__v') allFields.add(k);
      }));
      
      const fields = Array.from(allFields);
      
      // Створюємо CSV
      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };
      
      let csv = fields.join(',') + '\n';
      tasks.forEach(task => {
        csv += fields.map(f => escapeCSV(task[f])).join(',') + '\n';
      });
      
      // Завантажуємо
      // Логування події
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      try {
        await fetch(`${API_BASE_URL}/event-log`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: currentUser._id || currentUser.id,
            userName: currentUser.name || currentUser.login,
            userRole: currentUser.role,
            action: 'export',
            entityType: 'backup',
            entityId: 'csv',
            description: `Експорт заявок у форматі CSV (${tasks.length} заявок)`,
            details: {
              type: 'csv',
              tasksCount: tasks.length
            }
          })
        });
      } catch (logErr) {
        console.error('Помилка логування:', logErr);
      }
      
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `tasks_${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      alert(`✅ Експортовано ${tasks.length} заявок у CSV!`);
    } catch (error) {
      alert('❌ Помилка: ' + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportJSON = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!window.confirm('⚠️ Імпорт замінить існуючі дані!\n\nПродовжити?')) {
      e.target.value = '';
      return;
    }
    
    setImportLoading(true);
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      if (!importData.data) {
        throw new Error('Невірний формат файлу');
      }
      
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      
      // Імпортуємо права доступу
      if (importData.data.accessRules) {
        const importedRules = normalizeAccessRulesForSuperAdmins(importData.data.accessRules);
        await fetch(`${API_BASE_URL}/accessRules`, {
          method: 'POST',
          headers,
          body: JSON.stringify(importedRules)
        });
      }
      
      // Імпортуємо ролі
      if (importData.data.roles?.length) {
        await fetch(`${API_BASE_URL}/roles`, {
          method: 'POST',
          headers,
          body: JSON.stringify(importData.data.roles)
        });
      }
      
      // Підрахунок імпортованих даних
      const imported = {
        tasks: importData.data.tasks?.length || 0,
        users: importData.data.users?.length || 0,
        regions: importData.data.regions?.length || 0,
        roles: importData.data.roles?.length || 0
      };
      
      // Логування події
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      try {
        await fetch(`${API_BASE_URL}/event-log`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: currentUser._id || currentUser.id,
            userName: currentUser.name || currentUser.login,
            userRole: currentUser.role,
            action: 'import',
            entityType: 'backup',
            entityId: 'json',
            description: `Імпорт резервної копії JSON: ${imported.tasks} заявок, ${imported.users} користувачів`,
            details: {
              type: 'json',
              tasksCount: imported.tasks,
              usersCount: imported.users,
              regionsCount: imported.regions,
              rolesCount: imported.roles,
              version: importData.version || 'unknown',
              exportedBy: importData.exportedBy || 'unknown',
              exportDate: importData.exportDate || 'unknown'
            }
          })
        });
      } catch (logErr) {
        console.error('Помилка логування:', logErr);
      }
      
      alert(`✅ Імпорт завершено!\n\nДата бекапу: ${importData.exportDate}\nЕкспортував: ${importData.exportedBy}`);
      loadData();
    } catch (error) {
      alert('❌ Помилка імпорту: ' + error.message);
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  const renderBackupTab = () => (
    <div className="admin-section">
      <h3>💾 Резервне копіювання та експорт</h3>
      
      <div className="backup-grid">
        <div className="backup-card">
          <div className="backup-icon">📤</div>
          <h4>Експорт JSON</h4>
          <p>Повний бекап всіх даних системи (заявки, користувачі, налаштування)</p>
          <button 
            className="btn-backup" 
            onClick={handleExportJSON}
            disabled={exportLoading}
          >
            {exportLoading ? '⏳ Експорт...' : '📥 Завантажити JSON'}
          </button>
        </div>
        
        <div className="backup-card">
          <div className="backup-icon">📊</div>
          <h4>Експорт CSV</h4>
          <p>Експорт заявок у форматі CSV для Excel</p>
          <button 
            className="btn-backup" 
            onClick={handleExportCSV}
            disabled={exportLoading}
          >
            {exportLoading ? '⏳ Експорт...' : '📥 Завантажити CSV'}
          </button>
        </div>
        
        <div className="backup-card">
          <div className="backup-icon">📥</div>
          <h4>Імпорт JSON</h4>
          <p>Відновлення даних з резервної копії</p>
          <label className="btn-backup btn-import">
            {importLoading ? '⏳ Імпорт...' : '📤 Вибрати файл'}
            <input 
              type="file" 
              accept=".json"
              onChange={handleImportJSON}
              disabled={importLoading}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>
      
      {lastExport && (
        <div className="last-export">
          ✅ Останній експорт: {lastExport.toLocaleString('uk-UA')}
        </div>
      )}
      
      <div className="backup-info">
        <h4>ℹ️ Рекомендації:</h4>
        <ul>
          <li>Створюйте резервні копії регулярно (щотижня)</li>
          <li>Зберігайте копії в безпечному місці</li>
          <li>Перед імпортом переконайтесь, що файл коректний</li>
          <li>CSV експорт зручний для аналізу в Excel</li>
        </ul>
      </div>
    </div>
  );

  // Стан для журналу подій
  const [eventLogs, setEventLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsFilter, setLogsFilter] = useState('');
  const [logsRequestNumber, setLogsRequestNumber] = useState('');
  const [debouncedLogsRequestNumber, setDebouncedLogsRequestNumber] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedLogsRequestNumber(logsRequestNumber.trim()), 400);
    return () => clearTimeout(timer);
  }, [logsRequestNumber]);

  const loadEventLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ page, limit: 30 });
      if (logsFilter) params.append('action', logsFilter);
      if (debouncedLogsRequestNumber) params.append('requestNumber', debouncedLogsRequestNumber);
      
      const res = await fetch(`${API_BASE_URL}/event-log?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setEventLogs(data.events || []);
        setLogsTotal(data.total || 0);
        setLogsPage(page);
      }
    } catch (error) {
      console.error('Помилка завантаження логів:', error);
    } finally {
      setLogsLoading(false);
    }
  }, [logsFilter, debouncedLogsRequestNumber]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadEventLogs(1);
    }
  }, [activeTab, logsFilter, debouncedLogsRequestNumber]);

  const handleCleanupLogs = async () => {
    if (!window.confirm('Видалити записи старше 30 днів?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/event-log/cleanup`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(`✅ Видалено ${data.deleted} старих записів`);
        loadEventLogs(1);
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    }
  };

  const getActionIcon = (action) => {
    const icons = {
      'create': '➕',
      'update': '✏️',
      'delete': '🗑️',
      'login': '🔑',
      'logout': '🚪',
      'approve': '✅',
      'reject': '❌'
    };
    return icons[action] || '📋';
  };

  const getActionColor = (action) => {
    const colors = {
      'create': '#4caf50',
      'update': '#2196f3',
      'delete': '#f44336',
      'login': '#9c27b0',
      'logout': '#607d8b',
      'approve': '#4caf50',
      'reject': '#f44336'
    };
    return colors[action] || '#888';
  };

  const renderLogsTab = () => (
    <div className="admin-section">
      <div className="logs-header">
        <h3>📜 Журнал подій</h3>
        <div className="logs-controls">
          <input
            type="text"
            className="logs-request-search"
            placeholder="🔍 Номер заявки..."
            value={logsRequestNumber}
            onChange={(e) => setLogsRequestNumber(e.target.value)}
            title="Пошук за номером заявки (наприклад KV-0001107)"
          />
          <select 
            value={logsFilter} 
            onChange={(e) => setLogsFilter(e.target.value)}
            className="logs-filter"
          >
            <option value="">Всі дії</option>
            <option value="create">➕ Створення</option>
            <option value="update">✏️ Редагування</option>
            <option value="delete">🗑️ Видалення</option>
            <option value="login">🔑 Вхід</option>
            <option value="logout">🚪 Вихід</option>
            <option value="approve">✅ Затвердження</option>
            <option value="reject">❌ Відхилення</option>
          </select>
          <button className="btn-refresh" onClick={() => loadEventLogs(logsPage)}>
            🔄 Оновити
          </button>
          <button className="btn-cleanup" onClick={handleCleanupLogs}>
            🧹 Очистити старі
          </button>
        </div>
      </div>
      
      {logsLoading ? (
        <div className="logs-loading">⏳ Завантаження...</div>
      ) : eventLogs.length === 0 ? (
        <div className="logs-empty">
          <p>📭 Журнал порожній</p>
          <p className="logs-hint">Події будуть записуватись автоматично при роботі користувачів</p>
        </div>
      ) : (
        <>
          <div className="logs-table-wrapper">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Користувач</th>
                  <th>Дія</th>
                  <th>Об'єкт</th>
                  <th>Опис</th>
                </tr>
              </thead>
              <tbody>
                {eventLogs.map(log => (
                  <React.Fragment key={log._id}>
                    <tr className={log.details?.changes?.length ? 'has-details' : ''}>
                      <td className="log-date">
                        {new Date(log.timestamp).toLocaleString('uk-UA', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="log-user">{log.userName || log.userId || '-'}</td>
                      <td>
                        <span 
                          className="log-action"
                          style={{ background: getActionColor(log.action) }}
                        >
                          {getActionIcon(log.action)} {log.action}
                        </span>
                      </td>
                      <td className="log-entity">{log.entityType || '-'}</td>
                      <td className="log-desc">
                        {log.description || '-'}
                        {log.details?.changes?.length > 0 && (
                          <span className="changes-badge">📝 {log.details.changes.length} змін</span>
                        )}
                      </td>
                    </tr>
                    {log.details?.changes?.length > 0 && (
                      <tr className="changes-row">
                        <td colSpan="5">
                          <div className="changes-list">
                            {log.details.changes.map((change, idx) => (
                              <div key={idx} className="change-item">
                                <span className="change-field">{change.field}:</span>
                                <span className="change-old">{change.oldValue}</span>
                                <span className="change-arrow">→</span>
                                <span className="change-new">{change.newValue}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="logs-pagination">
            <span>Всього: {logsTotal}</span>
            <div className="pagination-buttons">
              <button 
                onClick={() => loadEventLogs(logsPage - 1)} 
                disabled={logsPage <= 1}
              >
                ← Назад
              </button>
              <span>Сторінка {logsPage}</span>
              <button 
                onClick={() => loadEventLogs(logsPage + 1)} 
                disabled={eventLogs.length < 30}
              >
                Далі →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Стан для Telegram
  const [telegramSettings, setTelegramSettings] = useState({
    chatId: '',
    testMessage: ''
  });
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [pendingTelegramUsers, setPendingTelegramUsers] = useState([]);
  const [invitePreview, setInvitePreview] = useState(null);
  const [telegramBusy, setTelegramBusy] = useState('');
  const [inviteResult, setInviteResult] = useState(null);

  // Завантаження статусу Telegram
  useEffect(() => {
    if (activeTab === 'telegram') {
      loadTelegramStatus();
      loadPendingTelegramUsers();
    }
  }, [activeTab]);

  const loadPendingTelegramUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/telegram/pending-invites`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setPendingTelegramUsers(await res.json());
      }
    } catch (error) {
      console.error('Помилка завантаження pending invites:', error);
    }
  };

  const loadInvitePreview = async (login) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/telegram/invite-preview/${encodeURIComponent(login)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setInvitePreview(await res.json());
      }
    } catch (error) {
      console.error('Помилка превʼю SMS:', error);
    }
  };

  const setupTelegramWebhook = async () => {
    setTelegramBusy('webhook');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/telegram/setup-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const result = await res.json();
      if (res.ok && result.success) {
        alert(`Webhook налаштовано:\n${result.url}`);
        loadTelegramStatus();
      } else {
        alert('Помилка: ' + (result.error || 'не вдалося налаштувати webhook'));
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    } finally {
      setTelegramBusy('');
    }
  };

  const sendTelegramInvite = async (user) => {
    if (!window.confirm(`Надіслати SMS-запрошення для ${user.name || user.login}?`)) return;
    setTelegramBusy(`invite-${user.login}`);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/telegram/send-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ login: user.login })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        alert(`✅ SMS надіслано на ${result.recipient}`);
        loadPendingTelegramUsers();
        loadData();
      } else {
        alert('Помилка: ' + (result.error || 'не вдалося надіслати SMS'));
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    } finally {
      setTelegramBusy('');
    }
  };

  const sendAllTelegramInvites = async () => {
    if (!pendingTelegramUsers.length) {
      alert('Немає користувачів для запрошення');
      return;
    }
    if (!window.confirm(`Надіслати SMS ${pendingTelegramUsers.length} користувачам?`)) return;
    setTelegramBusy('invite-all');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/telegram/send-invites-pending`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const result = await res.json();
      if (res.ok) {
        setInviteResult(result);
        loadPendingTelegramUsers();
        loadData();
        alert(`Готово: надіслано ${result.sentCount}, помилок ${result.failedCount}`);
      } else {
        alert('Помилка: ' + (result.error || 'не вдалося надіслати SMS'));
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    } finally {
      setTelegramBusy('');
    }
  };

  const loadTelegramStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/telegram/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setTelegramStatus(await res.json());
      }
    } catch (error) {
      console.error('Помилка завантаження статусу:', error);
    }
  };

  const sendTestTelegram = async () => {
    if (!telegramSettings.chatId || !telegramSettings.testMessage) {
      alert('Введіть Chat ID та повідомлення');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/telegram/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chatId: telegramSettings.chatId,
          message: telegramSettings.testMessage
        })
      });
      const result = await res.json();
      setTestResult(result.success ? 'success' : 'error');
      setTimeout(() => setTestResult(null), 5000);
    } catch (error) {
      setTestResult('error');
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const renderTelegramTab = () => (
    <div className="admin-section">
      <h3>📱 Telegram — сповіщення системи «Гідра»</h3>
      
      {telegramStatus && (
        <div className="telegram-status">
          <h4>📊 Статус підключення:</h4>
          <div className="status-items">
            <div className={`status-item ${telegramStatus.botTokenConfigured ? 'ok' : 'error'}`}>
              🤖 Bot Token: {telegramStatus.botTokenConfigured ? '✅ Налаштовано' : '❌ Не налаштовано'}
            </div>
            <div className={`status-item ${telegramStatus.botUsername ? 'ok' : 'error'}`}>
              📛 Бот: DTS-Service (@{telegramStatus.botUsername || '—'})
            </div>
            <div className={`status-item ${telegramStatus.smsConfigured ? 'ok' : 'error'}`}>
              📲 SMS API: {telegramStatus.smsConfigured ? '✅ Налаштовано' : '❌ Не налаштовано'}
            </div>
            <div className={`status-item ${telegramStatus.publicApiUrlConfigured ? 'ok' : 'error'}`}>
              🌐 PUBLIC_API_URL: {telegramStatus.publicApiUrlConfigured ? '✅' : '❌ Потрібно для webhook'}
            </div>
            <div className={`status-item ${telegramStatus.adminChatIdConfigured ? 'ok' : 'error'}`}>
              👑 Admin Chat ID: {telegramStatus.adminChatIdConfigured ? '✅ Налаштовано' : '❌ Не налаштовано'}
            </div>
          </div>
          {telegramStatus.webhookInfo?.url && (
            <div className="status-warning ok">
              🔗 Webhook: {telegramStatus.webhookInfo.url}
            </div>
          )}
          {!telegramStatus.botTokenConfigured && (
            <div className="status-warning">
              ⚠️ Для роботи сповіщень потрібно налаштувати TELEGRAM_BOT_TOKEN в змінних середовища
            </div>
          )}
          <div className="form-buttons" style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="btn-save"
              disabled={!telegramStatus.botTokenConfigured || telegramBusy === 'webhook'}
              onClick={setupTelegramWebhook}
            >
              {telegramBusy === 'webhook' ? '⏳ ...' : '🔗 Налаштувати webhook бота'}
            </button>
          </div>
        </div>
      )}

      <div className="telegram-form telegram-invite-section">
        <h4>📨 Підключення користувачів через SMS</h4>
        <p className="telegram-invite-desc">
          Додайте номер телефону в профілі користувача (розділ «Користувачі»), потім надішліть SMS із
          офіційним посиланням на бота. Текст пояснює, що це робоча система «Гідра», а не фішинг.
          Після переходу за посиланням Chat ID збережеться автоматично.
        </p>
        <div className="notifications-info">
          <span className="without-telegram">⏳ Очікують підключення: {pendingTelegramUsers.length}</span>
        </div>
        {pendingTelegramUsers.length > 0 ? (
          <>
            <button
              type="button"
              className="btn-save"
              disabled={!telegramStatus?.smsConfigured || telegramBusy === 'invite-all'}
              onClick={sendAllTelegramInvites}
            >
              {telegramBusy === 'invite-all' ? '⏳ Надсилання...' : `📤 Надіслати SMS всім (${pendingTelegramUsers.length})`}
            </button>
            <div className="notifications-table-wrapper" style={{ marginTop: '16px' }}>
              <table className="notifications-table">
                <thead>
                  <tr>
                    <th>Користувач</th>
                    <th>Телефон</th>
                    <th>SMS відправлено</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingTelegramUsers.map(u => (
                    <tr key={u.login} className="no-telegram">
                      <td>
                        <div className="user-name">{u.name}</div>
                        <div className="user-login">{u.login}</div>
                      </td>
                      <td>{u.phone || u.phoneNormalized}</td>
                      <td>{u.telegramInviteSentAt ? new Date(u.telegramInviteSentAt).toLocaleString('uk-UA') : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-edit"
                          disabled={telegramBusy === `invite-${u.login}`}
                          onClick={() => sendTelegramInvite(u)}
                          title="Надіслати SMS"
                        >
                          📤 SMS
                        </button>
                        <button
                          type="button"
                          className="btn-edit"
                          onClick={() => loadInvitePreview(u.login)}
                          title="Переглянути текст SMS"
                        >
                          👁️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>Усі користувачі з телефоном уже підключені до Telegram, або телефони не вказані.</p>
        )}
        {invitePreview && (
          <div className="sms-preview-box">
            <h4>📝 Превʼю SMS для {invitePreview.login}</h4>
            <pre className="sms-preview-text">{invitePreview.smsText}</pre>
            <p><strong>Посилання:</strong> <a href={invitePreview.inviteLink} target="_blank" rel="noreferrer">{invitePreview.inviteLink}</a></p>
            <button type="button" className="btn-cancel" onClick={() => setInvitePreview(null)}>Закрити</button>
          </div>
        )}
        {inviteResult?.failed?.length > 0 && (
          <div className="status-warning">
            Помилки: {inviteResult.failed.map(f => `${f.name}: ${f.error}`).join('; ')}
          </div>
        )}
      </div>

      <div className="telegram-form">
        <h4>🧪 Тестування відправки</h4>
        <div className="form-group">
          <label>Chat ID або @username:</label>
          <input
            type="text"
            placeholder="Наприклад: 123456789 або @username"
            value={telegramSettings.chatId}
            onChange={(e) => setTelegramSettings(prev => ({ ...prev, chatId: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label>Тестове повідомлення:</label>
          <input
            type="text"
            placeholder="Введіть тестове повідомлення"
            value={telegramSettings.testMessage}
            onChange={(e) => setTelegramSettings(prev => ({ ...prev, testMessage: e.target.value }))}
          />
        </div>
        <button className="btn-test" onClick={sendTestTelegram}>
          📤 Надіслати тест
        </button>
        {testResult && (
          <div className={`test-result ${testResult}`}>
            {testResult === 'success' ? '✅ Повідомлення надіслано!' : '❌ Помилка відправки'}
          </div>
        )}
      </div>

      <div className="telegram-instructions">
        <h4>📋 Інструкція:</h4>
        <ol>
          <li>Створіть бота в Telegram через @BotFather (якщо ще немає — бот DTS-Service вже використовується)</li>
          <li>Додайте на сервер: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, PUBLIC_API_URL, SMS_API_TOKEN, SMS_SENDER</li>
          <li>Натисніть «Налаштувати webhook бота»</li>
          <li>У розділі «Користувачі» вкажіть телефон кожного співробітника (380XXXXXXXXX)</li>
          <li>Надішліть SMS-запрошення — користувач переходить за посиланням і натискає Start</li>
          <li>Chat ID збережеться автоматично; налаштуйте типи сповіщень у вкладці «Сповіщення»</li>
        </ol>
      </div>
    </div>
  );

  // Стан для управління сповіщеннями
  const [usersWithTelegram, setUsersWithTelegram] = useState([]);
  const [notificationSettings, setNotificationSettings] = useState({});
  const [systemMessage, setSystemMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const NOTIFICATION_TYPES = [
    { key: 'newRequests', label: 'Нові заявки та зміни заявок у статусі «Заявка»' },
    { key: 'pendingApproval', label: 'Потребує підтвердження Завсклада' },
    { key: 'accountantApproval', label: 'Затвердження Бухгалтера' },
    { key: 'approvedRequests', label: 'Підтверджені заявки' },
    { key: 'rejectedRequests', label: 'Відхилені заявки' },
    { key: 'invoiceRequests', label: 'Запити на рахунки' },
    { key: 'completedInvoices', label: 'Виконані рахунки' },
    { key: 'procurementRequestCreated', label: 'VZ: нова заявка' },
    { key: 'procurementExecutorCompleted', label: 'VZ: виконано (чекає склад)' },
    { key: 'procurementWarehouseConfirmed', label: 'VZ: підтверджено складом' },
    { key: 'procurementRequestCompleted', label: 'VZ: виконано (матеріал на складі)' },
    { key: 'procurementRequestRejected', label: 'VZ: відхилено' },
    { key: 'newMarketingLeads', label: 'Нові ліди з реклами' },
    { key: 'systemNotifications', label: 'Системні сповіщення' },
  ];

  useEffect(() => {
    if (activeTab === 'notifications') {
      loadUsersWithTelegram();
    }
  }, [activeTab]);

  const loadUsersWithTelegram = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/users?includeDismissed=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        
        // Фільтруємо тільки користувачів з реальним Telegram Chat ID (не placeholder)
        const withTelegram = data
          .filter(u => {
            const chatId = u.telegramChatId?.trim();
            // Перевіряємо що це реальний ID (число), а не placeholder типу "Chat ID"
            return chatId && chatId !== 'Chat ID' && /^-?\d+$/.test(chatId);
          })
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'));
        
        setUsersWithTelegram(withTelegram);
        
        // Завантажуємо налаштування
        const settings = {};
        withTelegram.forEach(u => {
          settings[u.login] = u.notificationSettings || {};
        });
        setNotificationSettings(settings);
      }
    } catch (error) {
      console.error('Помилка:', error);
    }
  };

  const handleNotificationToggle = (userLogin, notifType) => {
    setNotificationSettings(prev => ({
      ...prev,
      [userLogin]: {
        ...prev[userLogin],
        [notifType]: !prev[userLogin]?.[notifType]
      }
    }));
  };

  const saveNotificationSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      
      for (const u of usersWithTelegram) {
        const userSettings = notificationSettings[u.login] || {};
        const userId = u._id || u.id;
        const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ ...u, notificationSettings: userSettings })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Не вдалося зберегти налаштування для ${u.login}`);
        }
      }
      
      alert('✅ Налаштування збережено!');
    } catch (error) {
      alert('Помилка: ' + error.message);
    }
  };

  const sendSystemNotification = async () => {
    if (!systemMessage.trim()) {
      alert('Введіть текст повідомлення');
      return;
    }
    
    setSendingMessage(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/notifications/send-system-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: systemMessage })
      });
      
      if (res.ok) {
        alert('✅ Повідомлення відправлено!');
        setSystemMessage('');
      } else {
        alert('Помилка відправки');
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    } finally {
      setSendingMessage(false);
    }
  };

  // Стан для SMS (Реклама)
  const [smsSettings, setSmsSettings] = useState({
    phone: '',
    message: ''
  });
  const [smsStatus, setSmsStatus] = useState(null);
  const [smsTestResult, setSmsTestResult] = useState(null);
  const [smsTestError, setSmsTestError] = useState('');
  const [sendingSms, setSendingSms] = useState(false);

  useEffect(() => {
    if (activeTab === 'advertising') {
      loadSmsStatus();
    }
  }, [activeTab]);

  const loadSmsStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/sms/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSmsStatus(await res.json());
      }
    } catch (error) {
      console.error('Помилка завантаження статусу SMS:', error);
    }
  };

  const sendTestSms = async () => {
    if (!smsSettings.phone.trim() || !smsSettings.message.trim()) {
      alert('Введіть номер телефону та текст повідомлення');
      return;
    }

    setSendingSms(true);
    setSmsTestResult(null);
    setSmsTestError('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/sms/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: smsSettings.phone.trim(),
          message: smsSettings.message.trim()
        })
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setSmsTestResult('success');
      } else {
        setSmsTestResult('error');
        setSmsTestError(result.error || 'Помилка відправки');
      }
      setTimeout(() => {
        setSmsTestResult(null);
        setSmsTestError('');
      }, 8000);
    } catch (error) {
      setSmsTestResult('error');
      setSmsTestError(error.message);
      setTimeout(() => {
        setSmsTestResult(null);
        setSmsTestError('');
      }, 8000);
    } finally {
      setSendingSms(false);
    }
  };

  const renderAdvertisingTab = () => (
    <div className="admin-section">
      <h3>📢 Реклама — SMS повідомлення</h3>

      {smsStatus && (
        <div className="telegram-status">
          <h4>📊 Статус підключення SMS:</h4>
          <div className="status-items">
            <div className={`status-item ${smsStatus.apiTokenConfigured ? 'ok' : 'error'}`}>
              🔑 API Token: {smsStatus.apiTokenConfigured ? '✅ Налаштовано' : '❌ Не налаштовано'}
            </div>
            <div className={`status-item ${smsStatus.senderConfigured ? 'ok' : 'error'}`}>
              📤 Відправник (альфа-ім&apos;я): {smsStatus.senderConfigured ? '✅ Налаштовано' : '❌ Не налаштовано'}
            </div>
            <div className="status-item ok">
              🌐 Провайдер: {smsStatus.provider || 'TurboSMS'}
            </div>
          </div>
          {(!smsStatus.apiTokenConfigured || !smsStatus.senderConfigured) && (
            <div className="status-warning">
              ⚠️ Для відправки SMS налаштуйте змінні середовища SMS_API_TOKEN (або TURBOSMS_API_TOKEN) та SMS_SENDER (або TURBOSMS_SENDER)
            </div>
          )}
        </div>
      )}

      <div className="telegram-form">
        <h4>🧪 Тестова відправка SMS</h4>
        <div className="form-group">
          <label>Номер телефону:</label>
          <input
            type="text"
            placeholder="Наприклад: 380501234567 або 0501234567"
            value={smsSettings.phone}
            onChange={(e) => setSmsSettings(prev => ({ ...prev, phone: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label>Текст повідомлення:</label>
          <textarea
            rows={4}
            placeholder="Введіть текст SMS для перевірки"
            value={smsSettings.message}
            onChange={(e) => setSmsSettings(prev => ({ ...prev, message: e.target.value }))}
          />
        </div>
        <button className="btn-test" onClick={sendTestSms} disabled={sendingSms}>
          {sendingSms ? '⏳ Відправка...' : '📤 Надіслати тестове SMS'}
        </button>
        {smsTestResult && (
          <div className={`test-result ${smsTestResult}`}>
            {smsTestResult === 'success'
              ? '✅ SMS надіслано успішно!'
              : `❌ Помилка відправки${smsTestError ? `: ${smsTestError}` : ''}`}
          </div>
        )}
      </div>

      <div className="telegram-instructions">
        <h4>📋 Інструкція:</h4>
        <ol>
          <li>Зареєструйтеся на TurboSMS (turbosms.ua) та отримайте API Token</li>
          <li>Зареєструйте альфа-ім&apos;я відправника (SMS_SENDER)</li>
          <li>Додайте змінні середовища на сервері: SMS_API_TOKEN та SMS_SENDER</li>
          <li>Введіть номер у форматі 380XXXXXXXXX та текст повідомлення</li>
          <li>Натисніть «Надіслати тестове SMS» для перевірки</li>
        </ol>
      </div>
    </div>
  );

  const renderNotificationsTab = () => (
    <div className="admin-section">
      <h3>🔔 Управління сповіщеннями користувачів</h3>
      
      {usersWithTelegram.length === 0 ? (
        <div className="no-users-message">
          <p>Немає користувачів з налаштованим Telegram.</p>
          <p>Додайте телефони та надішліть SMS-запрошення у вкладці «Telegram».</p>
        </div>
      ) : (
        <>
          <div className="notifications-info">
            <span className="with-telegram">✅ Користувачів з Telegram: {usersWithTelegram.length}</span>
            <p className="notifications-info-hint">
              Колонки «VZ: …» — Telegram про заявки закупівель. Користувач отримує лише ті типи, де стоїть його чекбокс.
              Адміністратор з активним чекбоксом отримує той самий тип у свій бот; канал TELEGRAM_ADMIN_CHAT_ID — як і для сервісних заявок.
              «VZ: виконано (чекає склад)» — виконавець закрив заявку, склад ще не підтвердив.
              «VZ: підтверджено складом» — завсклад підтвердив надходження.
              «VZ: виконано (матеріал на складі)» — документи підтверджено і заявку закрито (також імпортовані з Google Sheets після закриття виконавцем).
              «VZ: відхилено» — за чекбоксом; адміністратори отримують завжди.
            </p>
          </div>
          <div className="notifications-table-wrapper">
            <table className="notifications-table">
              <thead>
                <tr>
                  <th>Користувач</th>
                  <th>Роль</th>
                  <th>Chat ID</th>
                  {NOTIFICATION_TYPES.map(t => (
                    <th key={t.key}>{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usersWithTelegram.map(u => (
                  <tr key={u._id || u.id}>
                    <td>
                      <div className="user-name">{u.name}</div>
                      <div className="user-login">{u.login}</div>
                    </td>
                    <td><span className="role-badge">{u.role}</span></td>
                    <td><code className="telegram-id">{u.telegramChatId}</code></td>
                    {NOTIFICATION_TYPES.map(t => (
                      <td key={t.key} className="checkbox-cell">
                        <input
                          type="checkbox"
                          checked={notificationSettings[u.login]?.[t.key] || false}
                          onChange={() => handleNotificationToggle(u.login, t.key)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <button className="btn-save-notifications" onClick={saveNotificationSettings}>
            💾 Зберегти налаштування
          </button>
        </>
      )}
      
      <div className="system-message-section">
        <h4>📢 Системне повідомлення</h4>
        <textarea
          placeholder="Введіть текст системного повідомлення..."
          value={systemMessage}
          onChange={(e) => setSystemMessage(e.target.value)}
        />
        <button 
          className="btn-send-message" 
          onClick={sendSystemNotification}
          disabled={sendingMessage}
        >
          {sendingMessage ? '⏳ Відправка...' : '📤 Відправити всім'}
        </button>
        <p className="hint">Повідомлення буде надіслано користувачам з увімкненим "Системні сповіщення"</p>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'users': return renderUsersTab();
      case 'activeUsers': return renderActiveUsersTab();
      case 'regions': return renderRegionsTab();
      case 'roles': return renderRolesTab();
      case 'access': return renderAccessTab();
      case 'telegram': return renderTelegramTab();
      case 'notifications': return renderNotificationsTab();
      case 'advertising': return renderAdvertisingTab();
      case 'taskExport': return <TaskExportPanel user={user} />;
      case 'backup': return renderBackupTab();
      case 'logs': return renderLogsTab();
      case 'warehouses': return <WarehouseManagement user={user} />;
      case 'categories': return <CategoryManagement user={user} />;
      case 'productCards': return <ProductCardManagement />;
      case 'systemCoefficients': return <SystemCoefficientsSettings />;
      case 'onecAgent': return <OneCWorkerPanel />;
      case 'systemHealth': return <SystemHealthDashboard />;
      default: return renderUsersTab();
    }
  };

  if (loading) {
    return <div className="admin-loading">⏳ Завантаження...</div>;
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-tabs">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className={`admin-content ${activeTab === 'users' ? 'admin-content--users' : ''}`}>
        {renderContent()}
      </div>
      {renderUserFormModal()}
      {userMenu && (
        <div
          ref={userMenuRef}
          className="user-actions-menu"
          style={{ top: userMenu.top, left: userMenu.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => handleEditUser(userMenu.user)}>
            Редагувати
          </button>
          <button type="button" onClick={() => handleToggleDismissed(userMenu.user)}>
            {userMenu.user.dismissed ? 'Відновити' : 'Звільнити'}
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => handleDeleteUser(userMenu.user)}
          >
            Видалити
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
