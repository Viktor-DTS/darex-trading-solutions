import React from 'react';
import './ProposedEquipmentEditor.css';

// Вільне заповнення (обладнання під замовлення) — без прив'язки до складу
function ProposedEquipmentEditor({ items, onChange }) {
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
      if (field === 'amount') updated.amount = parseFloat(value) || 0;
      return updated;
    }));
  };

  const totalEquipment = items.reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div className="proposed-equipment-editor">
      <div className="proposed-equipment-header">
        <span className="section-label">Запропоноване обладнання <span className="required">*</span></span>
        <button type="button" className="btn-add-equipment" onClick={addRow}>
          + Додати обладнання
        </button>
      </div>
      <div className="proposed-equipment-table-wrap">
        <table className="proposed-equipment-table">
          <thead>
            <tr>
              <th>Назва / Тип обладнання</th>
              <th>Серійний №</th>
              <th className="col-amount">Сума (₴)</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>
                  <input
                    type="text"
                    value={item.type || ''}
                    onChange={e => updateItem(item.id, 'type', e.target.value)}
                    placeholder="Введіть назву або тип обладнання"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={item.serialNumber || ''}
                    onChange={e => updateItem(item.id, 'serialNumber', e.target.value)}
                    placeholder="Серійний номер (за наявності)"
                  />
                </td>
                <td className="col-amount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.amount ?? ''}
                    onChange={e => updateItem(item.id, 'amount', e.target.value)}
                    placeholder="0"
                  />
                </td>
                <td className="col-action">
                  <button
                    type="button"
                    className="btn-remove-equipment"
                    onClick={() => removeRow(item.id)}
                    disabled={items.length <= 1}
                    title="Видалити"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="proposed-equipment-summary">
        Разом: <strong>{totalEquipment.toLocaleString('uk-UA')} ₴</strong>
      </div>
    </div>
  );
}

export default ProposedEquipmentEditor;
