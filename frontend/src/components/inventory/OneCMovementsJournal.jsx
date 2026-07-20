import React, { useState, useEffect, useCallback } from 'react';
import { getOneCMovements } from '../../utils/onecMovementsAPI';
import './OneCMovementsJournal.css';

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('uk-UA');
  } catch {
    return '—';
  }
}

function toInputDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function formatWarehouse(row) {
  if (row.fromWarehouse1c || row.toWarehouse1c) {
    return [row.fromWarehouse1c, row.toWarehouse1c].filter(Boolean).join(' → ');
  }
  return row.warehouse1c || '—';
}

function formatDirection(row) {
  if (row.direction === 'in') return <span className="onec-movements-journal-badge-in">Прихід</span>;
  if (row.direction === 'out') return <span className="onec-movements-journal-badge-out">Видаток</span>;
  return '—';
}

function formatSum(row) {
  if (row.docSum == null || row.docSum === '') return '—';
  const sum = Number(row.docSum);
  const formatted = Number.isFinite(sum)
    ? sum.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : row.docSum;
  return row.currency ? `${formatted} ${row.currency}` : formatted;
}

export default function OneCMovementsJournal({
  title,
  docType,
  description,
  warehouses = [],
}) {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [from, setFrom] = useState(toInputDate(monthAgo));
  const [to, setTo] = useState(toInputDate(today));
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [skip, setSkip] = useState(0);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 100;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getOneCMovements({
        docType,
        from: from || undefined,
        to: to || undefined,
        warehouseId: warehouseId || undefined,
        search: search || undefined,
        skip,
        limit,
      });
      setData({ items: res.items || [], total: res.total || 0 });
    } catch (e) {
      setError(e.message || 'Помилка завантаження');
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [docType, from, to, warehouseId, search, skip]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSkip(0);
  }, [docType, from, to, warehouseId, search]);

  const canPrev = skip > 0;
  const canNext = skip + limit < data.total;

  const applySearch = () => setSearch(searchDraft.trim());

  return (
    <div className="inventory-tab-content onec-movements-journal">
      <div className="onec-movements-journal-header">
        <h2>{title}</h2>
        <p className="onec-movements-journal-desc">
          {description ||
            'Журнал операцій зі звіту 1С «Ведомость по товарам на складах». Дані оновлюються при імпорті через агента 1С або адмінку.'}
        </p>
      </div>

      <div className="onec-movements-journal-filters">
        <label>
          З
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          По
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {warehouses.length > 0 ? (
          <label>
            Склад DTS
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Усі склади</option>
              {warehouses.map((w) => (
                <option key={w._id || w.id} value={w._id || w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Пошук
          <input
            className="onec-movements-journal-search"
            type="search"
            placeholder="Номенклатура, № док., контрагент…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
        </label>
        <button type="button" className="btn-secondary" onClick={applySearch} disabled={loading}>
          Знайти
        </button>
      </div>

      <div className="onec-movements-journal-toolbar">
        <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
          Оновити
        </button>
        <span className="onec-movements-journal-count">
          Записів: {data.total}
          {loading ? ' …' : ''}
        </span>
      </div>

      {error ? <div className="onec-movements-journal-error">{error}</div> : null}

      <div className="onec-movements-journal-table-wrap">
        <table className="onec-movements-journal-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Документ</th>
              <th>Номенклатура</th>
              <th>К-сть</th>
              <th>Од.</th>
              <th>Напрям</th>
              <th>Склад</th>
              <th>Контрагент</th>
              <th>Відповідальний</th>
              <th>Сума</th>
              <th>Коментар</th>
            </tr>
          </thead>
          <tbody>
            {loading && data.items.length === 0 ? (
              <tr>
                <td colSpan={11} className="onec-movements-journal-empty">
                  Завантаження…
                </td>
              </tr>
            ) : null}
            {!loading && data.items.length === 0 ? (
              <tr>
                <td colSpan={11} className="onec-movements-journal-empty">
                  Записів за обраний період немає. Перевірте імпорт «Ведомости» з 1С.
                </td>
              </tr>
            ) : null}
            {data.items.map((row) => (
              <tr key={row._id}>
                <td>{fmtDateTime(row.docDate)}</td>
                <td>
                  {[row.docNumber, row.docTypeName].filter(Boolean).join(' · ') || '—'}
                </td>
                <td>{row.nomenclature || '—'}</td>
                <td>{row.qty != null ? row.qty : '—'}</td>
                <td>{row.unit || '—'}</td>
                <td>{formatDirection(row)}</td>
                <td>{formatWarehouse(row)}</td>
                <td>{row.contractor || '—'}</td>
                <td>{row.responsible || row.manager || '—'}</td>
                <td>{formatSum(row)}</td>
                <td className="onec-movements-journal-cell-notes">{row.comment || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="onec-movements-journal-pager">
        <button
          type="button"
          className="btn-secondary"
          disabled={!canPrev || loading}
          onClick={() => setSkip((s) => Math.max(0, s - limit))}
        >
          Попередня сторінка
        </button>
        <span className="onec-movements-journal-count">
          {data.total ? `${skip + 1}–${Math.min(skip + limit, data.total)} з ${data.total}` : '0'}
        </span>
        <button
          type="button"
          className="btn-secondary"
          disabled={!canNext || loading}
          onClick={() => setSkip((s) => s + limit)}
        >
          Наступна сторінка
        </button>
      </div>
    </div>
  );
}
