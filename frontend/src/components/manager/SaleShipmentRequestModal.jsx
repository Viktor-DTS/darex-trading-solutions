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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!plannedDate.trim()) {
      setError("Вкажіть заплановану дату відвантаження");
      return;
    }
    if (!shipmentAddress.trim()) {
      setError('Вкажіть адресу відвантаження');
      return;
    }
    if (!carrier.trim()) {
      setError('Вкажіть перевізника');
      return;
    }
    if (!driverPhone.trim()) {
      setError('Вкажіть контактний номер водія');
      return;
    }
    const lineIds = [...selectedLineIds];
    if (lineIds.length === 0) {
      setError('Оберіть хоча б одну позицію обладнання');
      return;
    }
    setSubmitting(true);
    try {
      await submitSaleShipmentRequest(saleId, {
        lineIds,
        plannedShipmentDate: plannedDate,
        shipmentAddress: shipmentAddress.trim(),
        carrier: carrier.trim(),
        driverPhone: driverPhone.trim(),
        vehicleType: vehicleType.trim()
      }, ttnFile);
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
    <div className="modal-overlay sale-shipment-overlay" onClick={onClose}>
      <div className="modal-content sale-shipment-modal" onClick={(ev) => ev.stopPropagation()}>
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
              {submitting ? 'Відправка…' : 'Подати заявку'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SaleShipmentRequestModal;
