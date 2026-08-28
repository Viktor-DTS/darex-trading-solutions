import React, { useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import { buildServiceWarehouseSelectOptions } from '../utils/serviceWarehouseOptions';
import './WarehouseTransferRequestModal.css';

export default function WarehouseTransferRequestModal({
  open,
  onClose,
  user,
  authHeaders,
  warehouses = [],
  initial = null,
  task = null,
  onSuccess,
}) {
  const [quantity, setQuantity] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const targetOptions = useMemo(
    () =>
      buildServiceWarehouseSelectOptions(warehouses, user?.region).filter(
        (w) => w.warehouseName !== initial?.fromWarehouseName,
      ),
    [warehouses, user?.region, initial?.fromWarehouseName],
  );

  React.useEffect(() => {
    if (!open) return;
    setQuantity(initial?.availableQty ? String(initial.availableQty) : '1');
    setToWarehouseId(targetOptions[0]?.value || '');
    setComment('');
    setError('');
  }, [open, initial, targetOptions]);

  if (!open || !initial) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const qty = Number(String(quantity).replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Вкажіть коректну кількість');
      return;
    }
    const toWh = targetOptions.find((w) => w.value === toWarehouseId);
    if (!toWh) {
      setError('Оберіть склад-отримувач');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/warehouse-transfer-requests`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomenclature: initial.label,
          productId: initial.productId || undefined,
          quantity: qty,
          fromWarehouseId: initial.fromWarehouseId || undefined,
          fromWarehouseName: initial.fromWarehouseName,
          toWarehouseId: toWh.warehouseId,
          toWarehouseName: toWh.warehouseName,
          comment: comment.trim(),
          taskId: task?._id || task?.id || undefined,
          taskNumber: task?.requestNumber || task?.taskNumber || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не вдалося створити запит');
      onSuccess?.(data);
      onClose?.();
    } catch (err) {
      setError(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wtr-modal-overlay" onClick={() => !saving && onClose?.()}>
      <div className="wtr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wtr-modal-header">
          <h2>Запит на переміщення</h2>
          <button type="button" className="wtr-modal-close" onClick={() => !saving && onClose?.()}>
            ×
          </button>
        </div>
        <form className="wtr-modal-body" onSubmit={handleSubmit}>
          <p className="wtr-meta">
            <strong>Номенклатура:</strong> {initial.label}
          </p>
          <p className="wtr-meta">
            <strong>Зі складу:</strong> {initial.fromWarehouseName}
            {initial.availableQty > 0 ? ` (доступно: ${initial.availableQty})` : ''}
          </p>
          {task?.requestNumber ? (
            <p className="wtr-meta">
              <strong>Заявка:</strong> {task.requestNumber}
            </p>
          ) : null}
          <label className="wtr-field">
            <span>Кількість</span>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="wtr-field">
            <span>На склад (ваш регіон)</span>
            <select
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
              disabled={saving || !targetOptions.length}
            >
              {!targetOptions.length ? <option value="">Немає доступних складів</option> : null}
              {targetOptions.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <label className="wtr-field">
            <span>Коментар</span>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Для чого потрібне переміщення (наприклад, заявка DP-…)"
              disabled={saving}
            />
          </label>
          {error ? <p className="wtr-error">{error}</p> : null}
          <p className="wtr-hint">
            Після підтвердження завскладом джерела переміщення оформлюється в 1С і з’явиться в системі
            автоматично.
          </p>
          <div className="wtr-actions">
            <button type="button" className="wtr-btn-secondary" onClick={() => onClose?.()} disabled={saving}>
              Скасувати
            </button>
            <button type="submit" className="wtr-btn-primary" disabled={saving || !targetOptions.length}>
              {saving ? 'Надсилання…' : 'Надіслати запит'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
