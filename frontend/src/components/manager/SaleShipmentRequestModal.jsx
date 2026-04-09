import React, { useState, useEffect, useMemo } from 'react';
import {
  getShipmentRequestPreviewNumber,
  submitSaleShipmentRequest
} from '../../utils/shipmentRequestAPI';
import './SaleShipmentRequestModal.css';

/**
 * Запит на відвантаження з угоди: ліва колонка — реквізити, права — вибір позицій обладнання.
 */
function SaleShipmentRequestModal({
  open,
  onClose,
  saleId,
  equipmentItems = [],
  initialShipmentAddress = '',
  onSuccess
}) {
  const [previewNumber, setPreviewNumber] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [shipmentAddress, setShipmentAddress] = useState('');
  const [carrier, setCarrier] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [ttnFile, setTtnFile] = useState(null);
  const [selectedLineIds, setSelectedLineIds] = useState(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showLockConfirm, setShowLockConfirm] = useState(false);

  const selectableRows = useMemo(
    () =>
      equipmentItems.filter((i) => i.equipmentId && !i.shipmentLocked),
    [equipmentItems]
  );

  const itemsSig = useMemo(
    () =>
      equipmentItems
        .map((i) => `${i.lineId || i.id || ''}:${i.equipmentId || ''}:${i.shipmentLocked ? 1 : 0}`)
        .join('|'),
    [equipmentItems]
  );

  useEffect(() => {
    if (!open) return;
    setShowLockConfirm(false);
    setError('');
    setCarrier('');
    setDriverPhone('');
    setVehicleType('');
    setTtnFile(null);
    setPlannedDate('');
    getShipmentRequestPreviewNumber()
      .then(setPreviewNumber)
      .catch(() => setPreviewNumber('SV-…'));
  }, [open, saleId, initialShipmentAddress]);

  useEffect(() => {
    if (!open) return;
    const rows = equipmentItems.filter((i) => i.equipmentId && !i.shipmentLocked);
    setSelectedLineIds(
      new Set(rows.map((i) => String(i.lineId || i.id)).filter(Boolean))
    );
  }, [open, itemsSig]);

  const toggleLine = (lineKey) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineKey)) next.delete(lineKey);
      else next.add(lineKey);
      return next;
    });
  };

  const validateBeforeConfirm = () => {
    if (!plannedDate.trim()) return "Вкажіть заплановану дату відвантаження";
    if (!shipmentAddress.trim()) return 'Вкажіть адресу відвантаження';
    if (!carrier.trim()) return 'Вкажіть перевізника';
    if (!driverPhone.trim()) return 'Вкажіть контактний номер водія';
    const lineIds = [...selectedLineIds];
    if (lineIds.length === 0) return 'Оберіть хоча б одну позицію обладнання';
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const validationError = validateBeforeConfirm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setShowLockConfirm(true);
  };

  const handleCancelLockConfirm = () => {
    if (submitting) return;
    setShowLockConfirm(false);
  };

  const handleConfirmSubmit = async () => {
    const validationError = validateBeforeConfirm();
    if (validationError) {
      setError(validationError);
      setShowLockConfirm(false);
      return;
    }
    const lineIds = [...selectedLineIds];
    setSubmitting(true);
    setError('');
    try {
      await submitSaleShipmentRequest(saleId, {
        lineIds,
        plannedShipmentDate: plannedDate,
        shipmentAddress: shipmentAddress.trim(),
        carrier: carrier.trim(),
        driverPhone: driverPhone.trim(),
        vehicleType: vehicleType.trim()
      }, ttnFile);
      setShowLockConfirm(false);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Помилка відправки');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-overlay sale-shipment-overlay"
      onClick={() => {
        if (showLockConfirm) handleCancelLockConfirm();
        else onClose?.();
      }}
    >
      <div
        className="modal-content sale-shipment-modal sale-shipment-modal-root"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Запит на відвантаження товару</h3>
          <button type="button" className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="sale-shipment-split">
            <div className="sale-shipment-left">
              <div className="form-group">
                <label>Номер заявки на відвантаження</label>
                <input type="text" value={previewNumber} readOnly className="field-readonly" />
                <span className="sale-shipment-hint">Остаточний номер присвоюється після відправки (SV-#####)</span>
              </div>
              <div className="form-group">
                <label>Запланована дата відвантаження *</label>
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Адреса відвантаження *</label>
                <textarea
                  value={shipmentAddress}
                  onChange={(e) => setShipmentAddress(e.target.value)}
                  rows={3}
                  placeholder="Повна адреса відвантаження товару"
                  required
                />
              </div>
              <div className="form-group">
                <label>Вказати перевізника *</label>
                <textarea
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  rows={5}
                  placeholder="Назва перевізника, контакти, умови…"
                  required
                />
              </div>
              <div className="form-group">
                <label>Контактний номер водія *</label>
                <input
                  type="text"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Тип / модель транспортного засобу</label>
                <input
                  type="text"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>ТТН (файл)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => setTtnFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div className="sale-shipment-right">
              <label className="sale-shipment-right-title">Обладнання в угоді</label>
              <p className="sale-shipment-hint">За замовчуванням усі доступні позиції обрані. Зніміть галочку для часткового відвантаження.</p>
              <ul className="sale-shipment-equipment-list">
                {selectableRows.length === 0 ? (
                  <li className="sale-shipment-empty">Немає позицій зі складу для запиту (або всі вже подані).</li>
                ) : (
                  selectableRows.map((row) => {
                    const lineKey = String(row.lineId || row.id || '');
                    if (!lineKey) return null;
                    return (
                      <li key={lineKey}>
                        <label className="sale-shipment-check-row">
                          <input
                            type="checkbox"
                            checked={selectedLineIds.has(lineKey)}
                            onChange={() => toggleLine(lineKey)}
                          />
                          <span>
                            <strong>{row.type || '—'}</strong>
                            {row.serialNumber ? ` · с/н ${row.serialNumber}` : ''}
                            {row.amount ? ` · ${Number(row.amount).toLocaleString('uk-UA')} ₴` : ''}
                          </span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
          {error ? <div className="error-message sale-shipment-error">{error}</div> : null}
          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={submitting}>
              Скасувати
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || selectableRows.length === 0}>
              Подати заявку
            </button>
          </div>
        </form>
        {showLockConfirm ? (
          <div
            className="sale-shipment-lock-confirm-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-shipment-lock-confirm-title"
            onClick={handleCancelLockConfirm}
          >
            <div
              className="sale-shipment-lock-confirm-box"
              onClick={(ev) => ev.stopPropagation()}
            >
              <h4 id="sale-shipment-lock-confirm-title" className="sale-shipment-lock-confirm-title">
                Підтвердження подачі заявки
              </h4>
              <p className="sale-shipment-lock-confirm-lead">
                Після відправки для <strong>обраних у цій заявці позицій обладнання</strong> у таблиці угоди буде
                застосовано блокування: <strong>їх не можна буде редагувати чи видаляти</strong> (доки склад не
                завершить відвантаження за внутрішньою процедурою).
              </p>
              <p className="sale-shipment-lock-confirm-sub">Недоступно для заблокованих рядків:</p>
              <ul className="sale-shipment-lock-confirm-list">
                <li>зміна обладнання зі складу — кнопки «Обрати…» та «Очистити»;</li>
                <li>редагування суми — поле «Сума (₴)»;</li>
                <li>видалення рядка — кнопка «✕» у колонці дій.</li>
              </ul>
              <p className="sale-shipment-lock-confirm-note">
                Серійний номер і найменування відображаються як довідково й також не змінюються через заблоковані дії
                вище.
              </p>
              <div className="modal-footer sale-shipment-lock-confirm-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={handleCancelLockConfirm}
                  disabled={submitting}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirmSubmit}
                  disabled={submitting}
                >
                  {submitting ? 'Відправка…' : 'Підтверджую, подати заявку'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SaleShipmentRequestModal;
