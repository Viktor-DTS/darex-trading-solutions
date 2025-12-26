import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../../config';
import EquipmentFileUpload from './EquipmentFileUpload';
import './EquipmentWriteOffModal.css';

function EquipmentWriteOffModal({ equipment, warehouses, onClose, onSuccess }) {
  const [selectedEquipmentList, setSelectedEquipmentList] = useState(equipment ? [equipment] : []);
  const [equipmentList, setEquipmentList] = useState([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [showSelection, setShowSelection] = useState(!equipment);
  const [searchQuery, setSearchQuery] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showBatchQuantityModal, setShowBatchQuantityModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchQuantity, setBatchQuantity] = useState(1);
  const [batchQuantities, setBatchQuantities] = useState({}); // { batchId-warehouse: quantity }
  const [quantityBasedQuantities, setQuantityBasedQuantities] = useState({}); // { equipmentId: quantity } для обладнання без серійного номера

  // Завантаження списку обладнання, якщо не передано
  useEffect(() => {
    if (!equipment) {
      loadEquipment();
    } else {
      // Ініціалізуємо кількість для обладнання без серійного номера
      const isQuantityBased = !equipment.batchId && (!equipment.serialNumber || equipment.serialNumber.trim() === '') && equipment.quantity > 1;
      if (isQuantityBased) {
        setQuantityBasedQuantities(prev => ({
          ...prev,
          [equipment._id]: equipment.quantity || 1
        }));
      }
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
        // Фільтруємо тільки обладнання на складі (не списане, не видалене)
        setEquipmentList(data.filter(eq => !eq.deleted && eq.status !== 'written_off' && eq.status !== 'deleted'));
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

  // Групування обладнання за batchId та складом
  const groupedEquipment = useMemo(() => {
    const groups = {};
    const singleItems = [];
    
    equipmentList.forEach(eq => {
      // Обладнання з batchId (стара логіка партій)
      if (eq.isBatch && eq.batchId && eq.status === 'in_stock') {
        const key = `${eq.batchId}-${eq.currentWarehouse || eq.currentWarehouseName}`;
        if (!groups[key]) {
          groups[key] = {
            ...eq,
            _id: `batch-${key}`,
            batchItems: [],
            batchCount: 0
          };
        }
        groups[key].batchItems.push(eq);
        groups[key].batchCount++;
      } 
      // Обладнання без серійного номера з quantity > 1 (нова логіка)
      else if ((!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1 && eq.status === 'in_stock') {
        singleItems.push(eq);
      } 
      // Звичайне одиничне обладнання
      else {
        singleItems.push(eq);
      }
    });
    
    return [...Object.values(groups), ...singleItems];
  }, [equipmentList]);

  // Фільтрація обладнання за пошуковим запитом
  const filteredEquipmentList = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedEquipment;
    }
    
    const query = searchQuery.toLowerCase();
    return groupedEquipment.filter(eq => {
      const type = (eq.type || '').toLowerCase();
      const manufacturer = (eq.manufacturer || '').toLowerCase();
      const serialNumber = (eq.serialNumber || '').toLowerCase();
      const warehouse = (eq.currentWarehouseName || eq.currentWarehouse || '').toLowerCase();
      
      return type.includes(query) || 
             manufacturer.includes(query) || 
             serialNumber.includes(query) || 
             warehouse.includes(query);
    });
  }, [groupedEquipment, searchQuery]);

  const handleBatchSelect = (batch) => {
    setSelectedBatch(batch);
    const key = `${batch.batchId}-${batch.currentWarehouse || batch.currentWarehouseName}`;
    const existingQuantity = batchQuantities[key] || 1;
    setBatchQuantity(existingQuantity);
    setShowBatchQuantityModal(true);
  };

  // Обробка вибору кількості для обладнання без серійного номера
  const handleQuantityBasedSelect = (eq) => {
    setSelectedBatch(eq);
    const existingQuantity = quantityBasedQuantities[eq._id] || 1;
    setBatchQuantity(existingQuantity);
    setShowBatchQuantityModal(true);
  };

  const handleBatchQuantityConfirm = () => {
    if (!selectedBatch) return;
    
    const isQuantityBased = !selectedBatch.batchId && (!selectedBatch.serialNumber || selectedBatch.serialNumber.trim() === '') && selectedBatch.quantity > 1;
    
    if (isQuantityBased) {
      // Для quantity-based обладнання
      setQuantityBasedQuantities(prev => ({
        ...prev,
        [selectedBatch._id]: batchQuantity
      }));
      
      // Додаємо до списку вибраного, якщо ще немає
      setSelectedEquipmentList(prev => {
        const exists = prev.find(e => e._id === selectedBatch._id);
        if (!exists) {
          return [...prev, selectedBatch];
        }
        return prev;
      });
    } else {
      // Для batch обладнання
      const key = `${selectedBatch.batchId}-${selectedBatch.currentWarehouse || selectedBatch.currentWarehouseName}`;
      setBatchQuantities(prev => ({
        ...prev,
        [key]: batchQuantity
      }));
      
      // Додаємо всі елементи партії до списку вибраного
      if (selectedBatch.batchItems && selectedBatch.batchItems.length > 0) {
        setSelectedEquipmentList(prev => {
          const filteredIds = new Set(prev.map(eq => eq._id));
          const toAdd = selectedBatch.batchItems.filter(eq => !filteredIds.has(eq._id));
          return [...prev, ...toAdd];
        });
      }
    }
    
    setShowBatchQuantityModal(false);
    setSelectedBatch(null);
    setBatchQuantity(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (selectedEquipmentList.length === 0) {
      setError('Виберіть хоча б одне обладнання для списання');
      return;
    }
    
    if (!reason.trim()) {
      setError('Причина списання обов\'язкова');
      return;
    }
    
    setSaving(true);
    
    try {
      const token = localStorage.getItem('token');
      const results = [];
      
      for (const eq of selectedEquipmentList) {
        const isQuantityBased = !eq.batchId && (!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1;
        const isBatch = eq.batchId && eq.batchItems;
        
        if (isQuantityBased) {
          // Списання quantity-based обладнання
          const quantity = quantityBasedQuantities[eq._id] || eq.quantity || 1;
          
          const response = await fetch(`${API_BASE_URL}/equipment/quantity/write-off`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              equipmentId: eq._id,
              quantity: quantity,
              reason: reason.trim(),
              notes: notes.trim(),
              attachedFiles: attachedFiles
            })
          });
          
          if (response.ok) {
            results.push({ success: true, equipment: eq });
          } else {
            const errorData = await response.json().catch(() => ({}));
            results.push({ success: false, equipment: eq, error: errorData.error || 'Помилка списання' });
          }
        } else if (isBatch) {
          // Списання batch обладнання (поки не реалізовано, можна додати пізніше)
          setError('Списання партійного обладнання поки не підтримується');
          setSaving(false);
          return;
        } else {
          // Списання одиничного обладнання
          const response = await fetch(`${API_BASE_URL}/equipment/${eq._id}/write-off`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              reason: reason.trim(),
              notes: notes.trim(),
              attachedFiles: attachedFiles
            })
          });
          
          if (response.ok) {
            results.push({ success: true, equipment: eq });
          } else {
            const errorData = await response.json().catch(() => ({}));
            results.push({ success: false, equipment: eq, error: errorData.error || 'Помилка списання' });
          }
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      
      if (successCount === results.length) {
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      } else {
        setError(`Списано ${successCount} з ${results.length}. Деякі операції не вдалися.`);
      }
    } catch (error) {
      console.error('Помилка списання:', error);
      setError('Помилка списання обладнання');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content write-off-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📝 Списання обладнання</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {showSelection ? (
            <>
              <div className="form-group">
                <input
                  type="text"
                  placeholder="Пошук обладнання..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '10px', marginBottom: '16px' }}
                />
              </div>

              <div className="equipment-selection-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {loadingEquipment ? (
                  <div className="loading">Завантаження...</div>
                ) : filteredEquipmentList.length === 0 ? (
                  <div className="empty-state">Обладнання не знайдено</div>
                ) : (
                  filteredEquipmentList.map(eq => {
                    const isBatch = eq.batchId && eq.batchItems;
                    const isQuantityBased = !eq.batchId && (!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1;
                    const isSelected = selectedEquipmentList.some(e => e._id === eq._id || (isBatch && eq.batchItems?.some(b => b._id === e._id)));
                    
                    return (
                      <div
                        key={eq._id}
                        className={`equipment-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          if (isBatch) {
                            handleBatchSelect(eq);
                          } else if (isQuantityBased) {
                            handleQuantityBasedSelect(eq);
                          } else {
                            handleEquipmentToggle(eq);
                          }
                        }}
                      >
                        <div className="equipment-item-info">
                          <strong>{eq.type || '—'}</strong>
                          {isBatch ? (
                            <span style={{ color: 'var(--primary)', marginLeft: '8px' }}>
                              Партія: {eq.batchCount} шт.
                            </span>
                          ) : isQuantityBased ? (
                            <span style={{ color: 'var(--primary)', marginLeft: '8px' }}>
                              Кількість: {eq.quantity} шт.
                            </span>
                          ) : (
                            <span> (Серійний номер: {eq.serialNumber || '—'})</span>
                          )}
                          <div style={{ fontSize: '0.9em', color: '#666', marginTop: '4px' }}>
                            Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}
                          </div>
                        </div>
                        {isSelected && <span className="checkmark">✓</span>}
                      </div>
                    );
                  })
                )}
              </div>

              {selectedEquipmentList.length > 0 && (
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setShowSelection(false)}
                  >
                    Продовжити ({selectedEquipmentList.length} вибрано)
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="equipment-info">
                <p><strong>Вибрано обладнання:</strong> {selectedEquipmentList.length} шт.</p>
                <div className="selected-equipment-list">
                  {selectedEquipmentList.map(eq => {
                    const isQuantityBased = !eq.batchId && (!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1;
                    const selectedQuantity = isQuantityBased ? (quantityBasedQuantities[eq._id] || eq.quantity || 1) : null;
                    return (
                      <div key={eq._id} className="selected-equipment-item">
                        <span>
                          <strong>{eq.type || '—'}</strong> 
                          {isQuantityBased && selectedQuantity ? (
                            <span style={{ color: 'var(--primary)', fontWeight: 'bold', marginLeft: '8px' }}>
                              (Кількість: {selectedQuantity} шт.)
                            </span>
                          ) : (
                            <span> (Серійний номер: {eq.serialNumber || '—'})</span>
                          )}
                        </span>
                        <span>Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}</span>
                      </div>
                    );
                  })}
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
                {/* Поле вибору кількості для обладнання без серійного номера */}
                {selectedEquipmentList.map(eq => {
                  const isQuantityBased = !eq.batchId && (!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1;
                  if (!isQuantityBased) return null;
                  
                  const currentQuantity = quantityBasedQuantities[eq._id] || eq.quantity || 1;
                  const maxQuantity = eq.quantity || 1;
                  
                  return (
                    <div key={eq._id} className="form-group" style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <label>
                        Кількість для списання: <strong>{eq.type || '—'}</strong> *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={maxQuantity}
                        value={currentQuantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          const newQuantity = Math.max(1, Math.min(val, maxQuantity));
                          setQuantityBasedQuantities(prev => ({
                            ...prev,
                            [eq._id]: newQuantity
                          }));
                        }}
                        style={{ width: '100%', padding: '8px', marginTop: '8px' }}
                        required
                      />
                      <div style={{ marginTop: '8px', fontSize: '0.9em', color: '#666' }}>
                        Доступно на складі: <strong>{maxQuantity} шт.</strong>
                      </div>
                    </div>
                  );
                })}

                <div className="form-group">
                  <label>Причина списання *</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Вкажіть причину списання обладнання..."
                    rows="4"
                    required
                    disabled={saving}
                  />
                </div>

                <div className="form-group">
                  <label>Примітки (необов'язково)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Додаткові примітки..."
                    rows="3"
                    disabled={saving}
                  />
                </div>

                <div className="form-group">
                  <label>Документи та фото</label>
                  <EquipmentFileUpload
                    files={attachedFiles}
                    onFilesChange={setAttachedFiles}
                  />
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onClose}
                    disabled={saving}
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    className="btn-warning"
                    disabled={saving}
                  >
                    {saving ? 'Списання...' : 'Списати'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Модальне вікно вибору кількості */}
      {showBatchQuantityModal && selectedBatch && (
        <div className="modal-overlay" onClick={() => {
          setShowBatchQuantityModal(false);
          setSelectedBatch(null);
          setError('');
        }}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Виберіть кількість</h3>
              <button className="btn-close" onClick={() => {
                setShowBatchQuantityModal(false);
                setSelectedBatch(null);
                setError('');
              }}>✕</button>
            </div>
            <div className="modal-body">
              {(() => {
                const isQuantityBased = !selectedBatch.batchId && (!selectedBatch.serialNumber || selectedBatch.serialNumber.trim() === '') && selectedBatch.quantity > 1;
                const maxQuantity = isQuantityBased ? selectedBatch.quantity : selectedBatch.batchCount;
                return (
                  <>
                    <p><strong>{isQuantityBased ? 'Обладнання' : 'Партія'}:</strong> {selectedBatch.type}</p>
                    <p><strong>Доступно на складі:</strong> {maxQuantity} шт.</p>
                    <div className="form-group">
                      <label>Кількість для списання *</label>
                      <input
                        type="number"
                        min="1"
                        max={maxQuantity}
                        value={batchQuantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setBatchQuantity(Math.max(1, Math.min(val, maxQuantity)));
                        }}
                        style={{ width: '100%', padding: '8px' }}
                      />
                      <div style={{ marginTop: '8px', fontSize: '0.9em', color: '#666' }}>
                        Доступно на складі: {maxQuantity} шт.
                      </div>
                    </div>
                  </>
                );
              })()}
              {error && <div className="error-message">{error}</div>}
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => {
                  setShowBatchQuantityModal(false);
                  setSelectedBatch(null);
                  setError('');
                }}
              >
                Скасувати
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleBatchQuantityConfirm}
              >
                Підтвердити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EquipmentWriteOffModal;
