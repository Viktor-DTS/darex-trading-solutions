import React, { useEffect, useState } from 'react';
import AddTaskModal from '../AddTaskModal';
import { lookupRequestByNumber } from '../../utils/requestLookupAPI';
import './OneCRequestViewModal.css';

const SHIPMENT_STATUS_UA = {
  pending: 'Очікує',
  fulfilled: 'Виконано',
  cancelled: 'Скасовано',
};

const PROCUREMENT_STATUS_UA = {
  pending_review: 'Очікує розгляду',
  in_progress: 'В роботі',
  awaiting_warehouse: 'Очікує склад',
  partially_fulfilled: 'Частково виконано',
  completed: 'Завершено',
};

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('uk-UA');
  } catch {
    return '—';
  }
}

function SimpleRequestModal({ title, requestNumber, onClose, children }) {
  return (
    <div className="onec-req-view-overlay" onClick={onClose} role="presentation">
      <div
        className="onec-req-view-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onec-req-view-title"
      >
        <div className="onec-req-view-header">
          <h3 id="onec-req-view-title">
            {title} {requestNumber}
          </h3>
          <span className="onec-req-view-badge">Тільки перегляд</span>
          <button type="button" className="onec-req-view-close" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
        <div className="onec-req-view-body">{children}</div>
        <div className="onec-req-view-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

function ShipmentRequestView({ data }) {
  return (
    <dl className="onec-req-view-dl">
      <dt>Клієнт</dt>
      <dd>{data.clientName || '—'}</dd>
      <dt>Менеджер</dt>
      <dd>{data.managerName || data.managerLogin || '—'}</dd>
      <dt>Статус</dt>
      <dd>{SHIPMENT_STATUS_UA[data.status] || data.status || '—'}</dd>
      <dt>Дата відвантаження</dt>
      <dd>{fmtDate(data.plannedShipmentDate)}</dd>
      <dt>Адреса</dt>
      <dd>{data.shipmentAddress || '—'}</dd>
      <dt>Перевізник</dt>
      <dd>{data.carrier || '—'}</dd>
      <dt>Телефон водія</dt>
      <dd>{data.driverPhone || '—'}</dd>
      <dt>Тип ТЗ</dt>
      <dd>{data.vehicleType || '—'}</dd>
      <dt>Створено</dt>
      <dd>{fmtDate(data.createdAt)}</dd>
    </dl>
  );
}

function ProcurementRequestView({ data }) {
  return (
    <>
      <dl className="onec-req-view-dl">
        <dt>Заявник</dt>
        <dd>{data.requesterName || data.requesterLogin || '—'}</dd>
        <dt>Статус</dt>
        <dd>{PROCUREMENT_STATUS_UA[data.status] || data.status || '—'}</dd>
        <dt>Пріоритет</dt>
        <dd>{data.priority || '—'}</dd>
        <dt>Склад</dt>
        <dd>{data.desiredWarehouse || data.actualWarehouse || '—'}</dd>
        <dt>Виконавець</dt>
        <dd>{data.executorName || data.executorLogin || '—'}</dd>
        <dt>Створено</dt>
        <dd>{fmtDate(data.createdAt)}</dd>
      </dl>
      {Array.isArray(data.materials) && data.materials.length > 0 ? (
        <div className="onec-req-view-table-wrap">
          <table className="onec-req-view-table">
            <thead>
              <tr>
                <th>Номенклатура</th>
                <th>К-сть</th>
                <th>Од.</th>
              </tr>
            </thead>
            <tbody>
              {data.materials.map((m, i) => (
                <tr key={i}>
                  <td>{m.name || '—'}</td>
                  <td>{m.quantity != null ? m.quantity : '—'}</td>
                  <td>{m.unitOfMeasure || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export default function OneCRequestViewModal({ requestNumber, user, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setPayload(null);
      try {
        const res = await lookupRequestByNumber(requestNumber);
        if (!cancelled) setPayload(res);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Помилка завантаження');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestNumber]);

  if (payload?.type === 'task') {
    return (
      <AddTaskModal
        open
        onClose={onClose}
        user={user}
        initialData={payload.data}
        panelType="service"
        readOnly
      />
    );
  }

  if (loading) {
    return (
      <SimpleRequestModal title="Заявка" requestNumber={requestNumber} onClose={onClose}>
        <p className="onec-req-view-muted">Завантаження…</p>
      </SimpleRequestModal>
    );
  }

  if (error) {
    return (
      <SimpleRequestModal title="Заявка" requestNumber={requestNumber} onClose={onClose}>
        <p className="onec-req-view-error">{error}</p>
      </SimpleRequestModal>
    );
  }

  if (payload?.type === 'shipment_request') {
    return (
      <SimpleRequestModal title="Заявка на відвантаження" requestNumber={requestNumber} onClose={onClose}>
        <ShipmentRequestView data={payload.data} />
      </SimpleRequestModal>
    );
  }

  if (payload?.type === 'procurement_request') {
    return (
      <SimpleRequestModal title="Заявка закупівель" requestNumber={requestNumber} onClose={onClose}>
        <ProcurementRequestView data={payload.data} />
      </SimpleRequestModal>
    );
  }

  return (
    <SimpleRequestModal title="Заявка" requestNumber={requestNumber} onClose={onClose}>
      <p className="onec-req-view-muted">Заявку не знайдено</p>
    </SimpleRequestModal>
  );
}
