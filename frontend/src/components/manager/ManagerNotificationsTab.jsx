import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../../config';
import './ManagerNotificationsTab.css';

const KIND_LABELS = {
  reservation_3d: 'Нагадування',
  reservation_1d: 'Нагадування',
  reservation_released_auto: 'Авто-зняття резерву',
  reservation_released_admin: 'Зняття резерву'
};

function ManagerNotificationsTab({ onUnreadCountChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/manager-notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
    onUnreadCountChange?.();
  }, [onUnreadCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/manager-notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setItems((prev) => prev.map((x) => (x._id === id ? { ...x, read: true } : x)));
        onUnreadCountChange?.();
      }
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/manager-notifications/mark-all-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setItems((prev) => prev.map((x) => ({ ...x, read: true })));
        onUnreadCountChange?.();
      }
    } catch {
      /* ignore */
    }
  };

  const unreadCount = items.filter((x) => !x.read).length;

  return (
    <div className="manager-notifications-tab">
      <div className="manager-notifications-header">
        <h2>Системні сповіщення</h2>
        <div className="manager-notifications-actions">
          <button type="button" className="btn-refresh" onClick={load} disabled={loading}>
            Оновити
          </button>
          {unreadCount > 0 && (
            <button type="button" className="btn-mark-all" onClick={markAllRead}>
              Позначити всі прочитаними
            </button>
          )}
        </div>
      </div>
      <p className="manager-notifications-desc">
        Персональні нагадування про ваші резерви обладнання та зняття резерву (лише для вашого облікового запису).
      </p>

      {loading ? (
        <div className="manager-notifications-loading">Завантаження…</div>
      ) : items.length === 0 ? (
        <div className="manager-notifications-empty">Немає сповіщень</div>
      ) : (
        <ul className="manager-notifications-list">
          {items.map((n) => (
            <li
              key={n._id}
              className={`manager-notification-item ${n.read ? 'read' : 'unread'}`}
            >
              <div className="manager-notification-meta">
                <span className="manager-notification-kind">{KIND_LABELS[n.kind] || n.kind}</span>
                <time dateTime={n.createdAt}>
                  {n.createdAt
                    ? new Date(n.createdAt).toLocaleString('uk-UA', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : ''}
                </time>
              </div>
              <h3 className="manager-notification-title">{n.title}</h3>
              <p className="manager-notification-body">{n.body}</p>
              {!n.read && (
                <button
                  type="button"
                  className="btn-notification-read"
                  onClick={() => markRead(n._id)}
                >
                  Позначити прочитаним
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ManagerNotificationsTab;
