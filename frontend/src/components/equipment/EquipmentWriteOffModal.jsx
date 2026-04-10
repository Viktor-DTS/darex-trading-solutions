import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../../config';
import { flattenCategoriesForSelect } from '../../utils/equipmentPickerCategories';
import EquipmentFileUpload from './EquipmentFileUpload';
import './EquipmentWriteOffModal.css';

function EquipmentWriteOffModal({ equipment, warehouses = [], user, onClose, onSuccess }) {
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
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showBatchQuantityModal, setShowBatchQuantityModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchQuantity, setBatchQuantity] = useState(1);
  const [batchQuantities, setBatchQuantities] = useState({});
  const [quantityBasedQuantities, setQuantityBasedQuantities] = useState({});
  const [preflightError, setPreflightError] = useState('');

  const isRegionalStaff = ['warehouse', 'zavsklad'].includes(String(user?.role || '').toLowerCase());
  const sourceWarehouseIdsParam = useMemo(() => {
    const ids = (warehouses || []).map((w) => w._id).filter(Boolean).map(String);
    return ids.join(',');
  }, [warehouses]);

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
        else if (isRegionalStaff && sourceWarehouseIdsParam)
          params.set('currentWarehouses', sourceWarehouseIdsParam);
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
  }, [
    equipment,
    filterWarehouseId,
    filterItemKind,
    filterCategoryId,
    debouncedSearch,
    isRegionalStaff,
    sourceWarehouseIdsParam,
  ]);

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

  useEffect(() => {
    if (!equipment || !isRegionalStaff) {
      setPreflightError('');
      return;
    }
    const allowed = new Set((warehouses || []).map((w) => String(w._id)));
    const cw = equipment.currentWarehouse != null ? String(equipment.currentWarehouse) : '';
    if (cw && !allowed.has(cw)) {
      setPreflightError(
        'Це обладнання на складі іншого регіону. Списувати можна лише товар зі складу вашого регіону.'
      );
    } else {
      setPreflightError('');
    }
  }, [equipment, isRegionalStaff, warehouses]);

  const handleEquipmentToggle = (eq) => {
    setSelectedEquipmentList((prev) => {
      const exists = prev.find((e) => e._id === eq._id);
      if (exists) {
        return prev.filter((e) => e._id !== eq._id);
      }
      return [...prev, eq];
    });
  };

  const groupedEquipment = useMemo(() => {
    const groups = {};
    const singleItems = [];

    equipmentList.forEach((eq) => {
      const isAvailable = eq.status === 'in_stock' || eq.status === 'reserved' || !eq.status;
      if (eq.isBatch && eq.batchId && isAvailable) {
        const key = `${eq.batchId}-${eq.currentWarehouse || eq.currentWarehouseName}`;
        if (!groups[key]) {
          groups[key] = {
            ...eq,
            _id: `batch-${key}`,
            batchItems: [],
            batchCount: 0,
          };
        }
        groups[key].batchItems.push(eq);
        groups[key].batchCount++;
      } else if ((!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1 && isAvailable) {
        singleItems.push(eq);
      } else if (isAvailable) {
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

  const handleQuantityBasedSelect = (eq) => {
    setSelectedBatch(eq);
    const existingQuantity = quantityBasedQuantities[eq._id] || 1;
    setBatchQuantity(existingQuantity);
    setShowBatchQuantityModal(true);
  };

  const handleBatchQuantityConfirm = () => {
    if (!selectedBatch) return;

    const isQuantityBased =
      !selectedBatch.batchId &&
      (!selectedBatch.serialNumber || selectedBatch.serialNumber.trim() === '') &&
      selectedBatch.quantity > 1;
    const maxQuantity = isQuantityBased ? selectedBatch.quantity : selectedBatch.batchCount;

    if (batchQuantity < 1 || batchQuantity > maxQuantity) {
      setError(`Кількість повинна бути від 1 до ${maxQuantity}`);
      return;
    }

    if (isQuantityBased) {
      setSelectedEquipmentList((prev) => {
        const existing = prev.filter((e) => e._id !== selectedBatch._id);
        return [...existing, { ...selectedBatch, selectedQuantity: batchQuantity }];
      });
      setQuantityBasedQuantities((prev) => ({
        ...prev,
        [selectedBatch._id]: batchQuantity,
      }));
    } else {
      const key = `${selectedBatch.batchId}-${selectedBatch.currentWarehouse || selectedBatch.currentWarehouseName}`;
      const itemsToAdd = selectedBatch.batchItems.slice(0, batchQuantity);
      setSelectedEquipmentList((prev) => {
        const existing = prev.filter(
          (e) =>
            !(
              e.batchId === selectedBatch.batchId &&
              (e.currentWarehouse === selectedBatch.currentWarehouse ||
                e.currentWarehouseName === selectedBatch.currentWarehouseName)
            )
        );
        return [...existing, ...itemsToAdd];
      });
      setBatchQuantities((prev) => ({
        ...prev,
        [key]: batchQuantity,
      }));
    }

    setShowBatchQuantityModal(false);
    setSelectedBatch(null);
    setError('');
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

    if (preflightError) {
      setError(preflightError);
      return;
    }

    setSaving(true);

    try {
      const token = localStorage.getItem('token');
      const results = [];

      for (const eq of selectedEquipmentList) {
        const isQuantityBased =
          !eq.batchId && (!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1;
        const isBatch = eq.batchId && eq.batchItems;

        if (isQuantityBased) {
          const quantity = quantityBasedQuantities[eq._id] || eq.quantity || 1;

          const response = await fetch(`${API_BASE_URL}/equipment/quantity/write-off`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              equipmentId: eq._id,
              quantity,
              reason: reason.trim(),
              notes: notes.trim(),
              attachedFiles,
            }),
          });

          if (response.ok) {
            results.push({ success: true, equipment: eq });
          } else {
            const errorData = await response.json().catch(() => ({}));
            results.push({ success: false, equipment: eq, error: errorData.error || 'Помилка списання' });
          }
        } else if (isBatch) {
          setError('Списання партійного обладнання поки не підтримується');
          setSaving(false);
          return;
        } else {
          const response = await fetch(`${API_BASE_URL}/equipment/${eq._id}/write-off`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              reason: reason.trim(),
              notes: notes.trim(),
              attachedFiles,
            }),
          });

          if (response.ok) {
            results.push({ success: true, equipment: eq });
          } else {
            const errorData = await response.json().catch(() => ({}));
            results.push({ success: false, equipment: eq, error: errorData.error || 'Помилка списання' });
          }
        }
      }

      const successCount = results.filter((r) => r.success).length;

      if (successCount === results.length) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setError(`Списано ${successCount} з ${results.length}. Деякі операції не вдалися.`);
      }
    } catch (err) {
      console.error('Помилка списання:', err);
      setError('Помилка списання обладнання');
    } finally {
      setSaving(false);
    }
  };

  if (showSelection) {
    return (
      <div className="modal-overlay modal-overlay--equipment-picker-fullscreen" onClick={onClose}>
        <div
          className="modal-content equipment-select-modal equipment-picker-modal-fullscreen"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>📝 Списання обладнання</h2>
            <button type="button" className="btn-close" onClick={onClose}>
              ✕
            </button>
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
                    <option value="">{isRegionalStaff ? 'Усі мої склади' : 'Усі склади'}</option>
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
                          groupedEquipment.every((eq) => selectedEquipmentList.find((e) => e._id === eq._id))
                        }
                        onChange={handleSelectAll}
                      />
                      <span>
                        Вибрати все у списку ({selectedEquipmentList.length} вибрано / {groupedEquipment.length} у
                        списку)
                      </span>
                      {hasActiveFilters && (
                        <span className="filtered-count"> · Завантажено записів: {equipmentList.length}</span>
                      )}
                    </label>
                  </div>
                  <div className="equipment-select-list">
                    {groupedEquipment.map((group) => {
                      const isBatch = group.isBatch && group.batchId;
                      const isQuantityBased =
                        !isBatch &&
                        (!group.serialNumber || group.serialNumber.trim() === '') &&
                        group.quantity > 1;
                      const isSelected = selectedEquipmentList.some((e) =>
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
                        ? batchQuantities[key] || 0
                        : isQuantityBased
                          ? quantityBasedQuantities[group._id] || 0
                          : 0;

                      return (
                        <div
                          key={key}
                          className={`equipment-select-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            if (isBatch) handleBatchSelect(group);
                            else if (isQuantityBased) handleQuantityBasedSelect(group);
                            else handleEquipmentToggle(group);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(ev) => {
                              ev.stopPropagation();
                              if (isBatch) handleBatchSelect(group);
                              else if (isQuantityBased) handleQuantityBasedSelect(group);
                              else handleEquipmentToggle(group);
                            }}
                            onClick={(ev) => ev.stopPropagation()}
                            className="equipment-checkbox"
                          />
                          <div className="equipment-select-info">
                            <strong>{group.type || '—'}</strong>
                            {isBatch ? (
                              <>
                                <span>
                                  Партія: {group.batchCount} шт. на складі{' '}
                                  {group.currentWarehouseName || group.currentWarehouse || '—'}
                                </span>
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
                    const grouped = {};
                    selectedEquipmentList.forEach((eq) => {
                      if (eq.isBatch && eq.batchId) {
                        const gkey = `${eq.batchId}-${eq.currentWarehouse || eq.currentWarehouseName}`;
                        if (!grouped[gkey]) {
                          grouped[gkey] = { ...eq, count: 0, items: [] };
                        }
                        grouped[gkey].count++;
                        grouped[gkey].items.push(eq);
                      } else {
                        grouped[eq._id] = { ...eq, count: 1, items: [eq] };
                      }
                    });

                    return Object.values(grouped).map((grp) => {
                      const isBatch = grp.isBatch && grp.batchId;
                      const gkey = isBatch
                        ? `${grp.batchId}-${grp.currentWarehouse || grp.currentWarehouseName}`
                        : grp._id;
                      const qty = isBatch ? batchQuantities[gkey] || grp.count : 1;
                      const isQtyBased =
                        !isBatch &&
                        (!grp.serialNumber || grp.serialNumber.trim() === '') &&
                        grp.quantity > 1;

                      return (
                        <div key={gkey} className="selected-equipment-display-item">
                          <button
                            type="button"
                            className="remove-equipment-btn"
                            onClick={() => {
                              if (isBatch) {
                                setSelectedEquipmentList((prev) =>
                                  prev.filter(
                                    (e) =>
                                      !(
                                        e.batchId === grp.batchId &&
                                        (e.currentWarehouse === grp.currentWarehouse ||
                                          e.currentWarehouseName === grp.currentWarehouseName)
                                      )
                                  )
                                );
                                setBatchQuantities((prev) => {
                                  const next = { ...prev };
                                  delete next[gkey];
                                  return next;
                                });
                              } else {
                                handleEquipmentToggle(grp);
                              }
                            }}
                            title="Видалити з вибраного"
                          >
                            ✕
                          </button>
                          <div className="selected-equipment-display-info">
                            <strong>{grp.type || '—'}</strong>
                            {isBatch ? (
                              <>
                                <span>Партія: {qty} шт.</span>
                                <span>Склад: {grp.currentWarehouseName || grp.currentWarehouse || '—'}</span>
                                <span>Batch ID: {grp.batchId}</span>
                              </>
                            ) : isQtyBased ? (
                              <>
                                <span>
                                  Кількість: {quantityBasedQuantities[grp._id] || grp.quantity || 1} шт.
                                </span>
                                <span>Склад: {grp.currentWarehouseName || grp.currentWarehouse || '—'}</span>
                              </>
                            ) : (
                              <>
                                <span>Серійний номер: {grp.serialNumber || '—'}</span>
                                <span>Склад: {grp.currentWarehouseName || grp.currentWarehouse || '—'}</span>
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
                if (selectedEquipmentList.length > 0) setShowSelection(false);
                else setError('Виберіть хоча б одне обладнання');
              }}
              disabled={selectedEquipmentList.length === 0}
            >
              Продовжити ({selectedEquipmentList.length})
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>

        {showBatchQuantityModal && selectedBatch && (
          <div
            className="modal-overlay"
            style={{ zIndex: 1001 }}
            onClick={() => {
              setShowBatchQuantityModal(false);
              setSelectedBatch(null);
              setError('');
            }}
          >
            <div className="modal-content" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Виберіть кількість</h3>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowBatchQuantityModal(false);
                    setSelectedBatch(null);
                    setError('');
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                {(() => {
                  const isQuantityBased =
                    !selectedBatch.batchId &&
                    (!selectedBatch.serialNumber || selectedBatch.serialNumber.trim() === '') &&
                    selectedBatch.quantity > 1;
                  const maxQuantity = isQuantityBased ? selectedBatch.quantity : selectedBatch.batchCount;
                  return (
                    <>
                      <p>
                        <strong>{isQuantityBased ? 'Обладнання' : 'Партія'}:</strong> {selectedBatch.type}
                      </p>
                      <p>
                        <strong>Доступно на складі:</strong> {maxQuantity} шт.
                      </p>
                      <div className="form-group">
                        <label>Кількість для списання *</label>
                        <input
                          type="number"
                          min="1"
                          max={maxQuantity}
                          value={batchQuantity}
                          onChange={(ev) => {
                            const val = parseInt(ev.target.value, 10) || 1;
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
                <button type="button" className="btn-primary" onClick={handleBatchQuantityConfirm}>
                  Підтвердити
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content write-off-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📝 Списання обладнання</h2>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="equipment-info">
            <p>
              <strong>Вибрано обладнання:</strong> {selectedEquipmentList.length} шт.
            </p>
            <div className="selected-equipment-list">
              {selectedEquipmentList.map((eq) => {
                const isQuantityBased =
                  !eq.batchId && (!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1;
                const selectedQuantity = isQuantityBased
                  ? quantityBasedQuantities[eq._id] || eq.quantity || 1
                  : null;
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
            {selectedEquipmentList.map((eq) => {
              const isQuantityBased =
                !eq.batchId && (!eq.serialNumber || eq.serialNumber.trim() === '') && eq.quantity > 1;
              if (!isQuantityBased) return null;

              const currentQuantity = quantityBasedQuantities[eq._id] || eq.quantity || 1;
              const maxQuantity = eq.quantity || 1;

              return (
                <div
                  key={eq._id}
                  className="form-group"
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <label>
                    Кількість для списання: <strong>{eq.type || '—'}</strong> *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={maxQuantity}
                    value={currentQuantity}
                    onChange={(ev) => {
                      const val = parseInt(ev.target.value, 10) || 1;
                      const newQuantity = Math.max(1, Math.min(val, maxQuantity));
                      setQuantityBasedQuantities((prev) => ({
                        ...prev,
                        [eq._id]: newQuantity,
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
              <EquipmentFileUpload onFilesChange={setAttachedFiles} uploadedFiles={attachedFiles} />
            </div>

            {preflightError && <div className="error-message">{preflightError}</div>}
            {error && <div className="error-message">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                Скасувати
              </button>
              <button type="submit" className="btn-warning" disabled={saving || !!preflightError}>
                {saving ? 'Списання...' : 'Списати'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EquipmentWriteOffModal;
