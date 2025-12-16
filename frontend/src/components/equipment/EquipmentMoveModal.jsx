import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './EquipmentMoveModal.css';

function EquipmentMoveModal({ equipment, warehouses, onClose, onSuccess }) {
  const [toWarehouse, setToWarehouse] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!toWarehouse) {
      setError('Виберіть склад призначення');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const warehouse = warehouses.find(w => w._id === toWarehouse || w.name === toWarehouse);
      
      const response = await fetch(`${API_BASE_URL}/equipment/${equipment._id}/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          toWarehouse: toWarehouse,
          toWarehouseName: warehouse?.name || toWarehouse,
          reason: reason
        })
      });

      if (response.ok) {
        onSuccess && onSuccess();
        onClose();
      } else {
        const data = await response.json();
        setError(data.error || 'Помилка переміщення');
      }
    } catch (error) {
      console.error('Помилка переміщення:', error);
      setError('Помилка переміщення обладнання');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📦 Переміщення обладнання</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="equipment-info">
            <p><strong>Тип:</strong> {equipment.type}</p>
            <p><strong>Серійний номер:</strong> {equipment.serialNumber}</p>
            <p><strong>Поточний склад:</strong> {equipment.currentWarehouseName || equipment.currentWarehouse}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Склад призначення *</label>
              <select
                value={toWarehouse}
                onChange={(e) => setToWarehouse(e.target.value)}
                required
              >
                <option value="">Виберіть склад</option>
                {warehouses
                  .filter(w => w._id !== equipment.currentWarehouse && w.name !== equipment.currentWarehouse)
                  .map(w => (
                    <option key={w._id || w.name} value={w._id || w.name}>
                      {w.name} {w.region ? `(${w.region})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label>Причина переміщення</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Вкажіть причину переміщення (необов'язково)"
                rows="3"
              />
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Скасувати
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Переміщення...' : 'Перемістити'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EquipmentMoveModal;

