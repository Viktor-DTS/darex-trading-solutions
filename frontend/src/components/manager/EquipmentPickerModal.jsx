import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../../config';
import {
  ITEM_KIND_FILTER_DEFAULT_GOODS,
  equipmentMatchesItemKindFilter,
  getItemKindFilterSelectOptions
} from '../../utils/equipmentNomenclatureFilter';
import './EquipmentPickerModal.css';

function labelForItemKindOption(value) {
  if (value === '') return 'Усі типи';
  return value;
}

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

/** Лише вільне або зарезервоване поточним користувачем (чужі резерви не показуємо). */
function isVisibleForSalePicker(eq, userLogin) {
  if (!eq?._id) return false;
  const login = (userLogin || '').trim();
  const st = eq.status || 'in_stock';
  if (st === 'in_stock') return true;
  if (st === 'reserved' && login && eq.reservedByLogin === login) return true;
  return false;
}

function displayQuantity(eq) {
  const q = Number(eq?.quantity);
  const n = Number.isFinite(q) && q > 0 ? q : 1;
  const u = eq?.batchUnit && String(eq.batchUnit).trim() ? String(eq.batchUnit).trim() : 'шт.';
  return `${n} ${u}`;
}

function reservationStatusLabel(eq, userLogin) {
  const login = (userLogin || '').trim();
  const st = eq.status || 'in_stock';
  if (st === 'reserved' && login && eq.reservedByLogin === login) {
    return { text: 'Мій резерв', className: 'equipment-picker-status equipment-picker-status--mine' };
  }
  return { text: 'Вільна', className: 'equipment-picker-status equipment-picker-status--free' };
}

/**
 * Модальний вибір однієї позиції обладнання зі списку (наприклад /equipment/for-sale).
 */
function EquipmentPickerModal({
  open,
  onClose,
  equipment,
  excludeIds = [],
  onSelect,
  user = null,
  reserveClientName = '',
  onAfterReserve
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [itemKindFilter, setItemKindFilter] = useState(ITEM_KIND_FILTER_DEFAULT_GOODS);
  const [reservingId, setReservingId] = useState(null);

  const userLogin = user?.login || '';

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setDebouncedSearch('');
      setWarehouseFilter('');
      setItemKindFilter(ITEM_KIND_FILTER_DEFAULT_GOODS);
      setReservingId(null);
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

  const baseList = useMemo(() => {
    const list = Array.isArray(equipment) ? equipment : [];
    return list.filter((eq) => isVisibleForSalePicker(eq, userLogin));
  }, [equipment, userLogin]);

  const warehouseOptions = useMemo(() => {
    const names = new Set();
    baseList.forEach((eq) => {
      const w = eq.currentWarehouseName || eq.currentWarehouse;
      if (w) names.add(w);
    });
    return ['', ...Array.from(names).sort((a, b) => a.localeCompare(b, 'uk'))];
  }, [baseList]);

  const itemKindOptions = useMemo(
    () => getItemKindFilterSelectOptions({ includeFixedAssets: false }),
    []
  );

  const filtered = useMemo(() => {
    return baseList.filter((eq) => {
      if (excludeSet.has(String(eq._id))) return false;
      if (!equipmentMatchesItemKindFilter(eq, itemKindFilter, null)) return false;
      if (warehouseFilter) {
        const w = eq.currentWarehouseName || eq.currentWarehouse || '';
        if (w !== warehouseFilter) return false;
      }
      return matchesSearch(eq, debouncedSearch);
    });
  }, [baseList, excludeSet, warehouseFilter, debouncedSearch, itemKindFilter]);

  const handleSelectClick = async (eq) => {
    if (!eq?._id || reservingId) return;
    const idStr = String(eq._id);

    const st = eq.status || 'in_stock';
    const mine = st === 'reserved' && eq.reservedByLogin === userLogin;
    if (mine) {
      onSelect(eq);
      onAfterReserve?.();
      onClose();
      return;
    }

    if (st === 'reserved') {
      alert('Це обладнання зарезервовано іншим користувачем.');
      return;
    }
    if (st !== 'in_stock') {
      alert('Оберіть позицію в статусі «на складі».');
      return;
    }

    const cn = (reserveClientName || '').trim();
    if (!cn) {
      alert('Спочатку оберіть клієнта в угоді — потрібна назва для резервування обладнання.');
      return;
    }

    setReservingId(idStr);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/equipment/${eq._id}/reserve-for-sale`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ clientName: cn })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Помилка ${res.status}`);
      }
      onSelect(data);
      onAfterReserve?.();
      onClose();
    } catch (e) {
      alert(e.message || 'Не вдалося зарезервувати обладнання');
    } finally {
      setReservingId(null);
    }
  };

  if (!open) return null;

  const availableCount = baseList.filter((eq) => !excludeSet.has(String(eq._id))).length;

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
          <select
            value={itemKindFilter}
            onChange={(e) => setItemKindFilter(e.target.value)}
            className="equipment-picker-itemkind"
            aria-label="Тип номенклатури"
          >
            {itemKindOptions.map((v) => (
              <option key={v || '__all_kinds'} value={v}>
                {labelForItemKindOption(v)}
              </option>
            ))}
          </select>
        </div>
        <div className="equipment-picker-meta">
          Знайдено: <strong>{filtered.length}</strong>
          {debouncedSearch.trim() ||
          warehouseFilter ||
          itemKindFilter !== ITEM_KIND_FILTER_DEFAULT_GOODS ? (
            <span className="equipment-picker-meta-total"> (доступно без фільтра: {availableCount})</span>
          ) : null}
        </div>
        <div className="equipment-picker-body">
          <table className="equipment-picker-table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Серійний №</th>
                <th>Кількість</th>
                <th>Склад</th>
                <th>Статус</th>
                <th className="equipment-picker-col-action" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="equipment-picker-empty">
                    Нічого не знайдено. Змініть пошук, склад або тип номенклатури.
                  </td>
                </tr>
              ) : (
                filtered.map((eq) => {
                  const st = reservationStatusLabel(eq, userLogin);
                  const busy = reservingId === String(eq._id);
                  return (
                    <tr key={eq._id}>
                      <td className="equipment-picker-cell-truncate" title={eq.type || ''}>
                        {eq.type || '—'}
                      </td>
                      <td>{eq.serialNumber || '—'}</td>
                      <td className="equipment-picker-col-qty">{displayQuantity(eq)}</td>
                      <td
                        className="equipment-picker-cell-truncate"
                        title={eq.currentWarehouseName || eq.currentWarehouse || ''}
                      >
                        {eq.currentWarehouseName || eq.currentWarehouse || '—'}
                      </td>
                      <td>
                        <span className={st.className}>{st.text}</span>
                      </td>
                      <td className="equipment-picker-col-action">
                        <button
                          type="button"
                          className="equipment-picker-btn-select"
                          onClick={() => handleSelectClick(eq)}
                          disabled={!!reservingId}
                        >
                          {busy ? '…' : 'Обрати'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default EquipmentPickerModal;
