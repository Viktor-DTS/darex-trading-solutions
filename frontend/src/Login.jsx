import { useState, useEffect } from 'react';
import { columnsSettingsAPI } from './utils/columnsSettingsAPI';
import API_BASE_URL from './config.js';

const roles = [
  { value: 'admin', label: 'Адміністратор' },
  { value: 'service', label: 'Сервісна служба' },
  { value: 'operator', label: 'Оператор' },
  { value: 'warehouse', label: 'Зав. склад' },
  { value: 'accountant', label: 'Бухгалтер' },
  { value: 'regional', label: 'Регіональний керівник' },
];

export default function Login({ onLogin }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [roleLocked, setRoleLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!login.trim()) {
      setRole('admin');
      setRoleLocked(false);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const user = await columnsSettingsAPI.getUser(login);
        if (user) {
          setRole(user.role);
      setRoleLocked(true);
    } else {
      setRole('admin');
      setRoleLocked(false);
    }
      } catch (error) {
        console.error('Помилка перевірки користувача:', error);
        setRole('admin');
        setRoleLocked(false);
      }
    }, 400); // 400 мс після останнього введення
    return () => clearTimeout(timeout);
  }, [login]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) {
      alert('Введіть логін та пароль');
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ login, password }),
      });
      
      if (response.ok) {
        const result = await response.json();
        onLogin(result.user);
    } else {
        const error = await response.json();
        alert(error.error || 'Помилка авторизації');
      }
    } catch (error) {
      console.error('Помилка авторизації:', error);
      alert('Помилка підключення до сервера');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className='bg-logo'></div>
      <div style={{ maxWidth: 340, margin: '80px auto', background: '#1a2636', padding: 32, borderRadius: 16, color: '#fff', boxShadow: '0 4px 32px #0006', position: 'relative', zIndex: 1 }}>
        <h2>Вхід в систему</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label>Логін<br /><input value={login} onChange={e => setLogin(e.target.value)} style={{ width: '100%' }} /></label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>Пароль<br /><input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%' }} /></label>
          </div>
          <button type="submit" style={{ width: '100%', marginBottom: 12 }} disabled={isLoading}>
            {isLoading ? '⏳ Вхід...' : 'Увійти'}
          </button>
        </form>
      </div>
    </>
  );
} 