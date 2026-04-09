import React, { useState, useMemo } from 'react';
import EquipmentPickerModal from './EquipmentPickerModal';
import './EquipmentEditor.css';

function EquipmentEditor({
  items,
  equipment,
  onChange,
  label = 'Відвантажене обладнання',
  user = null,
  reserveClientName = '',
  onEquipmentReserved
}) {
  const [pickerRowId, setPickerRowId] = useState(null);

  const addRow = () => {
    onChange([
      ...items,
      { id: crypto.randomUUID?.() || Date.now().toString(), equipmentId: '', type: '', serialNumber: '', amount: 0 }
    ]);
  };

  const removeRow = (id) => {
    if (items.length <= 1) return;
    onChange(items.filter((i) => i.id !== id));
  };

  const updateItem = (id, field, value) => {
    onChange(
      items.map((i) => {
        if (i.id !== id) return i;
        const updated = { ...i, [field]: value };
        if (field === 'equipmentId') {
          if (!value) {
            updated.type = '';
            updated.serialNumber = '';
          } else {
            const eq = equipment.find((x) => x._id === value);
            if (eq) {
              updated.type = eq.type || '';
              updated.serialNumber = eq.serialNumber || '';
            }
          }
        }
        if (field === 'amount') updated.amount = parseFloat(value) || 0;
        return updated;
      })
    );
  };

  const usedIds = items.map((i) => i.equipmentId).filter(Boolean);

  const excludeIdsForPicker = useMemo(() => {
    if (!pickerRowId) return usedIds;
    return items.filter((i) => i.id !== pickerRowId).map((i) => i.equipmentId).filter(Boolean);
  }, [items, pickerRowId, usedIds]);

  const totalEquipment = items.reduce((s, i) => s + (i.amount || 0), 0);

  const summaryForRow = (item) => {
    if (!item.equipmentId) return null;
    const eq = equipment.find((x) => x._id === item.equipmentId);
    if (!eq) {
      return item.type || 'Обране обладнання';
    }
    const wh = eq.currentWarehouseName || eq.currentWarehouse || '';
    return [eq.type, wh].filter(Boolean).join(' — ') || eq.type || '—';
  };

  const handlePickerSelect = (eq) => {
    if (!pickerRowId || !eq?._id) return;
    updateItem(pickerRowId, 'equipmentId', eq._id);
  };

  return (
    <div className="equipment-editor">
      <div className="equipment-editor-header">
        <span className="section-label">
          {label} <span className="required">*</span>
        </span>
        <button type="button" className="btn-add-equipment" onClick={addRow}>
          + Додати обладнання
        </button>
      </div>
      <div className="equipment-editor-table-wrap">
        <table className="equipment-editor-table">
          <thead>
            <tr>
              <th className="col-equipment">{label}</th>
              <th className="col-serial">Серійний №</th>
              <th className="col-amount">Сума (₴)</th>
              <th className="col-total">Разом</th>
              <th className="col-action" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="col-equipment">
                  <div className="equipment-editor-pick-cell">
                    {item.equipmentId ? (
                      <div className="equipment-editor-pick-summary" title={summaryForRow(item)}>
                        {summaryForRow(item)}
                      </div>
                    ) : (
                      <span className="equipment-editor-pick-placeholder">Не обрано</span>
                    )}
                    <div className="equipment-editor-pick-actions">
                      <button
                        type="button"
                        className="btn-equipment-pick"
                        onClick={() => setPickerRowId(item.id)}
                      >
                        Обрати…
                      </button>
                      {item.equipmentId ? (
                        <button
                          type="button"
                          className="btn-equipment-clear"
                          onClick={() => updateItem(item.id, 'equipmentId', '')}
                        >
                          Очистити
                        </button>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="col-serial equipment-editor-serial">{item.serialNumber || '—'}</td>
                <td className="col-amount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.amount ?? ''}
                    onChange={(e) => updateItem(item.id, 'amount', e.target.value)}
                    placeholder="0"
                    required={!!item.equipmentId}
                  />
                </td>
                <td className="col-total">
                  <span className="equipment-row-total">{(item.amount || 0).toLocaleString('uk-UA')} ₴</span>
                </td>
                <td className="col-action">
                  <button
                    type="button"
                    className="btn-remove-equipment"
                    onClick={() => removeRow(item.id)}
                    disabled={items.length <= 1}
                    title="Видалити рядок"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="equipment-editor-summary">
        Разом обладнання: <strong>{totalEquipment.toLocaleString('uk-UA')} ₴</strong>
      </div>

      <EquipmentPickerModal
        open={!!pickerRowId}
        onClose={() => setPickerRowId(null)}
        equipment={equipment}
        excludeIds={excludeIdsForPicker}
        onSelect={handlePickerSelect}
        user={user}
        reserveClientName={reserveClientName}
        onAfterReserve={onEquipmentReserved}
      />
    </div>
  );
}

export default EquipmentEditor;
