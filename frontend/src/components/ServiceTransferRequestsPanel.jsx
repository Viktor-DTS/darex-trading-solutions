import React, { useCallback, useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import './ServiceTransferRequestsPanel.css';

const STATUS_LABELS = {
  pending: 'Активний · очікує відправки',
  approved: 'Активний · відправлено',
  completed: 'Виконано',
  rejected: 'Відхилено',
  cancelled: 'Скасовано',
};

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('uk-UA');
}

export default function ServiceTransferRequestsPanel({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = ['admin', 'administrator'].includes(String(user?.role || '').toLowerCase());

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/warehouse-transfer-requests?service=1`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  return (
    <div className="service-transfer-requests">
      <div className="service-transfer-requests-head">
        <div>
          <h1>Запити на переміщення</h1>
          <p>
            {isAdmin
              ? 'Адміністратор бачить усі запити. Спочатку активні, далі від новіших до старіших.'
              : 'Показані лише ваші запити. Спочатку активні, далі від новіших до старіших.'}
          </p>
        </div>
        <button type="button" onClick={loadList}>
          Оновити
        </button>
      </div>

      {loading ? (
        <p className="service-transfer-empty">Завантаження…</p>
      ) : !items.length ? (
        <p className="service-transfer-empty">Запитів на переміщення немає.</p>
      ) : (
        <div className="service-transfer-list">
          {items.map((row) => (
            <article
              key={row._id}
              className={`service-transfer-card is-${row.status || 'pending'}`}
            >
              <header>
                <strong>{row.requestNumber || '—'}</strong>
                <span className={`service-transfer-status is-${row.status || 'pending'}`}>
                  {STATUS_LABELS[row.status] || row.status || '—'}
                </span>
              </header>
              <p className="service-transfer-line">
                <small>Дата подачі</small>
                <b>{formatDateTime(row.createdAt) || '—'}</b>
              </p>
              <p className="service-transfer-line">
                <small>Найменування</small>
                <b>
                  {row.nomenclature || '—'}
                  {row.quantity != null ? ` · ${row.quantity} ${row.unitOfMeasure || 'шт.'}` : ''}
                </b>
              </p>
              <p className="service-transfer-line">
                <small>Маршрут</small>
                <b>
                  {row.fromWarehouseName || '—'} → {row.toWarehouseName || '—'}
                </b>
              </p>
              {isAdmin ? (
                <p className="service-transfer-line">
                  <small>Ініціатор</small>
                  <b>{row.requesterName || row.requesterLogin || '—'}</b>
                </p>
              ) : null}
              {row.taskNumber ? (
                <p className="service-transfer-line">
                  <small>Заявка</small>
                  <b>{row.taskNumber}</b>
                </p>
              ) : null}
              <p className="service-transfer-line">
                <small>Відправив товар</small>
                <b>
                  {row.sourceApprovedAt
                    ? `${row.sourceApproverName || row.sourceApproverLogin || 'Завсклад'} · ${formatDateTime(row.sourceApprovedAt)}`
                    : 'Ще не відправлено'}
                </b>
              </p>
              {row.status === 'completed' ? (
                <p className="service-transfer-line">
                  <small>Підтвердив прийом</small>
                  <b>
                    {row.destApproverName || row.destApproverLogin || 'Завсклад отримувача'}
                    {row.destReceivedAt ? ` · ${formatDateTime(row.destReceivedAt)}` : ''}
                  </b>
                </p>
              ) : null}
              {row.status === 'rejected' && row.sourceRejectReason ? (
                <p className="service-transfer-line">
                  <small>Причина відмови</small>
                  <b>{row.sourceRejectReason}</b>
                </p>
              ) : null}
              {row.comment ? (
                <p className="service-transfer-comment">{row.comment}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
