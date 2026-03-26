import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../../config';
import { getEdrpouList } from '../../utils/edrpouAPI';
import { flattenCategoriesForSelect } from '../../utils/equipmentPickerCategories';
import ClientDataSelectionModal from '../ClientDataSelectionModal';
import EquipmentFileUpload from './EquipmentFileUpload';
import './EquipmentShipModal.css';

function EquipmentShipModal({ equipment, warehouses = [], onClose, onSuccess }) {
  const [selectedEquipmentList, setSelectedEquipmentList] = useState(equipment ? [equipment] : []);
  const [equipmentList, setEquipmentList] = useState([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [showSelection, setShowSelection] = useState(!equipment);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [filterItemKind, setFilterItemKind] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [shippedTo, setShippedTo] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientEdrpou, setClientEdrpou] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [invoiceRecipientDetails, setInvoiceRecipientDetails] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showBatchQuantityModal, setShowBatchQuantityModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchQuantity, setBatchQuantity] = useState(1);
  const [batchQuantities, setBatchQuantities] = useState({}); // { batchId-warehouse: quantity }
  const [quantityBasedQuantities, setQuantityBasedQuantities] = useState({}); // { equipmentId: quantity } для обладнання без серійного номера
  
  // Стан для автозаповнення ЄДРПОУ
  const [edrpouList, setEdrpouList] = useState([]);
  const [showEdrpouDropdown, setShowEdrpouDropdown] = useState(false);
  const [filteredEdrpouList, setFilteredEdrpouList] = useState([]);
  const [clientDataModal, setClientDataModal] = useState({ open: false, edrpou: '' });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (equipment) return;
    let cancelled = false;
    (async () => {
      setLoadingEquipment(true);
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams();
        if (filterWarehouseId) params.set('warehouse', filterWarehouseId);
        if (filterItemKind === 'equipment' || filterItemKind === 'parts') params.set('itemKind', filterItemKind);
        if (filterCategoryId) {
          params.set('categoryId', filterCategoryId);
          params.set('includeSubtree', 'true');
        }
        if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
        const qs = params.toString();
        const response = await fetch(`${API_BASE_URL}/equipment${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        setEquipmentList(
          data.filter(
            (eq) =>
              !eq.deleted &&
              eq.status !== 'written_off' &&
              eq.status !== 'deleted' &&
              (eq.status === 'in_stock' || eq.status === 'reserved' || !eq.status)
          )
        );
      } catch (err) {
        console.error('Помилка завантаження обладнання:', err);
      } finally {
        if (!cancelled) setLoadingEquipment(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [equipment, filterWarehouseId, filterItemKind, filterCategoryId, debouncedSearch]);

  useEffect(() => {
    if (equipment) return;
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/categories/tree`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setCategoryOptions(flattenCategoriesForSelect(Array.isArray(data) ? data : []));
      } catch {
        if (!cancelled) setCategoryOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [equipment]);

  useEffect(() => {
    if (equipment) {
      const isQuantityBased =
        !equipment.batchId &&
        (!equipment.serialNumber || equipment.serialNumber.trim() === '') &&
        equipment.quantity > 1;
      if (isQuantityBased) {
        setQuantityBasedQuantities((prev) => ({
          ...prev,
          [equipment._id]: equipment.quantity || 1,
        }));
      }
    }
  }, [equipment]);

  // Завантаження списку ЄДРПОУ для автозаповнення
  useEffect(() => {
    getEdrpouList()
      .then(data => {
        setEdrpouList(data || []);
      })
      .catch(err => console.error('Помилка завантаження ЄДРПОУ:', err));
  }, []);

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
      const isAvailable = eq.status === 'in_stock' || eq.status === 'reserved' || !eq.status;
      // Обладнання з batchId (стара логіка партій)
      if (eq.isBatch && eq.batchId && isAvailable) {
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
      else if ((!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1 && isAvailable) {
        // Додаємо як окремий елемент з можливістю вибору кількості
        singleItems.push(eq);
      } 
      // Звичайне одиничне обладнання
      else if (isAvailable) {
        singleItems.push(eq);
      }
    });
    
    return [...Object.values(groups), ...singleItems];
  }, [equipmentList]);

  const hasActiveFilters =
    !!filterWarehouseId ||
    !!filterItemKind ||
    !!filterCategoryId ||
    !!debouncedSearch.trim();

  const handleSelectAll = () => {
    if (selectedEquipmentList.length === groupedEquipment.length && groupedEquipment.length > 0) {
      const filteredIds = new Set(groupedEquipment.map((eq) => eq._id));
      setSelectedEquipmentList((prev) => prev.filter((eq) => !filteredIds.has(eq._id)));
    } else {
      const filteredIds = new Set(selectedEquipmentList.map((eq) => eq._id));
      const toAdd = groupedEquipment.filter((eq) => !filteredIds.has(eq._id));
      setSelectedEquipmentList((prev) => [...prev, ...toAdd]);
    }
  };

  const resetPickerFilters = () => {
    setFilterWarehouseId('');
    setFilterItemKind('');
    setFilterCategoryId('');
    setSearchInput('');
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
      <div className="modal-overlay modal-overlay--equipment-picker-fullscreen" onClick={onClose}>
        <div
          className="modal-content equipment-select-modal equipment-picker-modal-fullscreen"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>🚚 Відвантаження обладнання</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body equipment-picker-three-col-body">
            <aside className="equipment-picker-filters-column">
              <h3 className="equipment-picker-column-title">Фільтри</h3>
              <div className="equipment-picker-filters">
                <div className="equipment-picker-filter-row">
                  <label className="equipment-picker-filter-label">Склад</label>
                  <select
                    className="equipment-picker-select"
                    value={filterWarehouseId}
                    onChange={(e) => setFilterWarehouseId(e.target.value)}
                  >
                    <option value="">Усі склади</option>
                    {(warehouses || []).map((w) => (
                      <option key={w._id} value={String(w._id)}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="equipment-picker-filter-row">
                  <label className="equipment-picker-filter-label">Тип</label>
                  <select
                    className="equipment-picker-select"
                    value={filterItemKind}
                    onChange={(e) => setFilterItemKind(e.target.value)}
                  >
                    <option value="">Усі типи</option>
                    <option value="equipment">Товари</option>
                    <option value="parts">Деталі / ЗІП</option>
                  </select>
                </div>
                <div className="equipment-picker-filter-row">
                  <label className="equipment-picker-filter-label">Категорія</label>
                  <select
                    className="equipment-picker-select"
                    value={filterCategoryId}
                    onChange={(e) => setFilterCategoryId(e.target.value)}
                  >
                    <option value="">Усі категорії</option>
                    {categoryOptions.map((c) => (
                      <option key={c._id} value={c._id}>
                        {'\u00A0'.repeat((c.level || 0) * 2)}
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="equipment-picker-reset-btn" onClick={resetPickerFilters}>
                  Скинути фільтри
                </button>
              </div>
              <div className="equipment-search">
                <input
                  type="text"
                  placeholder="🔍 Пошук (тип, серійний №, виробник) — на сервері…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="equipment-search-input"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="equipment-search-clear"
                    title="Очистити пошук"
                  >
                    ✕
                  </button>
                )}
              </div>
            </aside>

            <div className="equipment-picker-available-column">
              <h3 className="equipment-picker-column-title">Обладнання на складі</h3>
              {loadingEquipment ? (
                <div className="loading-message">Завантаження...</div>
              ) : equipmentList.length === 0 ? (
                <div className="empty-message">
                  {hasActiveFilters
                    ? 'За обраними фільтрами немає доступного обладнання. Спробуйте змінити умови або скинути фільтри.'
                    : 'Немає доступного обладнання'}
                </div>
              ) : groupedEquipment.length === 0 ? (
                <div className="empty-message">Немає рядків для відображення після групування.</div>
              ) : (
                <>
                  <div className="select-all-controls">
                    <label className="select-all-checkbox">
                      <input
                        type="checkbox"
                        checked={
                          groupedEquipment.length > 0 &&
                          groupedEquipment.every((eq) =>
                            selectedEquipmentList.find((e) => e._id === eq._id)
                          )
                        }
                        onChange={handleSelectAll}
                      />
                      <span>
                        Вибрати все у списку ({selectedEquipmentList.length} вибрано / {groupedEquipment.length}{' '}
                        у списку)
                      </span>
                      {hasActiveFilters && (
                        <span className="filtered-count"> · Завантажено записів: {equipmentList.length}</span>
                      )}
                    </label>
                  </div>
                  <div className="equipment-select-list">
                    {groupedEquipment.map((group) => {
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
            </div>

            <div className="selected-equipment-column">
              <h3 className="equipment-picker-column-title">
                Вибране обладнання ({selectedEquipmentList.length})
              </h3>
              {selectedEquipmentList.length === 0 ? (
                <div className="empty-selection-message">
                  <p>Виберіть обладнання зі списку посередині</p>
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
                {(() => {
                  const isQuantityBased = !selectedBatch.batchId && (!selectedBatch.serialNumber || selectedBatch.serialNumber.trim() === '') && selectedBatch.quantity > 1;
                  const maxQuantity = isQuantityBased ? selectedBatch.quantity : selectedBatch.batchCount;
                  return (
                    <>
                      <p><strong>{isQuantityBased ? 'Обладнання' : 'Партія'}:</strong> {selectedBatch.type}</p>
                      <p><strong>Доступно на складі:</strong> {maxQuantity} шт.</p>
                      <div className="form-group">
                        <label>Кількість для відвантаження *</label>
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedEquipmentList.length === 0) {
      setError('Виберіть хоча б одне обладнання');
      return;
    }

    if (!shippedTo) {
      setError('Вкажіть замовника');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
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
        const result = await fetch(`${API_BASE_URL}/equipment/${item._id}/ship`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            shippedTo: shippedTo,
            orderNumber: orderNumber,
            invoiceNumber: invoiceNumber,
            clientEdrpou: clientEdrpou,
            clientAddress: clientAddress,
            invoiceRecipientDetails: invoiceRecipientDetails,
            totalPrice: totalPrice ? parseFloat(totalPrice) : null,
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
        
        const result = await fetch(`${API_BASE_URL}/equipment/quantity/ship`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            equipmentId: item._id,
            quantity: quantity,
            fromWarehouse: item.currentWarehouse,
            shippedTo: shippedTo,
            orderNumber: orderNumber,
            invoiceNumber: invoiceNumber,
            clientEdrpou: clientEdrpou,
            clientAddress: clientAddress,
            invoiceRecipientDetails: invoiceRecipientDetails,
            totalPrice: totalPrice ? parseFloat(totalPrice) : null,
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
        
        const result = await fetch(`${API_BASE_URL}/equipment/batch/ship`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            batchId: group.batchId,
            quantity: quantity,
            fromWarehouse: group.fromWarehouse,
            shippedTo: shippedTo,
            orderNumber: orderNumber,
            invoiceNumber: invoiceNumber,
            clientEdrpou: clientEdrpou,
            clientAddress: clientAddress,
            invoiceRecipientDetails: invoiceRecipientDetails,
            totalPrice: totalPrice ? parseFloat(totalPrice) : null,
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
      
      const failed = results.filter(r => !r.ok);
      
      if (failed.length === 0) {
        onSuccess && onSuccess();
        onClose();
      } else {
        const successCount = results.length - failed.length;
        setError(`Відвантажено ${successCount} з ${results.length}. Деякі операції не вдалися.`);
      }
    } catch (error) {
      console.error('Помилка відвантаження:', error);
      setError('Помилка відвантаження обладнання');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🚚 Відвантаження обладнання</h2>
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
                    Кількість для відвантаження: <strong>{eq.type || '—'}</strong> *
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
              <label>Замовник *</label>
              <input
                type="text"
                value={shippedTo}
                onChange={(e) => setShippedTo(e.target.value)}
                placeholder="Назва компанії або ПІБ"
                required
              />
            </div>

            <div className="form-group autocomplete-wrapper">
              <label>ЄДРПОУ</label>
              <input
                type="text"
                value={clientEdrpou}
                onChange={(e) => {
                  const value = e.target.value;
                  setClientEdrpou(value);
                  // Фільтруємо ЄДРПОУ для автодоповнення
                  if (value.trim()) {
                    const filtered = edrpouList.filter(edrpou => 
                      edrpou.toLowerCase().includes(value.toLowerCase())
                    );
                    setFilteredEdrpouList(filtered);
                    setShowEdrpouDropdown(filtered.length > 0);
                  } else {
                    setShowEdrpouDropdown(false);
                    setFilteredEdrpouList([]);
                  }
                }}
                placeholder="Введіть ЄДРПОУ..."
                autoComplete="off"
              />
              {/* Dropdown з автодоповненням для ЄДРПОУ */}
              {showEdrpouDropdown && filteredEdrpouList.length > 0 && (
                <div className="autocomplete-dropdown">
                  <div className="autocomplete-hint">
                    💡 Виберіть ЄДРПОУ для автозаповнення даних клієнта
                  </div>
                  {filteredEdrpouList.slice(0, 10).map((edrpou, index) => (
                    <div
                      key={index}
                      className="autocomplete-item"
                      onClick={() => {
                        setClientEdrpou(edrpou);
                        setShowEdrpouDropdown(false);
                        setFilteredEdrpouList([]);
                        setClientDataModal({ open: true, edrpou: edrpou });
                      }}
                    >
                      {edrpou}
                    </div>
                  ))}
                  {filteredEdrpouList.length > 10 && (
                    <div className="autocomplete-more">
                      ... та ще {filteredEdrpouList.length - 10}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Адреса</label>
              <input
                type="text"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="Адреса доставки"
              />
            </div>

            <div className="form-group">
              <label>Реквізити отримувача отримання товару</label>
              <textarea
                value={invoiceRecipientDetails}
                onChange={(e) => setInvoiceRecipientDetails(e.target.value)}
                placeholder="Реквізити для рахунку"
                rows="3"
              />
            </div>

            <div className="form-group">
              <label>Загальна ціна обладнання, грн.</label>
              <input
                type="number"
                value={totalPrice}
                onChange={(e) => setTotalPrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label>Номер замовлення</label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="ORD-12345"
              />
            </div>

            <div className="form-group">
              <label>Номер рахунку</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-12345"
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
                {saving ? 'Відвантаження...' : 'Відвантажити'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Модальне вікно для вибору даних клієнта */}
      <ClientDataSelectionModal
        open={clientDataModal.open}
        onClose={() => setClientDataModal({ open: false, edrpou: '' })}
        onApply={(updates) => {
          // Застосовуємо дані клієнта до форми
          // ClientDataSelectionModal передає поля як прості значення (рядки), а не об'єкти
          if (updates.client) {
            setShippedTo(updates.client);
          }
          if (updates.address) {
            setClientAddress(updates.address);
          }
          if (updates.invoiceRecipientDetails) {
            setInvoiceRecipientDetails(updates.invoiceRecipientDetails);
          }
          setClientDataModal({ open: false, edrpou: '' });
        }}
        edrpou={clientDataModal.edrpou}
        currentFormData={{ shippedTo, clientEdrpou, clientAddress, invoiceRecipientDetails }}
      />
    </div>
  );
}

export default EquipmentShipModal;

