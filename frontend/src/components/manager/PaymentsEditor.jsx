import React from 'react';
import './PaymentsEditor.css';

const CURRENCIES = ['UAH', 'USD', 'EUR'];

function PaymentsEditor({ payments, onChange }) {
  const addRow = () => {
    onChange([
      ...payments,
      { id: crypto.randomUUID?.() || Date.now().toString(), date: new Date().toISOString().slice(0, 10), amount: 0, currency: 'UAH', rate: 1 }
    ]);
  };

  const removeRow = (id) => {
    if (payments.length <= 1) return;
    onChange(payments.filter(p => p.id !== id));
  };

  const updatePayment = (id, field, value) => {
    onChange(payments.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      if (field === 'amount' || field === 'rate') {
        updated[field] = parseFloat(value) || 0;
      }
      return updated;
    }));
  };

  const totalUAH = payments.reduce((s, p) => {
    const amt = p.amount || 0;
    const rate = p.rate || 1;
    const curr = (p.currency || 'UAH').toUpperCase();
    if (curr === 'UAH') return s + amt;
    return s + amt * rate;
  }, 0);

  return (
    <div className="payments-editor">
      <div className="payments-editor-header">
        <span className="section-label">Платежі</span>
        <button type="button" className="btn-add-payment" onClick={addRow}>
          + Додати платіж
        </button>
      </div>
      <div className="payments-table-wrap">
        <table className="payments-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th className="col-amount">Сума</th>
              <th>Валюта</th>
              <th className="col-rate">Курс</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td>
                  <input
                    type="date"
                    value={p.date ? new Date(p.date).toISOString().slice(0, 10) : ''}
                    onChange={e => updatePayment(p.id, 'date', e.target.value)}
                  />
                </td>
                <td className="col-amount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.amount ?? ''}
                    onChange={e => updatePayment(p.id, 'amount', e.target.value)}
                    placeholder="0"
                  />
                </td>
                <td>
                  <select
                    value={p.currency || 'UAH'}
                    onChange={e => updatePayment(p.id, 'currency', e.target.value)}
                  >
                    {CURRENCIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="col-rate">
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={p.rate ?? 1}
                    onChange={e => updatePayment(p.id, 'rate', e.target.value)}
                    placeholder="1"
                    title="Курс до UAH"
                  />
                </td>
                <td className="col-action">
                  <button
                    type="button"
                    className="btn-remove-payment"
                    onClick={() => removeRow(p.id)}
                    disabled={payments.length <= 1}
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
      <div className="payments-summary">
        Разом (в UAH): <strong>{totalUAH.toLocaleString('uk-UA')} ₴</strong>
      </div>
    </div>
  );
}

export default PaymentsEditor;
