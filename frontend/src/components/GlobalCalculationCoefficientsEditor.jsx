import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import './GlobalCalculationCoefficientsEditor.css';

const EDIT_ROLES = ['admin', 'administrator', 'finance', 'buhgalteria'];

function canEditCoefficients(role) {
  return EDIT_ROLES.includes(String(role || '').toLowerCase());
}

/**
 * Редактор коефіцієнтів за напрямком: sales | service (фінансовий відділ).
 */
function GlobalCalculationCoefficientsEditor({ user, scope, title, description }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({ updatedAt: null, updatedByLogin: null });
  const editable = canEditCoefficients(user?.role);

  const load = useCallback(async () => {
    if (!scope || (scope !== 'sales' && scope !== 'service')) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/global-calculation-coefficients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const block = scope === 'sales' ? data.sales : data.service;
        setRows(Array.isArray(block?.rows) ? block.rows : []);
        setMeta({
          updatedAt: block?.updatedAt,
          updatedByLogin: block?.updatedByLogin
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const updateRow = (index, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `custom_${Date.now()}`,
        label: '',
        value: 0,
        note: ''
      }
    ]);
  };

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!editable || !scope) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/global-calculation-coefficients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ scope, rows })
      });
      if (res.ok) {
        const data = await res.json();
        const block = scope === 'sales' ? data.sales : data.service;
        setRows(block?.rows || rows);
        setMeta({
          updatedAt: block?.updatedAt,
          updatedByLogin: block?.updatedByLogin
        });
        alert('Коефіцієнти збережено');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Помилка збереження');
      }
    } catch (e) {
      alert('Помилка з\'єднання');
    } finally {
      setSaving(false);
    }
  };

  if (!scope || (scope !== 'sales' && scope !== 'service')) {
    return null;
  }

  if (loading) {
    return <div className="gcc-editor-loading">Завантаження…</div>;
  }

  return (
    <div className="gcc-editor">
      {(title || description) && (
        <div className="gcc-editor-header">
          {title && <h2 className="gcc-editor-title">{title}</h2>}
          {description && <p className="gcc-editor-desc">{description}</p>}
        </div>
      )}
      {!editable && (
        <div className="gcc-editor-readonly-banner">
          Лише перегляд. Змінювати можуть адміністратор, бухгалтерія (<code>buhgalteria</code>) або фінансовий відділ (<code>finance</code>).
        </div>
      )}
      {meta.updatedAt && (
        <div className="gcc-editor-meta">
          Оновлено:{' '}
          {new Date(meta.updatedAt).toLocaleString('uk-UA')}
          {meta.updatedByLogin ? ` · ${meta.updatedByLogin}` : ''}
        </div>
      )}
      <div className="gcc-table-wrap">
        <table className="gcc-table">
          <thead>
            <tr>
              <th>Назва</th>
              <th>Значення</th>
              <th>Примітка</th>
              {editable && <th className="gcc-col-actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id || i}>
                <td>
                  {editable ? (
                    <input
                      className="gcc-input"
                      value={row.label}
                      onChange={(e) => updateRow(i, 'label', e.target.value)}
                      placeholder="Назва коефіцієнта"
                    />
                  ) : (
                    row.label
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      type="number"
                      step="any"
                      className="gcc-input gcc-input-number"
                      value={Number.isFinite(row.value) ? row.value : ''}
                      onChange={(e) =>
                        updateRow(i, 'value', e.target.value === '' ? 0 : parseFloat(e.target.value))
                      }
                    />
                  ) : (
                    row.value
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="gcc-input"
                      value={row.note || ''}
                      onChange={(e) => updateRow(i, 'note', e.target.value)}
                      placeholder="—"
                    />
                  ) : (
                    row.note || '—'
                  )}
                </td>
                {editable && (
                  <td className="gcc-col-actions">
                    <button
                      type="button"
                      className="gcc-btn-remove"
                      onClick={() => removeRow(i)}
                      title="Видалити рядок"
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="gcc-actions">
          <button type="button" className="gcc-btn gcc-btn-secondary" onClick={addRow}>
            + Додати рядок
          </button>
          <button
            type="button"
            className="gcc-btn gcc-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Збереження…' : 'Зберегти'}
          </button>
        </div>
      )}
    </div>
  );
}

export default GlobalCalculationCoefficientsEditor;
export { canEditCoefficients };
