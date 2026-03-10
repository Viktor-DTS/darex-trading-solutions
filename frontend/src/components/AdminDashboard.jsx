import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import WarehouseManagement from './equipment/WarehouseManagement';
import CategoryManagement from './equipment/CategoryManagement';
import './AdminDashboard.css';

// Вкладки адміністратора
const ADMIN_TABS = [
  { id: 'users', label: '👥 Користувачі', icon: '👥' },
  { id: 'activeUsers', label: '🟢 Активні користувачі', icon: '🟢' },
  { id: 'access', label: '🔑 Права доступу', icon: '🔑' },
  { id: 'regions', label: '🌍 Регіони', icon: '🌍' },
  { id: 'roles', label: '🎭 Ролі', icon: '🎭' },
  { id: 'telegram', label: '📱 Telegram', icon: '📱' },
  { id: 'notifications', label: '🔔 Сповіщення', icon: '🔔' },
  { id: 'backup', label: '💾 Бекап', icon: '💾' },
  { id: 'logs', label: '📜 Логи', icon: '📜' },
  { id: 'warehouses', label: '🏢 Управління складами', icon: '🏢' },
  { id: 'categories', label: '📂 Категорії номенклатури', icon: '📂' },
];

function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(false);
  
  // Дані
  const [users, setUsers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [accessRules, setAccessRules] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  
  // Форма для користувача
  const [userForm, setUserForm] = useState({
    login: '',
    password: '',
    name: '',
    role: 'service',
    region: '',
    telegramChatId: '',
    dismissed: false
  });
  const [editingUser, setEditingUser] = useState(null);
  
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
        setAccessRules(data);
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

  // ==================== КОРИСТУВАЧІ ====================
  
  const handleUserFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUserForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userForm.login || !userForm.password || !userForm.name || !userForm.role) {
      alert('Заповніть обов\'язкові поля: Логін, Пароль, ПІБ, Роль');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const method = editingUser ? 'PUT' : 'POST';
      const url = editingUser 
        ? `${API_BASE_URL}/users/${editingUser._id || editingUser.id}`
        : `${API_BASE_URL}/users`;
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...userForm,
          id: editingUser?.id || Date.now()
        })
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
    setEditingUser(u);
    setUserForm({
      login: u.login || '',
      password: u.password || '',
      name: u.name || '',
      role: u.role || 'service',
      region: u.region || '',
      telegramChatId: u.telegramChatId || '',
      dismissed: u.dismissed || false
    });
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Видалити користувача ${u.name || u.login}?`)) return;
    
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
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/users/${u._id || u.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...u, dismissed: !u.dismissed })
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
      login: '',
      password: '',
      name: '',
      role: 'service',
      region: regions[0]?.name || '',
      telegramChatId: '',
      dismissed: false
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

  const renderUsersTab = () => (
    <div className="admin-section">
      <h3>{editingUser ? '✏️ Редагування користувача' : '➕ Додати користувача'}</h3>
      
      <form className="user-form" onSubmit={handleSaveUser}>
        <div className="form-row">
          <input
            name="login"
            placeholder="Логін *"
            value={userForm.login}
            onChange={handleUserFormChange}
            disabled={!!editingUser}
          />
          <input
            name="password"
            type="password"
            placeholder="Пароль *"
            value={userForm.password}
            onChange={handleUserFormChange}
            autoComplete="new-password"
          />
          <input
            name="name"
            placeholder="ПІБ *"
            value={userForm.name}
            onChange={handleUserFormChange}
          />
        </div>
        <div className="form-row">
          <select name="role" value={userForm.role} onChange={handleUserFormChange}>
            {roles.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <select name="region" value={userForm.region} onChange={handleUserFormChange}>
            <option value="">-- Виберіть регіон --</option>
            {regions.map(r => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </select>
          <input
            name="telegramChatId"
            placeholder="Telegram Chat ID"
            value={userForm.telegramChatId}
            onChange={handleUserFormChange}
          />
        </div>
        <div className="form-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="dismissed"
              checked={userForm.dismissed}
              onChange={handleUserFormChange}
            />
            Звільнений
          </label>
          <div className="form-buttons">
            <button type="submit" className="btn-save">
              {editingUser ? '💾 Зберегти' : '➕ Додати'}
            </button>
            {editingUser && (
              <button type="button" className="btn-cancel" onClick={resetUserForm}>
                ❌ Скасувати
              </button>
            )}
          </div>
        </div>
      </form>

      <h3>📋 Список користувачів ({users.length})</h3>
      <div className="users-table-wrapper">
        <table className="users-table">
          <thead>
            <tr>
              <th>Статус</th>
              <th>Логін</th>
              <th>ПІБ</th>
              <th>Роль</th>
              <th>Telegram</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {/* Групування по регіонах, сортування по алфавіту */}
            {[...new Set(users.map(u => u.region || 'Без регіону'))]
              .sort((a, b) => a.localeCompare(b, 'uk'))
              .map(region => {
                const regionUsers = users
                  .filter(u => (u.region || 'Без регіону') === region)
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'));
                
                return (
                  <React.Fragment key={region}>
                    <tr className="region-header">
                      <td colSpan="6">
                        <span className="region-name">🌍 {region}</span>
                        <span className="region-count">({regionUsers.length})</span>
                      </td>
                    </tr>
                    {regionUsers.map(u => (
                      <tr 
                        key={u._id || u.id} 
                        className={`${onlineUsers.has(u.login) ? 'online' : ''} ${u.dismissed ? 'dismissed' : ''}`}
                      >
                        <td className="status-cell">
                          {onlineUsers.has(u.login) ? (
                            <span className="status-badge online">🟢 Online</span>
                          ) : (
                            <span className="status-badge offline">⚫ Offline</span>
                          )}
                        </td>
                        <td>{u.login}</td>
                        <td>{u.name}</td>
                        <td>{roles.find(r => r.value === u.role)?.label || u.role}</td>
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
                          <button className="btn-delete" onClick={() => handleDeleteUser(u)} title="Видалити">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
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
    { key: 'testing', label: 'Відділ тестування' },
    { key: 'accountant', label: 'Бух. рахунки' },
    { key: 'accountantApproval', label: 'Бух. на Затвердженні' },
    { key: 'regional', label: 'Регіональний керівник' },
    { key: 'reports', label: 'Звіти' },
    { key: 'analytics', label: 'Аналітика' },
    { key: 'admin', label: 'Адміністратор' },
  ];

  const ACCESS_LEVELS = [
    { value: 'none', label: '❌ Немає', color: '#f44336' },
    { value: 'read', label: '👁️ Перегляд', color: '#ff9800' },
    { value: 'full', label: '✅ Повний', color: '#4caf50' },
  ];

  const handleAccessChange = (role, panel, value) => {
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
      const res = await fetch(`${API_BASE_URL}/accessRules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(accessRules)
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
                rules: accessRules
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        alert('✅ Права доступу збережено!\n\nКористувачі побачать зміни після перезаходу в систему.');
      } else {
        alert('❌ Помилка збереження');
      }
    } catch (error) {
      alert('Помилка: ' + error.message);
    }
  };

  const renderAccessTab = () => (
    <div className="admin-section">
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
                  const currentAccess = accessRules[role.value]?.[panel.key] || 'none';
                  return (
                    <td key={panel.key} className="access-cell">
                      <select
                        value={currentAccess}
                        onChange={(e) => handleAccessChange(role.value, panel.key, e.target.value)}
                        className={`access-select ${currentAccess}`}
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
      
      const exportData = {
        exportDate: new Date().toISOString(),
        exportedBy: user?.name || user?.login || 'Admin',
        version: '2.0',
        data: {
          tasks: tasksRes.ok ? await tasksRes.json() : [],
          users: usersRes.ok ? await usersRes.json() : [],
          regions: regionsRes.ok ? await regionsRes.json() : [],
          roles: rolesRes.ok ? await rolesRes.json() : [],
          accessRules: accessRes.ok ? await accessRes.json() : {}
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
        await fetch(`${API_BASE_URL}/accessRules`, {
          method: 'POST',
          headers,
          body: JSON.stringify(importData.data.accessRules)
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

  const loadEventLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ page, limit: 30 });
      if (logsFilter) params.append('action', logsFilter);
      
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
  }, [logsFilter]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadEventLogs(1);
    }
  }, [activeTab, logsFilter]);

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

  // Завантаження статусу Telegram
  useEffect(() => {
    if (activeTab === 'telegram') {
      loadTelegramStatus();
    }
  }, [activeTab]);

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
      <h3>📱 Налаштування Telegram сповіщень</h3>
      
      {telegramStatus && (
        <div className="telegram-status">
          <h4>📊 Статус підключення:</h4>
          <div className="status-items">
            <div className={`status-item ${telegramStatus.botTokenConfigured ? 'ok' : 'error'}`}>
              🤖 Bot Token: {telegramStatus.botTokenConfigured ? '✅ Налаштовано' : '❌ Не налаштовано'}
            </div>
            <div className={`status-item ${telegramStatus.adminChatIdConfigured ? 'ok' : 'error'}`}>
              👑 Admin Chat ID: {telegramStatus.adminChatIdConfigured ? '✅ Налаштовано' : '❌ Не налаштовано'}
            </div>
          </div>
          {!telegramStatus.botTokenConfigured && (
            <div className="status-warning">
              ⚠️ Для роботи сповіщень потрібно налаштувати TELEGRAM_BOT_TOKEN в змінних середовища
            </div>
          )}
        </div>
      )}

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
          <li>Створіть бота в Telegram через @BotFather</li>
          <li>Отримайте токен та додайте в TELEGRAM_BOT_TOKEN</li>
          <li>Дізнайтесь свій Chat ID через @userinfobot</li>
          <li>Введіть Chat ID користувачам в розділі "Користувачі"</li>
          <li>Протестуйте відправку вище</li>
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
    { key: 'newRequests', label: 'Нові заявки' },
    { key: 'pendingApproval', label: 'Потребує підтвердження Завсклада' },
    { key: 'accountantApproval', label: 'Затвердження Бухгалтера' },
    { key: 'approvedRequests', label: 'Підтверджені заявки' },
    { key: 'rejectedRequests', label: 'Відхилені заявки' },
    { key: 'invoiceRequests', label: 'Запити на рахунки' },
    { key: 'completedInvoices', label: 'Виконані рахунки' },
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
            return chatId && chatId !== 'Chat ID' && /^\d+$/.test(chatId);
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
        await fetch(`${API_BASE_URL}/users/${u._id || u.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ ...u, notificationSettings: userSettings })
        });
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

  const renderNotificationsTab = () => (
    <div className="admin-section">
      <h3>🔔 Управління сповіщеннями користувачів</h3>
      
      {usersWithTelegram.length === 0 ? (
        <div className="no-users-message">
          <p>Немає користувачів з налаштованим Telegram Chat ID.</p>
          <p>Спочатку додайте Chat ID в розділі "Користувачі".</p>
        </div>
      ) : (
        <>
          <div className="notifications-info">
            <span className="with-telegram">✅ Користувачів з Telegram: {usersWithTelegram.length}</span>
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
      case 'backup': return renderBackupTab();
      case 'logs': return renderLogsTab();
      case 'warehouses': return <WarehouseManagement user={user} />;
      case 'categories': return <CategoryManagement user={user} />;
      default: return renderUsersTab();
    }
  };

  if (loading) {
    return <div className="admin-loading">⏳ Завантаження...</div>;
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-tabs">
        {ADMIN_TABS.map(tab => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="admin-content">
        {renderContent()}
      </div>
    </div>
  );
}

export default AdminDashboard;
