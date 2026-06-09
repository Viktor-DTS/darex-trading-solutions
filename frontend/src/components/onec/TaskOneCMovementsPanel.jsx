import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API_BASE_URL from '../../config';
import { taskRequiresOnecWriteoff } from './taskOnecMaterials';
import './TaskOneCMovementsPanel.css';

const OP_LABEL = {
  sale: 'Реалізація',
  receipt: 'Надходження',
  move: 'Переміщення',
  writeoff: 'Списання',
  return: 'Повернення',
  inventory: 'Інвентаризація',
  assembly: 'Комплектація',
  other: 'Інше',
};

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('uk-UA');
}

export default function TaskOneCMovementsPanel({ requestNumber, task = null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const requiresWriteoff = useMemo(() => taskRequiresOnecWriteoff(task), [task]);

  const load = useCallback(async () => {
    const rn = String(requestNumber || '').trim();
    if (!rn) {
      setItems([]);
      setSummary(null);
      return;
    }
    if (!taskRequiresOnecWriteoff(task)) {
      setItems([]);
      setSummary(null);
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ requestNumber: rn, limit: '80' });
      const r = await fetch(`${API_BASE_URL}/onec/movements/for-request?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Помилка ${r.status}`);
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary || null);
    } catch (e) {
      setError(e.message || 'Помилка');
      setItems([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [requestNumber, task]);

  useEffect(() => {
    load();
  }, [load]);

  const rn = String(requestNumber || '').trim();
  if (!rn) {
    return (
      <aside className="task-onec-panel">
        <h3 className="task-onec-panel__title">Дані з 1С</h3>
        <p className="task-onec-panel__empty">Номер заявки ще не задано.</p>
      </aside>
    );
  }

  return (
    <aside className="task-onec-panel" aria-label="Рух товару в 1С за заявкою">
      <div className="task-onec-panel__head">
        <h3 className="task-onec-panel__title">Дані з 1С</h3>
        <button type="button" className="task-onec-panel__refresh" onClick={load} disabled={loading} title="Оновити">
          {loading ? '…' : '↻'}
        </button>
      </div>
      <p className="task-onec-panel__hint">
        Списання та реалізація з журналу 1С, де в документі або коментарі згадується <strong>{rn}</strong>.
      </p>

      {!requiresWriteoff ? (
        <div className="task-onec-panel__banner task-onec-panel__banner--na">
          Не потребує списання 1С
        </div>
      ) : summary?.hasMovement ? (
        <div className="task-onec-panel__banner task-onec-panel__banner--ok">
          ✓ Є рух в 1С
          {summary.hasWriteoff && summary.hasSale
            ? ' (списання та реалізація)'
            : summary.hasWriteoff
              ? ' (списання)'
              : summary.hasSale
                ? ' (реалізація)'
                : ''}
        </div>
      ) : !loading && !error ? (
        <div className="task-onec-panel__banner task-onec-panel__banner--none">Немає руху в 1С за цим номером</div>
      ) : null}

      {error && <p className="task-onec-panel__error">{error}</p>}

      {!requiresWriteoff ? (
        <p className="task-onec-panel__empty">
          У заявці немає витратних матеріалів (олива, фільтри, антифриз, додаткові позиції).
        </p>
      ) : loading && !items.length ? (
        <p className="task-onec-panel__empty">Завантаження…</p>
      ) : items.length === 0 && !error ? (
        <p className="task-onec-panel__empty">
          Перевірте, що в коментарі документа списання або реалізації в 1С вказано номер заявки {rn}.
        </p>
      ) : (
        <div className="task-onec-panel__table-wrap">
          <table className="task-onec-panel__table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Документ</th>
                <th>Дата</th>
                <th>Номенклатура</th>
                <th>К-сть</th>
                <th>Склад</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row._id}
                  className={
                    row.docType === 'writeoff'
                      ? 'task-onec-row--writeoff'
                      : row.docType === 'sale'
                        ? 'task-onec-row--sale'
                        : ''
                  }
                >
                  <td>{OP_LABEL[row.docType] || row.docTypeName || row.docType || '—'}</td>
                  <td title={row.comment || ''}>
                    <div>{row.docNumber || '—'}</div>
                    {row.comment ? (
                      <div className="task-onec-panel__comment">{String(row.comment).slice(0, 120)}</div>
                    ) : null}
                  </td>
                  <td>{fmtDate(row.docDate)}</td>
                  <td>{row.nomenclature || '—'}</td>
                  <td>{row.qty != null ? row.qty : '—'}</td>
                  <td>{row.warehouse1c || row.fromWarehouse1c || row.toWarehouse1c || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}
