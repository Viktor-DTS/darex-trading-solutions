import React, { useState, useEffect, useMemo } from 'react';
import './EquipmentPickerModal.css';

function matchesSearch(eq, q) {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  const hay = [
    eq.type,
    eq.serialNumber,
    eq.manufacturer,
    eq.currentWarehouseName,
    eq.currentWarehouse,
    eq.batchName
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  return hay.some((p) => p.includes(s));
}

/**
 * Модальний вибір однієї позиції обладнання зі списку (наприклад /equipment/for-sale).
 */
function EquipmentPickerModal({ open, onClose, equipment, excludeIds = [], onSelect }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setDebouncedSearch('');
      setWarehouseFilter('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const excludeSet = useMemo(
    () => new Set((excludeIds || []).filter(Boolean).map(String)),
    [excludeIds]
  );

  const warehouseOptions = useMemo(() => {
    const names = new Set();
    (equipment || []).forEach((eq) => {
      const w = eq.currentWarehouseName || eq.currentWarehouse;
      if (w) names.add(w);
    });
    return ['', ...Array.from(names).sort((a, b) => a.localeCompare(b, 'uk'))];
  }, [equipment]);

  const filtered = useMemo(() => {
    const list = Array.isArray(equipment) ? equipment : [];
    return list.filter((eq) => {
      if (!eq?._id) return false;
      if (excludeSet.has(String(eq._id))) return false;
      if (warehouseFilter) {
        const w = eq.currentWarehouseName || eq.currentWarehouse || '';
        if (w !== warehouseFilter) return false;
      }
      return matchesSearch(eq, debouncedSearch);
    });
  }, [equipment, excludeSet, warehouseFilter, debouncedSearch]);

  if (!open) return null;

  const handlePick = (eq) => {
    onSelect(eq);
    onClose();
  };

  const list = Array.isArray(equipment) ? equipment : [];
  const availableCount = list.filter((eq) => eq?._id && !excludeSet.has(String(eq._id))).length;

  return (
    <div className="equipment-picker-overlay" onClick={onClose} role="presentation">
      <div
        className="equipment-picker-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-picker-title"
      >
        <div className="equipment-picker-header">
          <h3 id="equipment-picker-title">Оберіть обладнання</h3>
          <button type="button" className="equipment-picker-close" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
        <div className="equipment-picker-toolbar">
          <input
            type="search"
            className="equipment-picker-search"
            placeholder="Пошук: тип, серійний №, виробник, склад…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="equipment-picker-warehouse"
            aria-label="Склад"
          >
            {warehouseOptions.map((w) => (
              <option key={w || '__all'} value={w}>
                {w || 'Усі склади'}
              </option>
            ))}
          </select>
        </div>
        <div className="equipment-picker-meta">
          Знайдено: <strong>{filtered.length}</strong>
          {debouncedSearch.trim() || warehouseFilter ? (
            <span className="equipment-picker-meta-total"> (доступно без фільтра: {availableCount})</span>
          ) : null}
        </div>
        <div className="equipment-picker-body">
          <table className="equipment-picker-table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Серійний №</th>
                <th>Склад</th>
                <th className="equipment-picker-col-action" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="equipment-picker-empty">
                    Нічого не знайдено. Змініть пошук або фільтр складу.
                  </td>
                </tr>
              ) : (
                filtered.map((eq) => (
                  <tr key={eq._id}>
                    <td className="equipment-picker-cell-truncate" title={eq.type || ''}>
                      {eq.type || '—'}
                    </td>
                    <td>{eq.serialNumber || '—'}</td>
                    <td
                      className="equipment-picker-cell-truncate"
                      title={eq.currentWarehouseName || eq.currentWarehouse || ''}
                    >
                      {eq.currentWarehouseName || eq.currentWarehouse || '—'}
                    </td>
                    <td className="equipment-picker-col-action">
                      <button type="button" className="equipment-picker-btn-select" onClick={() => handlePick(eq)}>
                        Обрати
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default EquipmentPickerModal;
