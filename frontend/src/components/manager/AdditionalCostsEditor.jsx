import React from 'react';
import './AdditionalCostsEditor.css';

// Динамічний редактор додаткових витрат — список автоматично розширюється
function AdditionalCostsEditor({ costs, onChange }) {
  const addCostRow = () => {
    onChange([
      ...costs,
      { id: crypto.randomUUID?.() || Date.now().toString(), description: '', amount: 0, quantity: 1, notes: '' }
    ]);
  };

  const removeCostRow = (id) => {
    if (costs.length <= 1) return;
    onChange(costs.filter(c => c.id !== id));
  };

  const updateCost = (id, field, value) => {
    onChange(costs.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };
      if (field === 'amount' || field === 'quantity') {
        updated[field] = field === 'quantity' 
          ? Math.max(1, parseInt(value) || 1) 
          : parseFloat(value) || 0;
      }
      return updated;
    }));
  };

  const totalAdditional = costs.reduce((s, c) => s + ((c.amount || 0) * (c.quantity || 1)), 0);

  return (
    <div className="additional-costs-editor">
      <div className="additional-costs-header">
        <span className="section-label">Додаткові витрати</span>
        <button type="button" className="btn-add-cost" onClick={addCostRow}>
          + Додати витрату
        </button>
      </div>
      <div className="additional-costs-table-wrap">
        <table className="additional-costs-table">
          <thead>
            <tr>
              <th>Опис</th>
              <th className="col-amount">Сума (₴)</th>
              <th className="col-qty">К-ть</th>
              <th className="col-total">Разом</th>
              <th>Примітка</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {costs.map(cost => (
              <tr key={cost.id}>
                <td>
                  <input
                    type="text"
                    placeholder="Доставка, монтаж, кабель..."
                    value={cost.description || ''}
                    onChange={e => updateCost(cost.id, 'description', e.target.value)}
                  />
                </td>
                <td className="col-amount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost.amount ?? ''}
                    onChange={e => updateCost(cost.id, 'amount', e.target.value)}
                    placeholder="0"
                  />
                </td>
                <td className="col-qty">
                  <input
                    type="number"
                    min="1"
                    value={cost.quantity ?? 1}
                    onChange={e => updateCost(cost.id, 'quantity', e.target.value)}
                  />
                </td>
                <td className="col-total">
                  <span className="cost-row-total">
                    {((cost.amount || 0) * (cost.quantity || 1)).toLocaleString('uk-UA')} ₴
                  </span>
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Примітка"
                    value={cost.notes || ''}
                    onChange={e => updateCost(cost.id, 'notes', e.target.value)}
                  />
                </td>
                <td className="col-action">
                  <button
                    type="button"
                    className="btn-remove-cost"
                    onClick={() => removeCostRow(cost.id)}
                    disabled={costs.length <= 1}
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
      <div className="additional-costs-summary">
        Разом додаткові витрати: <strong>{totalAdditional.toLocaleString('uk-UA')} ₴</strong>
      </div>
    </div>
  );
}

export default AdditionalCostsEditor;
