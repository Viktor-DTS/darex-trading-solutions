import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import EquipmentFileUpload from './EquipmentFileUpload';
import './EquipmentMoveModal.css';

function EquipmentMoveModal({ equipment, warehouses, onClose, onSuccess }) {
  const [selectedEquipmentList, setSelectedEquipmentList] = useState(equipment ? [equipment] : []);
  const [equipmentList, setEquipmentList] = useState([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [showSelection, setShowSelection] = useState(!equipment);
  const [toWarehouse, setToWarehouse] = useState('');
  const [reason, setReason] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Завантаження списку обладнання, якщо не передано
  useEffect(() => {
    if (!equipment) {
      loadEquipment();
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

  const handleEquipmentToggle = (eq) => {
    setSelectedEquipmentList(prev => {
      const exists = prev.find(e => e._id === eq._id);
      if (exists) {
        return prev.filter(e => e._id !== eq._id);
      } else {
        return [...prev, eq];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedEquipmentList.length === equipmentList.length) {
      setSelectedEquipmentList([]);
    } else {
      setSelectedEquipmentList([...equipmentList]);
    }
  };

  // Якщо потрібно показати вибір обладнання
  if (showSelection) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content equipment-select-modal two-column-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>📦 Переміщення обладнання</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body two-column-body">
            {/* Ліва колонка - список обладнання */}
            <div className="equipment-selection-column">
              <h3>Доступне обладнання</h3>
              {loadingEquipment ? (
                <div className="loading-message">Завантаження...</div>
              ) : equipmentList.length === 0 ? (
                <div className="empty-message">Немає доступного обладнання</div>
              ) : (
                <>
                  <div className="select-all-controls">
                    <label className="select-all-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedEquipmentList.length === equipmentList.length && equipmentList.length > 0}
                        onChange={handleSelectAll}
                      />
                      <span>Вибрати все ({selectedEquipmentList.length}/{equipmentList.length})</span>
                    </label>
                  </div>
                  <div className="equipment-select-list">
                    {equipmentList.map(eq => (
                      <div
                        key={eq._id}
                        className={`equipment-select-item ${selectedEquipmentList.find(e => e._id === eq._id) ? 'selected' : ''}`}
                        onClick={() => handleEquipmentToggle(eq)}
                      >
                        <input
                          type="checkbox"
                          checked={!!selectedEquipmentList.find(e => e._id === eq._id)}
                          onChange={() => handleEquipmentToggle(eq)}
                          onClick={(e) => e.stopPropagation()}
                          className="equipment-checkbox"
                        />
                        <div className="equipment-select-info">
                          <strong>{eq.type || '—'}</strong>
                          <span>Серійний номер: {eq.serialNumber || '—'}</span>
                          <span>Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Права колонка - вибране обладнання */}
            <div className="selected-equipment-column">
              <h3>Вибране обладнання ({selectedEquipmentList.length})</h3>
              {selectedEquipmentList.length === 0 ? (
                <div className="empty-selection-message">
                  <p>Виберіть обладнання зі списку зліва</p>
                </div>
              ) : (
                <div className="selected-equipment-display-list">
                  {selectedEquipmentList.map(eq => (
                    <div key={eq._id} className="selected-equipment-display-item">
                      <button
                        className="remove-equipment-btn"
                        onClick={() => handleEquipmentToggle(eq)}
                        title="Видалити з вибраного"
                      >
                        ✕
                      </button>
                      <div className="selected-equipment-display-info">
                        <strong>{eq.type || '—'}</strong>
                        <span>Серійний номер: {eq.serialNumber || '—'}</span>
                        <span>Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Скасувати
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (selectedEquipmentList.length > 0) {
                  setShowSelection(false);
                } else {
                  setError('Виберіть хоча б одне обладнання');
                }
              }}
              disabled={selectedEquipmentList.length === 0}
            >
              Продовжити ({selectedEquipmentList.length})
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedEquipmentList.length === 0) {
      setError('Виберіть хоча б одне обладнання');
      return;
    }

    if (!toWarehouse) {
      setError('Виберіть склад призначення');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const warehouse = warehouses.find(w => w._id === toWarehouse || w.name === toWarehouse);
      const toWarehouseName = warehouse?.name || toWarehouse;
      
      // Обробляємо кожне вибране обладнання
      const results = await Promise.allSettled(
        selectedEquipmentList.map(eq =>
          fetch(`${API_BASE_URL}/equipment/${eq._id}/move`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              toWarehouse: toWarehouse,
              toWarehouseName: toWarehouseName,
              reason: reason,
              attachedFiles: attachedFiles.map(f => ({
                cloudinaryUrl: f.cloudinaryUrl,
                cloudinaryId: f.cloudinaryId,
                originalName: f.originalName,
                mimetype: f.mimetype,
                size: f.size
              }))
            })
          })
        )
      );

      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      
      if (failed.length === 0) {
        onSuccess && onSuccess();
        onClose();
      } else {
        const successCount = results.length - failed.length;
        setError(`Переміщено ${successCount} з ${results.length}. Деякі операції не вдалися.`);
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
            <p><strong>Вибрано обладнання:</strong> {selectedEquipmentList.length} шт.</p>
            <div className="selected-equipment-list">
              {selectedEquipmentList.map(eq => (
                <div key={eq._id} className="selected-equipment-item">
                  <span><strong>{eq.type || '—'}</strong> (Серійний номер: {eq.serialNumber || '—'})</span>
                  <span>Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {!equipment && (
            <div className="form-group">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowSelection(true)}
                style={{ marginBottom: '12px' }}
              >
                ← Змінити вибір обладнання
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
                    // Фільтруємо склади, які не є поточними для жодного з вибраних обладнань
                    return !selectedEquipmentList.some(eq => {
                      const currentWarehouse = eq.currentWarehouse || eq.currentWarehouseName;
                      return (w._id === currentWarehouse || w.name === currentWarehouse);
                    });
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

            <div className="form-group">
              <label>Документи та фото</label>
              <EquipmentFileUpload
                onFilesChange={setAttachedFiles}
                uploadedFiles={attachedFiles}
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

