import React, { useState } from 'react';
import './EquipmentDeleteModal.css';

function EquipmentDeleteModal({ equipment, onClose, onConfirm, bulkCount = 0 }) {
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState([]);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);

    if (!reason.trim()) {
      setErrors(['Причина видалення обов\'язкова']);
      return;
    }

    setDeleting(true);
    try {
      await onConfirm(reason.trim());
    } catch (error) {
      setErrors([error.message || 'Помилка видалення']);
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{bulkCount > 1 ? `🗑️ Видалити вибрані (${bulkCount})` : '🗑️ Видалити обладнання'}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="delete-modal-body">
          <div className="delete-warning">
            <p>
              {bulkCount > 1
                ? `Ви впевнені, що хочете видалити ${bulkCount} позицій зі складу?`
                : 'Ви впевнені, що хочете видалити це обладнання?'}
            </p>
            {bulkCount <= 1 && equipment && (
              <div className="equipment-info">
                <p><strong>Тип:</strong> {equipment.type || '—'}</p>
                <p><strong>Серійний номер:</strong> {equipment.serialNumber || '—'}</p>
                <p><strong>Склад:</strong> {equipment.currentWarehouseName || equipment.currentWarehouse || '—'}</p>
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
            <div className="form-group">
              <label>Причина видалення *</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={bulkCount > 1 ? 'Вкажіть причину масового видалення...' : 'Вкажіть причину видалення обладнання...'}
                rows="4"
                required
                disabled={deleting}
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={deleting}
              >
                Скасувати
              </button>
              <button
                type="submit"
                className="btn-danger"
                disabled={deleting}
              >
                {deleting ? 'Видалення...' : 'Видалити'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EquipmentDeleteModal;

