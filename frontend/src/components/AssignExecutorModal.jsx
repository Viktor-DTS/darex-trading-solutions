import React, { useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import { authFetch } from '../utils/authFetch';
import './AssignExecutorModal.css';

export default function AssignExecutorModal({ task, onClose, onAssigned }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedLogin, setSelectedLogin] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const region = encodeURIComponent(task?.serviceRegion || '');
        const res = await authFetch(`${API_BASE_URL}/users/service-for-assign?region=${region}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data.error || 'Не вдалося завантажити список інженерів');
        if (!cancelled) setUsers(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Не вдалося завантажити список');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [task?.serviceRegion]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = String(u.name || '').toLowerCase();
      const login = String(u.login || '').toLowerCase();
      return name.includes(q) || login.includes(q);
    });
  }, [users, query]);

  const submit = async () => {
    if (!selectedLogin) {
      setError('Оберіть виконавця зі списку');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await authFetch(`${API_BASE_URL}/tasks/${task._id || task.id}/assign-executor`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ login: selectedLogin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не вдалося передати заявку');
      onAssigned(data);
    } catch (e) {
      setError(e.message || 'Не вдалося передати заявку');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="assign-exec-overlay" onClick={onClose} role="presentation">
      <div className="assign-exec-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="assign-exec-title">
        <h3 id="assign-exec-title">Передати виконавцю</h3>
        <p className="assign-exec-meta">
          Заявка <b>{task?.requestNumber || 'без номера'}</b>
          {task?.serviceRegion ? ` · ${task.serviceRegion}` : ''}
          {task?.engineer1 ? ` · зараз: ${task.engineer1}` : ''}
        </p>
        <input
          className="assign-exec-search"
          type="search"
          placeholder="Пошук за прізвищем або логіном"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {loading ? (
          <p className="assign-exec-empty">Завантаження списку…</p>
        ) : filtered.length === 0 ? (
          <p className="assign-exec-empty">Немає сервісних інженерів вашого регіону</p>
        ) : (
          <ul className="assign-exec-list">
            {filtered.map((u) => (
              <li key={u.login}>
                <label>
                  <input
                    type="radio"
                    name="assign-executor"
                    checked={selectedLogin === u.login}
                    onChange={() => setSelectedLogin(u.login)}
                  />
                  <span>
                    <b>{u.name}</b>
                    {u.region ? <small>{u.region}</small> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="assign-exec-error">{error}</p> : null}
        <div className="assign-exec-actions">
          <button type="button" className="assign-exec-cancel" onClick={onClose} disabled={saving}>
            Скасувати
          </button>
          <button type="button" className="assign-exec-ok" onClick={submit} disabled={saving || !selectedLogin}>
            {saving ? 'Передаю…' : 'Передати'}
          </button>
        </div>
      </div>
    </div>
  );
}
