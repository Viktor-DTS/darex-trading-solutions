import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './EquipmentMoveModal.css';

function EquipmentMoveModal({ equipment, warehouses, onClose, onSuccess }) {
  const [selectedEquipment, setSelectedEquipment] = useState(equipment);
  const [equipmentList, setEquipmentList] = useState([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [toWarehouse, setToWarehouse] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Завантаження списку обладнання, якщо не передано
  useEffect(() => {
    if (!equipment) {
      loadEquipment();
    } else {
      setSelectedEquipment(equipment);
    }
  }, [equipment]);

  const loadEquipment = async () => {
    setLoadingEquipment(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment?status=in_stock`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setEquipmentList(data.filter(eq => !eq.deleted));
      }
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    } finally {
      setLoadingEquipment(false);
    }
  };

  // Якщо обладнання не вибрано - показуємо список для вибору
  if (!selectedEquipment) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content equipment-select-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>📦 Переміщення обладнання</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            <p>Будь ласка, виберіть обладнання для переміщення:</p>
            {loadingEquipment ? (
              <div className="loading-message">Завантаження...</div>
            ) : equipmentList.length === 0 ? (
              <div className="empty-message">Немає доступного обладнання</div>
            ) : (
              <div className="equipment-select-list">
                {equipmentList.map(eq => (
                  <div
                    key={eq._id}
                    className="equipment-select-item"
                    onClick={() => setSelectedEquipment(eq)}
                  >
                    <div className="equipment-select-info">
                      <strong>{eq.type || '—'}</strong>
                      <span>Серійний номер: {eq.serialNumber || '—'}</span>
                      <span>Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Скасувати
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
      
      const response = await fetch(`${API_BASE_URL}/equipment/${selectedEquipment._id}/move`, {
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
            <p><strong>Тип:</strong> {selectedEquipment.type || '—'}</p>
            <p><strong>Серійний номер:</strong> {selectedEquipment.serialNumber || '—'}</p>
            <p><strong>Поточний склад:</strong> {selectedEquipment.currentWarehouseName || selectedEquipment.currentWarehouse || '—'}</p>
          </div>

          {!equipment && (
            <div className="form-group">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedEquipment(null)}
                style={{ marginBottom: '12px' }}
              >
                ← Вибрати інше обладнання
              </button>
            </div>
          )}

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
                  .filter(w => {
                    const currentWarehouse = selectedEquipment.currentWarehouse || selectedEquipment.currentWarehouseName;
                    return (w._id !== currentWarehouse && w.name !== currentWarehouse);
                  })
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

