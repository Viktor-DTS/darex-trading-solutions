import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import './GlobalCalculationCoefficientsEditor.css';

const EDIT_ROLES = ['admin', 'administrator', 'finance', 'buhgalteria'];

function roundToHundredths(n) {
  const x = typeof n === 'number' ? n : parseFloat(String(n).replace(',', '.'));
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function formatCoefficientValueDisplay(v) {
  return roundToHundredths(v).toFixed(2);
}

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
        const list = Array.isArray(block?.rows) ? block.rows : [];
        setRows(
          list.map((r) => ({
            ...r,
            value: roundToHundredths(r.value)
          }))
        );
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
        const list = block?.rows || rows;
        setRows(
          list.map((r) => ({
            ...r,
            value: roundToHundredths(r.value)
          }))
        );
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
                          step="0.01"
                          className="gcc-input gcc-input-number"
                          value={Number.isFinite(row.value) ? row.value : ''}
                          placeholder="0.00"
                          onChange={(e) => {
                            const t = e.target.value;
                            if (t === '') {
                              updateValue(i, 0);
                              return;
                            }
                            const p = parseFloat(t.replace(',', '.'));
                            if (!Number.isNaN(p)) updateValue(i, p);
                          }}
                          onBlur={() => {
                            setRows((prev) => {
                              const next = [...prev];
                              const cur = next[i];
                              if (!cur) return prev;
                              const r = roundToHundredths(cur.value);
                              if (r === cur.value) return prev;
                              next[i] = { ...cur, value: r };
                              return next;
                            });
                          }}
                        />
                      ) : (
                        <span className="gcc-cell-value">
                          {formatCoefficientValueDisplay(row.value)}
                        </span>
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
