import React, { useState } from 'react';
import API_BASE_URL from '../config';

function Login({ onLogin }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ login, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Помилка авторизації');
      }

      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--background)',
      padding: '20px'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '400px',
        background: 'var(--surface)',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--border)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: 'var(--text-primary)',
            marginBottom: '8px'
          }}>
            NewServiceGidra
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Вхід в систему
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: 'var(--text-primary)'
            }}>
              Логін
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                background: 'var(--surface-dark)',
                color: 'var(--text-primary)'
              }}
              placeholder="Введіть логін"
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: 'var(--text-primary)'
            }}>
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                background: 'var(--surface-dark)',
                color: 'var(--text-primary)'
              }}
              placeholder="Введіть пароль"
            />
          </div>

          {error && (
            <div style={{
              padding: '12px',
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              borderRadius: '6px',
              marginBottom: '20px',
              fontSize: '14px',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#475569' : 'var(--primary)',
              color: 'white',
              fontSize: '16px',
              fontWeight: '600',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {loading ? 'Вхід...' : 'Увійти'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
