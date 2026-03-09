import React from 'react';
import './EquipmentEditor.css';

function EquipmentEditor({ items, equipment, onChange }) {
  const addRow = () => {
    onChange([
      ...items,
      { id: crypto.randomUUID?.() || Date.now().toString(), equipmentId: '', type: '', serialNumber: '', amount: 0 }
    ]);
  };

  const removeRow = (id) => {
    if (items.length <= 1) return;
    onChange(items.filter(i => i.id !== id));
  };

  const updateItem = (id, field, value) => {
    onChange(items.map(i => {
      if (i.id !== id) return i;
      const updated = { ...i, [field]: value };
      if (field === 'equipmentId') {
        const eq = equipment.find(x => x._id === value);
        if (eq) {
          updated.type = eq.type || '';
          updated.serialNumber = eq.serialNumber || '';
        }
      }
      if (field === 'amount') updated.amount = parseFloat(value) || 0;
      return updated;
    }));
  };

  const usedIds = items.map(i => i.equipmentId).filter(Boolean);
  const getAvailableForRow = (currentItem) =>
    equipment.filter(eq => eq._id === currentItem.equipmentId || !usedIds.includes(eq._id));

  const totalEquipment = items.reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div className="equipment-editor">
      <div className="equipment-editor-header">
        <span className="section-label">Обладнання <span className="required">*</span></span>
        <button type="button" className="btn-add-equipment" onClick={addRow}>
          + Додати обладнання
        </button>
      </div>
      <div className="equipment-editor-table-wrap">
        <table className="equipment-editor-table">
          <thead>
            <tr>
              <th>Обладнання</th>
              <th className="col-amount">Сума (₴)</th>
              <th className="col-total">Разом</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>
                  <select
                    value={item.equipmentId || ''}
                    onChange={e => updateItem(item.id, 'equipmentId', e.target.value)}
                    required={items.length > 0}
                  >
                    <option value="">Оберіть обладнання</option>
                    {getAvailableForRow(item).map(eq => (
                      <option key={eq._id} value={eq._id}>
                        {eq.type} {eq.serialNumber ? `(${eq.serialNumber})` : ''} — {eq.currentWarehouseName || eq.currentWarehouse || ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="col-amount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.amount ?? ''}
                    onChange={e => updateItem(item.id, 'amount', e.target.value)}
                    placeholder="0"
                    required={!!item.equipmentId}
                  />
                </td>
                <td className="col-total">
                  <span className="equipment-row-total">
                    {(item.amount || 0).toLocaleString('uk-UA')} ₴
                  </span>
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
    </div>
  );
}

export default EquipmentEditor;
