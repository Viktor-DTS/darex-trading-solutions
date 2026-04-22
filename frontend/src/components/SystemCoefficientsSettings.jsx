import React, { useCallback, useEffect, useState } from 'react';
import API_BASE_URL from '../config';
import { tryHandleUnauthorizedResponse } from '../utils/authSession';
import { normalizeUomLabel, useUnitsOfMeasure } from '../hooks/useUnitsOfMeasure';
import './SystemCoefficientsSettings.css';

function nextLocalId() {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function SystemCoefficientsSettings() {
  const { units, loading, error: loadError, reload } = useUnitsOfMeasure();
  const [rows, setRows] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setRows(
      (units || []).map((label, i) => ({
        id: `r-${i}-${String(label).slice(0, 8)}`,
        value: String(label)
      }))
    );
  }, [units]);

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    if (text) {
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const moveRow = (index, direction) => {
    setRows((prev) => {
      const j = index + direction;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const updateRow = (index, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], value };
      return next;
    });
  };

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addFromInput = useCallback(() => {
    const v = String(newLabel || '').trim();
    if (!v) {
      showMessage('Введіть текст одиниці виміру', true);
      return;
    }
    if (v.length > 32) {
      showMessage('Не довше 32 символів', true);
      return;
    }
    if (rows.some((r) => String(r.value).trim() === v)) {
      showMessage('Такий варіант вже є в списку', true);
      return;
    }
    setRows((prev) => [...prev, { id: nextLocalId(), value: v }]);
    setNewLabel('');
  }, [newLabel, rows]);

  const saveUnits = async () => {
    const items = rows.map((r) => String(r.value).trim()).filter(Boolean);
    const unique = [];
    const seen = new Set();
    for (const s of items) {
      if (s.length > 32) {
        showMessage('Кожен пункт — не довше 32 символів', true);
        return;
      }
      if (seen.has(s)) continue;
      seen.add(s);
      unique.push(s);
    }
    if (!unique.length) {
      showMessage('Має залишитись хоча б одна одиниця виміру', true);
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/units-of-measure`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ items: unique })
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Помилка збереження');
      }
      showMessage('Список збережено. Оновіть сторінки з випадними списками, якщо вони вже відкриті.');
      await reload();
    } catch (e) {
      showMessage(e.message || 'Помилка', true);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !rows.length) {
    return <div className="sys-coeff-hint">Завантаження…</div>;
  }

  return (
    <div className="sys-coeff">
      <h2 className="sys-coeff-title">Системні коефіцієнти</h2>
      <p className="sys-coeff-lead">
        Список <strong>одиниць виміру</strong> використовується в{' '}
        <strong>відділі закупівель</strong> (заявки) та в <strong>картках продукту</strong> (складський облік, надходження
        на склад).
      </p>

      {loadError ? <p className="sys-coeff-err">{loadError}</p> : null}
      {message ? (
        <p className={message.isError ? 'sys-coeff-err' : 'sys-coeff-ok'}>{message.text}</p>
      ) : null}

      <section className="sys-coeff-section" aria-labelledby="uom-heading">
        <h3 id="uom-heading">Одиниці виміру</h3>
        <p className="sys-coeff-hint">
          Порядок у списку зберігається. Значення мають збігатися з тим, як одиниці показуються в документах (напр.{' '}
          <code>шт.</code> з крапкою). Для карток продукту: якщо старе значення зникне зі списку, при збереженні карточки
          воно буде приведене до першого варіанту.
        </p>

        <div className="sys-coeff-table-wrap">
          <table className="sys-coeff-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Значення для випадного списку</th>
                <th className="sys-coeff-th-actions">Дії</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="sys-coeff-num">{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      className="sys-coeff-input"
                      value={row.value}
                      onChange={(e) => updateRow(index, e.target.value)}
                      maxLength={32}
                      placeholder="напр. шт."
                    />
                    <span className="sys-coeff-preview" title="Нормалізований вигляд">
                      → {normalizeUomLabel(row.value, units)}
                    </span>
                  </td>
                  <td className="sys-coeff-actions">
                    <button type="button" onClick={() => moveRow(index, -1)} disabled={index === 0} title="Вгору">
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(index, 1)}
                      disabled={index === rows.length - 1}
                      title="Вниз"
                    >
                      ↓
                    </button>
                    <button type="button" className="sys-coeff-btn-del" onClick={() => removeRow(index)} title="Видалити">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sys-coeff-add">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Нова одиниця (напр. т)"
            maxLength={32}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFromInput();
              }
            }}
          />
          <button type="button" className="sys-coeff-btn-secondary" onClick={addFromInput}>
            Додати в список
          </button>
        </div>

        <div className="sys-coeff-footer">
          <button type="button" className="sys-coeff-btn-primary" onClick={saveUnits} disabled={saving || loading}>
            {saving ? 'Збереження…' : 'Зберегти зміни'}
          </button>
        </div>
      </section>
    </div>
  );
}
