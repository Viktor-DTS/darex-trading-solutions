import React, { useCallback, useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import './WarehouseTransferInbox.css';

export default function WarehouseTransferInbox({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [rejectId, setRejectId] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/warehouse-transfer-requests?inbox=1`, {
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
    loadInbox();
  }, [loadInbox]);

  const approve = async (id) => {
    setBusyId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/warehouse-transfer-requests/${id}/approve`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Помилка підтвердження');
      await loadInbox();
    } catch (e) {
      alert(e.message || 'Помилка');
    } finally {
      setBusyId('');
    }
  };

  const reject = async (id) => {
    const reason = String(rejectReason || '').trim();
    if (!reason) {
      alert('Вкажіть причину відмови');
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/warehouse-transfer-requests/${id}/reject`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Помилка відхилення');
      setRejectId('');
      setRejectReason('');
      await loadInbox();
    } catch (e) {
      alert(e.message || 'Помилка');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="warehouse-transfer-inbox">
      <div className="warehouse-transfer-inbox-head">
        <h2>Запити на переміщення (сервіс)</h2>
        <button type="button" onClick={loadInbox}>
          Оновити
        </button>
      </div>
      <p className="warehouse-transfer-inbox-note">
        Підтвердіть або відхиліть запит. Після підтвердження переміщення оформлюється в 1С і з’явиться в
        журналі автоматично.
      </p>
      {loading ? (
        <p>Завантаження…</p>
      ) : !items.length ? (
        <p>Немає очікуючих запитів.</p>
      ) : (
        <div className="warehouse-transfer-inbox-list">
          {items.map((row) => (
            <article key={row._id} className="warehouse-transfer-inbox-card">
              <header>
                <strong>{row.requestNumber}</strong>
                <span>{row.createdAt ? new Date(row.createdAt).toLocaleString('uk-UA') : ''}</span>
              </header>
              <p>
                <strong>{row.nomenclature}</strong> — {row.quantity} {row.unitOfMeasure || 'шт.'}
              </p>
              <p>
                {row.fromWarehouseName} → {row.toWarehouseName}
              </p>
              <p>
                Ініціатор: {row.requesterName || row.requesterLogin || '—'}
                {row.taskNumber ? ` · Заявка ${row.taskNumber}` : ''}
              </p>
              {row.comment ? <p className="warehouse-transfer-comment">{row.comment}</p> : null}
              {rejectId === row._id ? (
                <div className="warehouse-transfer-reject-box">
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Причина відмови"
                  />
                  <div className="warehouse-transfer-actions">
                    <button type="button" onClick={() => reject(row._id)} disabled={busyId === row._id}>
                      Підтвердити відмову
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setRejectId('');
                        setRejectReason('');
                      }}
                    >
                      Скасувати
                    </button>
                  </div>
                </div>
              ) : (
                <div className="warehouse-transfer-actions">
                  <button type="button" onClick={() => approve(row._id)} disabled={busyId === row._id}>
                    Підтвердити
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setRejectId(row._id);
                      setRejectReason('');
                    }}
                    disabled={busyId === row._id}
                  >
                    Відхилити
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
