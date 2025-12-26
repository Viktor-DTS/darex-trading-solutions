import React, { useState } from 'react';
import './EquipmentWriteOffModal.css';

function EquipmentWriteOffModal({ equipment, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [errors, setErrors] = useState([]);
  const [writingOff, setWritingOff] = useState(false);

  const isQuantityBased = !equipment.batchId && (!equipment.serialNumber || equipment.serialNumber.trim() === '') && (equipment.quantity || 1) > 1;
  const maxQuantity = equipment.quantity || 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);

    if (!reason.trim()) {
      setErrors(['Причина списання обов\'язкова']);
      return;
    }

    if (isQuantityBased && (quantity < 1 || quantity > maxQuantity)) {
      setErrors([`Кількість повинна бути від 1 до ${maxQuantity}`]);
      return;
    }

    setWritingOff(true);
    try {
      await onConfirm(reason.trim(), notes.trim(), isQuantityBased ? quantity : 1);
    } catch (error) {
      setErrors([error.message || 'Помилка списання']);
      setWritingOff(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content write-off-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📝 Списання обладнання</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="write-off-modal-body">
          <div className="write-off-info">
            <p>Ви впевнені, що хочете списати це обладнання?</p>
            {equipment && (
              <div className="equipment-info">
                <p><strong>Тип:</strong> {equipment.type || '—'}</p>
                {equipment.serialNumber && equipment.serialNumber.trim() !== '' && (
                  <p><strong>Серійний номер:</strong> {equipment.serialNumber}</p>
                )}
                <p><strong>Склад:</strong> {equipment.currentWarehouseName || equipment.currentWarehouse || '—'}</p>
                {isQuantityBased && (
                  <p><strong>Доступно на складі:</strong> {maxQuantity} шт.</p>
                )}
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <div className="errors">
              {errors.map((err, i) => (
                <div key={i} className="error-message">{err}</div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {isQuantityBased && (
              <div className="form-group">
                <label>Кількість для списання *</label>
                <input
                  type="number"
                  min="1"
                  max={maxQuantity}
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setQuantity(Math.max(1, Math.min(val, maxQuantity)));
                  }}
                  required
                  disabled={writingOff}
                  style={{ width: '100%', padding: '8px', marginTop: '8px' }}
                />
                <div style={{ marginTop: '8px', fontSize: '0.9em', color: '#666' }}>
                  Доступно на складі: <strong>{maxQuantity} шт.</strong>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Причина списання *</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Вкажіть причину списання обладнання..."
                rows="4"
                required
                disabled={writingOff}
              />
            </div>

            <div className="form-group">
              <label>Примітки (необов'язково)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Додаткові примітки..."
                rows="3"
                disabled={writingOff}
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={writingOff}
              >
                Скасувати
              </button>
              <button
                type="submit"
                className="btn-warning"
                disabled={writingOff}
              >
                {writingOff ? 'Списання...' : 'Списати'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EquipmentWriteOffModal;

