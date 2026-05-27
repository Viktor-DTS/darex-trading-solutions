import React, { useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import {
  STUCK_APPROVAL_DAYS,
  getAccountantStuckDays,
  isAccountantStuck,
} from '../utils/taskStuckRules';
import './AccountantStuckTasksPanel.css';

export default function AccountantStuckTasksPanel({ user, refreshTrigger, onTaskClick, onTasksLoaded }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadTasks = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        const region = encodeURIComponent(user?.region || '');
        const response = await fetch(
          `${API_BASE_URL}/tasks/filter?status=accountantPending&region=${region}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) {
          throw new Error('Не вдалося завантажити заявки');
        }

        const data = await response.json();
        const list = Array.isArray(data) ? data : (data.tasks || []);
        if (!cancelled) {
          setTasks(list);
          onTasksLoaded?.(list);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Помилка завантаження');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadTasks();
    return () => {
      cancelled = true;
    };
  }, [user?.region, refreshTrigger]);

  const stuckTasks = useMemo(
    () =>
      tasks
        .filter(isAccountantStuck)
        .map((task) => ({
          task,
          id: task._id || task.id,
          number: task.requestNumber || task._id || task.id,
          client: (task.client || '').trim() || '—',
          region: (task.serviceRegion || '').trim() || '—',
          status: task.status || '—',
          author: (task.requestAuthor || '').trim() || '—',
          days: getAccountantStuckDays(task),
        }))
        .sort((a, b) => (b.days ?? 0) - (a.days ?? 0)),
    [tasks]
  );

  if (loading) {
    return <div className="accountant-stuck-panel loading">⏳ Завантаження завислих заявок...</div>;
  }

  if (error) {
    return <div className="accountant-stuck-panel error">❌ {error}</div>;
  }

  return (
    <div className="accountant-stuck-panel">
      <div className="accountant-stuck-header">
        <div>
          <h3>⏳ Завислі заявки</h3>
          <p>
            Після підтвердження складом бухгалтерія не затвердила більше {STUCK_APPROVAL_DAYS} днів.
          </p>
        </div>
        <div className="accountant-stuck-count">{stuckTasks.length}</div>
      </div>

      {stuckTasks.length === 0 ? (
        <div className="accountant-stuck-empty">✅ Немає завислих заявок за поточним правилом.</div>
      ) : (
        <div className="accountant-stuck-table-wrap">
          <table className="accountant-stuck-table">
            <thead>
              <tr>
                <th>№ заявки</th>
                <th>Клієнт</th>
                <th>Регіон</th>
                <th>Статус</th>
                <th>Автор</th>
                <th>Днів</th>
              </tr>
            </thead>
            <tbody>
              {stuckTasks.map((row) => (
                <tr
                  key={row.id}
                  className="accountant-stuck-row"
                  onClick={() => onTaskClick?.(row.task)}
                  title="Відкрити заявку для редагування"
                >
                  <td>{row.number}</td>
                  <td>{row.client}</td>
                  <td>{row.region}</td>
                  <td>{row.status}</td>
                  <td>{row.author}</td>
                  <td className="accountant-stuck-days">
                    {row.days !== null ? row.days.toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="accountant-stuck-hint">Натисніть на рядок, щоб відкрити заявку в формі бухгалтера.</p>
        </div>
      )}
    </div>
  );
}
