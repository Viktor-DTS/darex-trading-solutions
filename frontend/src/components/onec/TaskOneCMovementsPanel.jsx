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

const OP_BADGE = {
  sale: { short: 'Реал.', cls: 'sale' },
  writeoff: { short: 'Спис.', cls: 'writeoff' },
  receipt: { short: 'Надх.', cls: 'receipt' },
  move: { short: 'Перем.', cls: 'move' },
  return: { short: 'Пов.', cls: 'return' },
  inventory: { short: 'Інв.', cls: 'inventory' },
  assembly: { short: 'Комп.', cls: 'assembly' },
  other: { short: 'Ін.', cls: 'other' },
};

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('uk-UA');
}

function abbreviateWarehouse(name) {
  const s = String(name || '').trim();
  if (!s) return '—';
  const withoutPrefix = s.replace(/^склад\s+/i, '').trim();
  const candidate = withoutPrefix.length >= 3 ? withoutPrefix : s;
  if (candidate.length <= 14) return candidate;
  return `${candidate.slice(0, 12)}…`;
}

function warehouseFullName(row) {
  return String(row.warehouse1c || row.fromWarehouse1c || row.toWarehouse1c || '').trim();
}

function typeBadgeMeta(row) {
  const docType = row.docType;
  const preset = OP_BADGE[docType];
  if (preset) {
    return { short: preset.short, cls: preset.cls, title: OP_LABEL[docType] || row.docTypeName || docType };
  }
  const label = row.docTypeName || docType || '—';
  const short = label.length > 6 ? `${label.slice(0, 5)}.` : label;
  return { short, cls: 'other', title: label };
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
                <th className="task-onec-panel__col-type">Тип</th>
                <th className="task-onec-panel__col-doc">Документ</th>
                <th className="task-onec-panel__col-nom">Номенклатура</th>
                <th className="task-onec-panel__col-qty">К-сть</th>
                <th className="task-onec-panel__col-wh">Склад</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const badge = typeBadgeMeta(row);
                const whFull = warehouseFullName(row);
                const docTitle = [row.docNumber, row.comment].filter(Boolean).join('\n');
                return (
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
                    <td className="task-onec-panel__col-type">
                      <span
                        className={`task-onec-badge task-onec-badge--${badge.cls}`}
                        title={badge.title}
                      >
                        {badge.short}
                      </span>
                    </td>
                    <td className="task-onec-panel__col-doc" title={docTitle || undefined}>
                      <span className="task-onec-panel__doc-line">
                        <span className="task-onec-panel__doc-num">{row.docNumber || '—'}</span>
                        <span className="task-onec-panel__doc-date">{fmtDate(row.docDate)}</span>
                      </span>
                    </td>
                    <td className="task-onec-panel__col-nom">{row.nomenclature || '—'}</td>
                    <td className="task-onec-panel__col-qty">{row.qty != null ? row.qty : '—'}</td>
                    <td className="task-onec-panel__col-wh" title={whFull || undefined}>
                      {abbreviateWarehouse(whFull)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}
