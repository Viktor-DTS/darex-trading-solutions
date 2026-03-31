import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import './GlobalCalculationCoefficientsEditor.css';

const EDIT_ROLES = ['admin', 'administrator', 'finance', 'buhgalteria'];

function canEditCoefficients(role) {
  return EDIT_ROLES.includes(String(role || '').toLowerCase());
}

/**
 * Редактор значень коефіцієнтів. Назви та примітки задаються на бекенді (програмно).
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

  const updateValue = (index, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], value };
      return next;
    });
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
          Лише перегляд. Змінювати значення можуть адміністратор, бухгалтерія (<code>buhgalteria</code>) або фінансовий відділ (<code>finance</code>).
        </div>
      )}
      {meta.updatedAt && (
        <div className="gcc-editor-meta">
          Оновлено:{' '}
          {new Date(meta.updatedAt).toLocaleString('uk-UA')}
          {meta.updatedByLogin ? ` · ${meta.updatedByLogin}` : ''}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="gcc-editor-empty">
          Наразі немає запрограмованих коефіцієнтів для цього напрямку. Нові рядки додаються в коді бекенду.
        </div>
      ) : (
        <>
          <div className="gcc-table-wrap">
            <table className="gcc-table">
              <thead>
                <tr>
                  <th>Назва</th>
                  <th>Значення</th>
                  <th>Примітка</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id || i}>
                    <td className="gcc-cell-label">{row.label}</td>
                    <td>
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          className="gcc-input gcc-input-number"
                          value={Number.isFinite(row.value) ? row.value : ''}
                          onChange={(e) =>
                            updateValue(
                              i,
                              e.target.value === '' ? 0 : parseFloat(e.target.value)
                            )
                          }
                        />
                      ) : (
                        <span className="gcc-cell-value">{row.value}</span>
                      )}
                    </td>
                    <td className="gcc-cell-note">{row.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editable && (
            <div className="gcc-actions">
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
        </>
      )}
    </div>
  );
}

export default GlobalCalculationCoefficientsEditor;
export { canEditCoefficients };
