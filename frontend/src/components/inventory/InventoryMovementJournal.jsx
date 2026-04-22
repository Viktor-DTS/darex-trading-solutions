import React, { useState, useEffect, useCallback } from 'react';
import { getInventoryMovementLog } from '../../utils/inventoryMovementLogAPI';
import './InventoryMovementJournal.css';

const EVENT_LABELS = {
  shipment_request_submitted: 'Заявка на відвантаження',
  shipment_request_cancelled: 'Скасування заявки',
  shipment_out: 'Відвантаження зі складу',
  warehouse_move: 'Переміщення між складами',
  status_change: 'Зміна статусу',
  receipt_approved: 'Прийом на склад (з дороги)',
  goods_receipt: 'Надходження на склад',
  write_off: 'Списання',
  reservation_created: 'Резервування',
  reservation_cancelled: 'Скасування резерву',
  reserve_transferred: 'Передача резерву',
  receipt_document_completed: 'Документ надходження (завершено)',
  receipt_document_cancelled: 'Скасування документа надходження',
  movement_document_cancelled: 'Скасування документа переміщення',
  movement_document_completed: 'Документ переміщення (завершено)',
  testing_request_cancelled: 'Скасування заявки на тестування',
  testing_returned_for_retest: 'Повторне тестування',
  equipment_deleted: 'Видалення позиції'
};

function formatDt(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('uk-UA');
  } catch {
    return '—';
  }
}

/** Відображувані назви внутрішніх статусів обладнання в колонці «Статус». */
const INVENTORY_STATUS_DISPLAY = {
  in_stock: 'надходження на склад'
};

function formatMovementStatusValue(s) {
  if (s == null || s === '') return '—';
  return INVENTORY_STATUS_DISPLAY[s] || s;
}

export default function InventoryMovementJournal() {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [journalReadOnly, setJournalReadOnly] = useState(false);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 100;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getInventoryMovementLog({ skip, limit });
      setData({ rows: res.rows || [], total: res.total || 0 });
      setJournalReadOnly(Boolean(res.journalReadOnly));
    } catch (e) {
      setError(e.message || 'Помилка завантаження');
      setData({ rows: [], total: 0 });
      setJournalReadOnly(false);
    } finally {
      setLoading(false);
    }
  }, [skip]);

  useEffect(() => {
    load();
  }, [load]);

  const canPrev = skip > 0;
  const canNext = skip + limit < data.total;

  return (
    <div className="inventory-movement-journal">
      <div className="inventory-movement-journal-header">
        <h2>Журнал руху товару</h2>
        <p className="inventory-movement-journal-desc">
          Реєстрація надходжень (скан, документи), списань, резервів і їх скасувань, заявок на
          відвантаження та скасувань, відвантажень, переміщень (API та завершення документів
          переміщення), скасування таких документів і документів надходження, змін статусу, прийому з
          дороги та службових подій (тестування, видалення).
        </p>
        <div className="inventory-movement-journal-toolbar">
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            Оновити
          </button>
          <span className="inventory-movement-journal-count">
            Записів: {data.total}
            {loading ? ' …' : ''}
          </span>
        </div>
      </div>

      {error ? <div className="error-message">{error}</div> : null}

      {journalReadOnly ? (
        <p className="inventory-movement-journal-readonly" role="status">
          Повний журнал доступний лише для перегляду (усі регіони). Операції з товаром — лише на складах
          вашого регіону в інших розділах обліку.
        </p>
      ) : null}

      <div className="inventory-movement-table-wrap">
        <table className="inventory-movement-table">
          <thead>
            <tr>
              <th>Дата / час</th>
              <th>Подія</th>
              <th>Хто</th>
              <th>Обладнання</th>
              <th>К-сть</th>
              <th>С/н</th>
              <th>Статус</th>
              <th>Менеджер</th>
              <th>Клієнт / ЄДРПОУ</th>
              <th>Адреса / склад</th>
              <th>Примітки</th>
            </tr>
          </thead>
          <tbody>
            {loading && data.rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="inventory-movement-empty">
                  Завантаження…
                </td>
              </tr>
            ) : null}
            {!loading && data.rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="inventory-movement-empty">
                  Записів ще немає
                </td>
              </tr>
            ) : null}
            {data.rows.map((row) => (
              <tr key={row._id}>
                <td>{formatDt(row.occurredAt)}</td>
                <td>{EVENT_LABELS[row.eventType] || row.eventType}</td>
                <td>{row.performedByName || row.performedByLogin || '—'}</td>
                <td>{row.equipmentType || '—'}</td>
                <td>{row.quantity != null ? row.quantity : '—'}</td>
                <td>{row.serialNumber || '—'}</td>
                <td>
                  {formatMovementStatusValue(row.fromStatus)} → {formatMovementStatusValue(row.toStatus)}
                </td>
                <td>
                  {row.managerName || row.managerLogin
                    ? `${row.managerName || ''} ${row.managerLogin ? `(${row.managerLogin})` : ''}`.trim()
                    : '—'}
                </td>
                <td>
                  {[row.clientName, row.clientEdrpou].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="inventory-movement-cell-address">
                  {row.shipmentAddress ||
                    [row.sourceWarehouseName, row.destinationWarehouseName].filter(Boolean).join(' → ') ||
                    '—'}
                </td>
                <td className="inventory-movement-cell-notes">
                  {[row.shipmentRequestNumber, row.saleNumber, row.notes].filter(Boolean).join(' · ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="inventory-movement-pager">
        <button
          type="button"
          className="btn-secondary"
          disabled={!canPrev || loading}
          onClick={() => setSkip((s) => Math.max(0, s - limit))}
        >
          Попередня сторінка
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!canNext || loading}
          onClick={() => setSkip((s) => s + limit)}
        >
          Наступна сторінка
        </button>
      </div>
    </div>
  );
}
