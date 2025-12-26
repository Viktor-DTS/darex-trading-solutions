import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../../config';
import EquipmentFileUpload from './EquipmentFileUpload';
import './EquipmentMoveModal.css';

function EquipmentMoveModal({ equipment, warehouses, onClose, onSuccess }) {
  const [selectedEquipmentList, setSelectedEquipmentList] = useState(equipment ? [equipment] : []);
  const [equipmentList, setEquipmentList] = useState([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [showSelection, setShowSelection] = useState(!equipment);
  const [searchQuery, setSearchQuery] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
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
            _id: `batch-${key}`, // Унікальний ID для групи
            batchItems: [],
            batchCount: 0
          };
        }
        groups[key].batchItems.push(eq);
        groups[key].batchCount++;
      } 
      // Обладнання без серійного номера з quantity > 1 (нова логіка)
      else if ((!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1 && eq.status === 'in_stock') {
        // Додаємо як окремий елемент з можливістю вибору кількості
        singleItems.push(eq);
      } 
      // Звичайне одиничне обладнання
      else {
        singleItems.push(eq);
      }
    });
    
    return [...Object.values(groups), ...singleItems];
  }, [equipmentList]);

  // Фільтрація обладнання по пошуковому запиту
  const filteredEquipmentList = useMemo(() => {
    let result = groupedEquipment;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = groupedEquipment.filter(eq => {
        const type = (eq.type || '').toLowerCase();
        const serialNumber = (eq.serialNumber || '').toLowerCase();
        const warehouse = (eq.currentWarehouseName || eq.currentWarehouse || '').toLowerCase();
        const manufacturer = (eq.manufacturer || '').toLowerCase();
        const region = (eq.region || '').toLowerCase();
        const batchId = (eq.batchId || '').toLowerCase();
        
        return type.includes(query) ||
               serialNumber.includes(query) ||
               warehouse.includes(query) ||
               manufacturer.includes(query) ||
               region.includes(query) ||
               batchId.includes(query);
      });
    }
    
    return result;
  }, [groupedEquipment, searchQuery]);

  const handleSelectAll = () => {
    if (selectedEquipmentList.length === filteredEquipmentList.length && filteredEquipmentList.length > 0) {
      // Знімаємо вибір з усіх відфільтрованих
      const filteredIds = new Set(filteredEquipmentList.map(eq => eq._id));
      setSelectedEquipmentList(prev => prev.filter(eq => !filteredIds.has(eq._id)));
    } else {
      // Додаємо всі відфільтровані до вибраних
      const filteredIds = new Set(selectedEquipmentList.map(eq => eq._id));
      const toAdd = filteredEquipmentList.filter(eq => !filteredIds.has(eq._id));
      setSelectedEquipmentList(prev => [...prev, ...toAdd]);
    }
  };

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
    
    // Перевірка для quantity-based обладнання (без batchId)
    const isQuantityBased = !selectedBatch.batchId && (!selectedBatch.serialNumber || selectedBatch.serialNumber.trim() === '') && selectedBatch.quantity > 1;
    const maxQuantity = isQuantityBased ? selectedBatch.quantity : selectedBatch.batchCount;
    
    if (batchQuantity < 1 || batchQuantity > maxQuantity) {
      setError(`Кількість повинна бути від 1 до ${maxQuantity}`);
      return;
    }
    
    if (isQuantityBased) {
      // Обладнання без серійного номера (quantity-based)
      setSelectedEquipmentList(prev => {
        // Видаляємо попередній запис цього обладнання, якщо він є
        const existing = prev.filter(e => e._id !== selectedBatch._id);
        // Додаємо обладнання з вибраною кількістю
        return [...existing, { ...selectedBatch, selectedQuantity: batchQuantity }];
      });
      
      setQuantityBasedQuantities(prev => ({
        ...prev,
        [selectedBatch._id]: batchQuantity
      }));
    } else {
      // Стара логіка для batch обладнання
      const key = `${selectedBatch.batchId}-${selectedBatch.currentWarehouse || selectedBatch.currentWarehouseName}`;
      
      // Додаємо вибрані одиниці до списку
      const itemsToAdd = selectedBatch.batchItems.slice(0, batchQuantity);
      setSelectedEquipmentList(prev => {
        // Видаляємо попередні записи цієї партії, якщо вони є
        const existing = prev.filter(e => 
          !(e.batchId === selectedBatch.batchId && 
            (e.currentWarehouse === selectedBatch.currentWarehouse || 
             e.currentWarehouseName === selectedBatch.currentWarehouseName))
        );
        return [...existing, ...itemsToAdd];
      });
      
      setBatchQuantities(prev => ({
        ...prev,
        [key]: batchQuantity
      }));
    }
    
    setShowBatchQuantityModal(false);
    setSelectedBatch(null);
    setError('');
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
                  <div className="equipment-search">
                    <input
                      type="text"
                      placeholder="🔍 Пошук по всіх полях..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="equipment-search-input"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="equipment-search-clear"
                        title="Очистити пошук"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  
                  {filteredEquipmentList.length === 0 ? (
                    <div className="empty-message">Нічого не знайдено за запитом "{searchQuery}"</div>
                  ) : (
                    <>
                      <div className="select-all-controls">
                        <label className="select-all-checkbox">
                          <input
                            type="checkbox"
                            checked={filteredEquipmentList.length > 0 && 
                                    filteredEquipmentList.every(eq => selectedEquipmentList.find(e => e._id === eq._id))}
                            onChange={handleSelectAll}
                          />
                          <span>Вибрати все ({selectedEquipmentList.length}/{equipmentList.length})</span>
                          {searchQuery && (
                            <span className="filtered-count"> (Знайдено: {filteredEquipmentList.length})</span>
                          )}
                        </label>
                      </div>
                      <div className="equipment-select-list">
                        {filteredEquipmentList.map(group => {
                          const isBatch = group.isBatch && group.batchId;
                          const isQuantityBased = !isBatch && (!group.serialNumber || group.serialNumber.trim() === '') && group.quantity > 1;
                          const isSelected = selectedEquipmentList.some(e => 
                            isBatch 
                              ? e.batchId === group.batchId && 
                                (e.currentWarehouse === group.currentWarehouse || 
                                 e.currentWarehouseName === group.currentWarehouseName)
                              : e._id === group._id
                          );
                          const key = isBatch 
                            ? `${group.batchId}-${group.currentWarehouse || group.currentWarehouseName}` 
                            : group._id;
                          const selectedQuantity = isBatch 
                            ? (batchQuantities[key] || 0) 
                            : isQuantityBased 
                              ? (quantityBasedQuantities[group._id] || 0)
                              : 0;
                          
                          return (
                            <div
                              key={key}
                              className={`equipment-select-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                if (isBatch) {
                                  handleBatchSelect(group);
                                } else if (isQuantityBased) {
                                  handleQuantityBasedSelect(group);
                                } else {
                                  handleEquipmentToggle(group);
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (isBatch) {
                                    handleBatchSelect(group);
                                  } else if (isQuantityBased) {
                                    handleQuantityBasedSelect(group);
                                  } else {
                                    handleEquipmentToggle(group);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="equipment-checkbox"
                              />
                              <div className="equipment-select-info">
                                <strong>{group.type || '—'}</strong>
                                {isBatch ? (
                                  <>
                                    <span>Партія: {group.batchCount} шт. на складі {group.currentWarehouseName || group.currentWarehouse || '—'}</span>
                                    <span>Batch ID: {group.batchId}</span>
                                    {selectedQuantity > 0 && (
                                      <span className="selected-quantity">Вибрано: {selectedQuantity} шт.</span>
                                    )}
                                  </>
                                ) : isQuantityBased ? (
                                  <>
                                    <span>Кількість на складі: {group.quantity} шт.</span>
                                    <span>Склад: {group.currentWarehouseName || group.currentWarehouse || '—'}</span>
                                    {selectedQuantity > 0 && (
                                      <span className="selected-quantity">Вибрано: {selectedQuantity} шт.</span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span>Серійний номер: {group.serialNumber || '—'}</span>
                                    <span>Склад: {group.currentWarehouseName || group.currentWarehouse || '—'}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
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
                  {(() => {
                    // Групуємо вибране обладнання для відображення
                    const grouped = {};
                    selectedEquipmentList.forEach(eq => {
                      if (eq.isBatch && eq.batchId) {
                        const key = `${eq.batchId}-${eq.currentWarehouse || eq.currentWarehouseName}`;
                        if (!grouped[key]) {
                          grouped[key] = {
                            ...eq,
                            count: 0,
                            items: []
                          };
                        }
                        grouped[key].count++;
                        grouped[key].items.push(eq);
                      } else {
                        grouped[eq._id] = { ...eq, count: 1, items: [eq] };
                      }
                    });
                    
                    return Object.values(grouped).map(group => {
                      const isBatch = group.isBatch && group.batchId;
                      const key = isBatch 
                        ? `${group.batchId}-${group.currentWarehouse || group.currentWarehouseName}` 
                        : group._id;
                      const quantity = isBatch ? (batchQuantities[key] || group.count) : 1;
                      
                      return (
                        <div key={key} className="selected-equipment-display-item">
                          <button
                            className="remove-equipment-btn"
                            onClick={() => {
                              if (isBatch) {
                                setSelectedEquipmentList(prev => prev.filter(e => 
                                  !(e.batchId === group.batchId && 
                                    (e.currentWarehouse === group.currentWarehouse || 
                                     e.currentWarehouseName === group.currentWarehouseName))
                                ));
                                setBatchQuantities(prev => {
                                  const newQuantities = { ...prev };
                                  delete newQuantities[key];
                                  return newQuantities;
                                });
                              } else {
                                handleEquipmentToggle(group);
                              }
                            }}
                            title="Видалити з вибраного"
                          >
                            ✕
                          </button>
                          <div className="selected-equipment-display-info">
                            <strong>{group.type || '—'}</strong>
                            {isBatch ? (
                              <>
                                <span>Партія: {quantity} шт.</span>
                                <span>Склад: {group.currentWarehouseName || group.currentWarehouse || '—'}</span>
                                <span>Batch ID: {group.batchId}</span>
                              </>
                            ) : (
                              <>
                                <span>Серійний номер: {group.serialNumber || '—'}</span>
                                <span>Склад: {group.currentWarehouseName || group.currentWarehouse || '—'}</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
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
        
        {/* Модалка вибору кількості для партії */}
        {showBatchQuantityModal && selectedBatch && (
          <div className="modal-overlay" style={{ zIndex: 1001 }} onClick={() => {
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
                <p><strong>Партія:</strong> {selectedBatch.type}</p>
                <p><strong>Доступно на складі:</strong> {selectedBatch.batchCount} шт.</p>
                <div className="form-group">
                  <label>Кількість для переміщення *</label>
                  {(() => {
                    const isQuantityBased = !selectedBatch.batchId && (!selectedBatch.serialNumber || selectedBatch.serialNumber.trim() === '') && selectedBatch.quantity > 1;
                    const maxQuantity = isQuantityBased ? selectedBatch.quantity : selectedBatch.batchCount;
                    return (
                      <>
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
                      </>
                    );
                  })()}
                </div>
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
      
      // Розділити обладнання на одиничне, quantity-based та партії
      const singleItems = [];
      const quantityBasedItems = [];
      const batchGroups = {};
      
      selectedEquipmentList.forEach(eq => {
        // Quantity-based обладнання (без серійного номера, quantity > 1)
        const isQuantityBased = !eq.batchId && (!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1;
        if (isQuantityBased) {
          quantityBasedItems.push(eq);
        }
        // Batch обладнання (з batchId)
        else if (eq.isBatch && eq.batchId) {
          const key = `${eq.batchId}-${eq.currentWarehouse || eq.currentWarehouseName}`;
          if (!batchGroups[key]) {
            batchGroups[key] = {
              batchId: eq.batchId,
              fromWarehouse: eq.currentWarehouse,
              fromWarehouseName: eq.currentWarehouseName,
              items: []
            };
          }
          batchGroups[key].items.push(eq);
        }
        // Звичайне одиничне обладнання
        else {
          singleItems.push(eq);
        }
      });
      
      const results = [];
      
      // Обробка одиничного обладнання
      for (const item of singleItems) {
        const result = await fetch(`${API_BASE_URL}/equipment/${item._id}/move`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            toWarehouse: toWarehouse,
            toWarehouseName: toWarehouseName,
            reason: reason,
            notes: notes,
            attachedFiles: attachedFiles.map(f => ({
              cloudinaryUrl: f.cloudinaryUrl,
              cloudinaryId: f.cloudinaryId,
              originalName: f.originalName,
              mimetype: f.mimetype,
              size: f.size
            }))
          })
        });
        results.push(result);
      }
      
      // Обробка quantity-based обладнання
      for (const item of quantityBasedItems) {
        const quantity = quantityBasedQuantities[item._id] || item.quantity || 1;
        
        const result = await fetch(`${API_BASE_URL}/equipment/quantity/move`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            equipmentId: item._id,
            quantity: quantity,
            fromWarehouse: item.currentWarehouse,
            fromWarehouseName: item.currentWarehouseName,
            toWarehouse: toWarehouse,
            toWarehouseName: toWarehouseName,
            reason: reason,
            notes: notes,
            attachedFiles: attachedFiles.map(f => ({
              cloudinaryUrl: f.cloudinaryUrl,
              cloudinaryId: f.cloudinaryId,
              originalName: f.originalName,
              mimetype: f.mimetype,
              size: f.size
            }))
          })
        });
        
        if (!result.ok) {
          const errorData = await result.json().catch(() => ({ error: 'Невідома помилка' }));
          if (errorData.availableQuantity !== undefined) {
            setError(`⚠️ ${errorData.error}\nДоступно: ${errorData.availableQuantity} шт., Запитується: ${errorData.requestedQuantity} шт.`);
            setSaving(false);
            return;
          }
        }
        
        results.push(result);
      }
      
      // Обробка партій
      for (const key in batchGroups) {
        const group = batchGroups[key];
        const quantity = batchQuantities[key] || group.items.length;
        
        const result = await fetch(`${API_BASE_URL}/equipment/batch/move`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            batchId: group.batchId,
            quantity: quantity,
            fromWarehouse: group.fromWarehouse,
            fromWarehouseName: group.fromWarehouseName,
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
        });
        results.push(result);
      }
      
      const failed = results.filter(r => !r.ok);
      
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
                    Кількість для переміщення: <strong>{eq.type || '—'}</strong> *
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

            <div className="form-group">
              <label>Примітки</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Введіть примітки (необов'язково)"
                rows="5"
                style={{ width: '100%', minHeight: '120px' }}
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

