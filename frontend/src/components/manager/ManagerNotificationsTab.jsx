import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API_BASE_URL from '../../config';
import './ManagerNotificationsTab.css';

const KIND_LABELS = {
  reservation_3d: 'Нагадування',
  reservation_1d: 'Нагадування',
  reservation_released_auto: 'Авто-зняття резерву',
  reservation_released_admin: 'Зняття резерву',
  task_invoice_uploaded: 'Рахунок по заявці',
  task_wh_approved: 'Затверджено завскладом',
  task_wh_rejected: 'Відхилено завскладом',
  task_accountant_approved: 'Затверджено бухгалтером',
  task_accountant_rejected: 'Відхилено бухгалтером',
  task_new: 'Нова заявка',
  shipment_request_new: 'Запит на відвантаження',
  procurement_incoming_to_warehouse: 'Надходження на склад (закупівлі)',
  procurement_receipt_partial: 'Частковий прийом / заявка не повністю',
  procurement_request_new: 'Нова заявка (для виконавців)',
  procurement_request_completed: 'Заявку виконано (для заявника)'
};

function notificationTaskId(n) {
  if (!n?.taskId) return null;
  const id = n.taskId;
  if (typeof id === 'string') return id;
  if (id && typeof id === 'object' && id.$oid) return id.$oid;
  return String(id);
}

function notificationProcurementId(n) {
  if (!n?.procurementRequestId) return null;
  const id = n.procurementRequestId;
  if (typeof id === 'string') return id;
  if (id && typeof id === 'object' && id.$oid) return id.$oid;
  if (id && typeof id === 'object' && id._id) return String(id._id);
  return String(id);
}

const DEFAULT_DESCRIPTION =
  'Персональні сповіщення для вашого облікового запису: нагадування про резерви, події по заявках регіону (рахунок, затвердження або відмова завскладом і бухгалтерією).';

function ManagerNotificationsTab({
  onUnreadCountChange,
  onOpenTask,
  onOpenShipmentRequest,
  onOpenProcurementRequest,
  description = DEFAULT_DESCRIPTION,
  globalFeed = false,
  /** Лише сповіщення модуля закупівель (частковий прийом, надходження) — без резервів і заявок менеджерів */
  procurementOnly = false,
  /** Приховати сповіщення по заявках закупівель (VZ) — для панелі менеджерів; не поєднуйте з procurementOnly */
  excludeProcurement = false,
  /** Для сервісу: приховати лише «складські» VZ-сповіщення; «Заявку виконано» лишається заявнику/адмінам */
  excludeProcurementServiceFeed = false,
  title = 'Системні сповіщення'
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const scopeQs = useMemo(() => {
    const p = new URLSearchParams();
    if (globalFeed) p.set('serviceGlobal', '1');
    if (procurementOnly) p.set('procurement', '1');
    else if (excludeProcurement) p.set('excludeProcurement', '1');
    else if (excludeProcurementServiceFeed) p.set('excludeProcurementServiceFeed', '1');
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [globalFeed, procurementOnly, excludeProcurement, excludeProcurementServiceFeed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/manager-notifications${scopeQs}`, {
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
  }, [onUnreadCountChange, scopeQs]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/manager-notifications/${id}/read${scopeQs}`, {
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
      const res = await fetch(`${API_BASE_URL}/manager-notifications/mark-all-read${scopeQs}`, {
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
        <h2>{title}</h2>
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
      {description ? <p className="manager-notifications-desc">{description}</p> : null}

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
                <span className="manager-notification-kind-wrap">
                  <span className="manager-notification-kind">{KIND_LABELS[n.kind] || n.kind}</span>
                </span>
                <span className="manager-notification-meta-right">
                  {(() => {
                    const pid = notificationProcurementId(n);
                    const tid = notificationTaskId(n);
                    const rn = n.requestNumber && String(n.requestNumber).trim();
                    if (pid && onOpenProcurementRequest) {
                      return (
                        <button
                          type="button"
                          className="manager-notification-request-link"
                          onClick={() => {
                            markRead(n._id);
                            onOpenProcurementRequest(pid);
                          }}
                        >
                          № {rn || 'Заявка'}
                        </button>
                      );
                    }
                    if (tid && onOpenTask) {
                      return (
                        <button
                          type="button"
                          className="manager-notification-request-link"
                          onClick={() => onOpenTask(tid)}
                        >
                          № {rn || 'Заявка'}
                        </button>
                      );
                    }
                    if (rn) {
                      return <span className="manager-notification-request-static">№ {rn}</span>;
                    }
                    return null;
                  })()}
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
                </span>
              </div>
              <h3 className="manager-notification-title">{n.title}</h3>
              <p className="manager-notification-body">{n.body}</p>
              {n.kind === 'shipment_request_new' && onOpenShipmentRequest && n.shipmentRequestId ? (
                <button
                  type="button"
                  className="btn-primary btn-notification-shipment"
                  style={{ marginTop: 8, marginBottom: 8 }}
                  onClick={() => {
                    markRead(n._id);
                    onOpenShipmentRequest(n);
                  }}
                >
                  Відкрити відвантаження
                </button>
              ) : null}
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
