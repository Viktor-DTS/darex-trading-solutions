import { useState, useEffect } from 'react';

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

  useEffect(() => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const found = users.find(u => u.login === login);
    if (found) {
      setRole(found.role);
      setRoleLocked(true);
    } else {
      setRole('admin');
      setRoleLocked(false);
    }
  }, [login]);

  const handleSubmit = e => {
    e.preventDefault();
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const found = users.find(u => u.login === login && u.password === password);
    if (found) {
      onLogin(found);
    } else {
      alert('Невірний логін або пароль!');
    }
  };

  const handleNoPassword = () => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const found = users.find(u => u.login === login && u.role === role);
    if (found) {
      onLogin(found);
    } else {
      onLogin({ login: 'test', role });
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
          <button type="submit" style={{ width: '100%', marginBottom: 12 }}>Увійти</button>
        </form>
      </div>
    </>
  );
} 