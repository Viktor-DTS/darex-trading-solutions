import React, { useState, useEffect, useCallback } from 'react';
import { getOneCMovements } from '../../utils/onecMovementsAPI';
import { extractRequestNumberFromOneC } from '../../utils/onecRequestNumber';
import OneCRequestViewModal from './OneCRequestViewModal';
import './OneCMovementsJournal.css';

const COL_COUNT = 14;

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
  if (row._groupedMove) {
    return formatMoveWarehouse(row);
  }
  if (row.fromWarehouse1c || row.toWarehouse1c) {
    return [row.fromWarehouse1c, row.toWarehouse1c].filter(Boolean).join(' → ');
  }
  return row.warehouse1c || '—';
}

function formatMoveWarehouse(row) {
  const from = row.fromWarehouse1c || '—';
  const to = row.toWarehouse1c || '—';
  return (
    <span className="onec-movements-journal-move-flow">
      <span className="onec-movements-journal-badge-out">Видаток</span> {from}
      <span className="onec-movements-journal-move-arrow"> → </span>
      <span className="onec-movements-journal-badge-in">Прихід</span> {to}
    </span>
  );
}

function formatWarehouseRegion(row, docType) {
  if (docType === 'move' && row._groupedMove) {
    const from = row.fromWarehouseRegion || '';
    const to = row.toWarehouseRegion || '';
    if (from && to && from !== to) return `${from} → ${to}`;
    return from || to || row.warehouseRegion || '—';
  }
  if (row.warehouseRegion) return row.warehouseRegion;
  if (row.direction === 'out') return row.fromWarehouseRegion || row.warehouseRegion || '—';
  if (row.direction === 'in') return row.toWarehouseRegion || row.warehouseRegion || '—';
  return row.fromWarehouseRegion || row.toWarehouseRegion || '—';
}

function formatDirection(row, docType) {
  if (docType === 'move' && row._groupedMove) {
    return <span className="onec-movements-journal-move-label">Переміщення</span>;
  }
  if (row.direction === 'in') return <span className="onec-movements-journal-badge-in">Прихід</span>;
  if (row.direction === 'out') return <span className="onec-movements-journal-badge-out">Видаток</span>;
  return '—';
}

/** Об'єднати пару in/out одного рядка переміщення в один запис таблиці. */
function groupMoveItems(items) {
  if (!items.length) return [];
  const groups = new Map();
  const order = [];

  for (const row of items) {
    const from = row.fromWarehouse1c || '';
    const to = row.toWarehouse1c || '';
    const t = row.docDate ? new Date(row.docDate).getTime() : 0;
    const key = `${row.docNumber}|${t}|${row.nomenclature}|${row.qty}|${from}|${to}|${row.serial || ''}`;

    if (!groups.has(key)) {
      groups.set(key, { out: null, in: null });
      order.push(key);
    }
    const g = groups.get(key);
    if (row.direction === 'out') g.out = row;
    else if (row.direction === 'in') g.in = row;
    else if (!g.out) g.out = row;
    else if (!g.in) g.in = row;
  }

  return order.map((key) => {
    const g = groups.get(key);
    if (g.out && g.in) {
      return {
        ...g.out,
        _id: `move:${g.out._id}:${g.in._id}`,
        _groupedMove: true,
        fromWarehouse1c: g.out.fromWarehouse1c || g.in.fromWarehouse1c,
        toWarehouse1c: g.out.toWarehouse1c || g.in.toWarehouse1c,
        warehouseRegion: g.out.warehouseRegion || g.in.warehouseRegion,
        fromWarehouseRegion: g.out.fromWarehouseRegion || g.in.fromWarehouseRegion,
        toWarehouseRegion: g.out.toWarehouseRegion || g.in.toWarehouseRegion,
        comment: g.out.comment || g.in.comment,
        responsible: g.out.responsible || g.in.responsible,
        manager: g.out.manager || g.in.manager,
      };
    }
    return g.out || g.in;
  });
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
  user,
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
  const [viewRequestNumber, setViewRequestNumber] = useState(null);
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
    const timer = setTimeout(() => {
      setSearch(searchDraft.trim());
    }, 2000);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    setSkip(0);
  }, [docType, from, to, warehouseId, search]);

  const canPrev = skip > 0;
  const canNext = skip + limit < data.total;

  const applySearch = () => setSearch(searchDraft.trim());

  const displayItems = docType === 'move' ? groupMoveItems(data.items) : data.items;

  return (
    <div className="inventory-tab-content onec-movements-journal">
      <div className="onec-movements-journal-top">
        <div className="onec-movements-journal-title-row">
          <h2>{title}</h2>
          {description ? (
            <p className="onec-movements-journal-desc" title={description}>
              {description}
            </p>
          ) : null}
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
          <button
            type="button"
            className="btn-secondary onec-movements-journal-btn"
            onClick={applySearch}
            disabled={loading}
            title="Застосувати пошук одразу"
          >
            Знайти
          </button>
          <button type="button" className="btn-secondary onec-movements-journal-btn" onClick={load} disabled={loading}>
            Оновити
          </button>
          <span className="onec-movements-journal-count">
            Записів: {data.total}
            {loading ? ' …' : ''}
          </span>
        </div>
      </div>

      {error ? <div className="onec-movements-journal-error">{error}</div> : null}

      <div className="onec-movements-journal-body">
        <div className="onec-movements-journal-table-wrap">
          <table className="onec-movements-journal-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Документ</th>
                <th>№ заявки</th>
                <th>Номенклатура</th>
                <th>К-сть</th>
                <th>Од.</th>
                <th>Напрям</th>
                <th>Склад</th>
                <th>Регіон складу</th>
                <th>Контрагент</th>
                <th>Відповідальний</th>
                <th>Менеджер</th>
                <th>Сума</th>
                <th>Коментар</th>
              </tr>
            </thead>
            <tbody>
              {loading && data.items.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className="onec-movements-journal-empty">
                    Завантаження…
                  </td>
                </tr>
              ) : null}
              {!loading && data.items.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className="onec-movements-journal-empty">
                    Записів за обраний період немає. Перевірте імпорт «Ведомости» з 1С.
                  </td>
                </tr>
              ) : null}
              {displayItems.map((row) => {
                const requestNumber = extractRequestNumberFromOneC(row);
                return (
                  <tr key={row._id}>
                    <td>{fmtDateTime(row.docDate)}</td>
                    <td>
                      {[row.docNumber, row.docTypeName].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="onec-movements-journal-cell-request">
                      {requestNumber ? (
                        <button
                          type="button"
                          className="onec-movements-journal-request-link"
                          onClick={() => setViewRequestNumber(requestNumber)}
                          title="Переглянути заявку"
                        >
                          {requestNumber}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{row.nomenclature || '—'}</td>
                    <td>{row.qty != null ? row.qty : '—'}</td>
                    <td>{row.unit || '—'}</td>
                    <td>{formatDirection(row, docType)}</td>
                    <td>{formatWarehouse(row)}</td>
                    <td>{formatWarehouseRegion(row, docType)}</td>
                    <td>{row.contractor || '—'}</td>
                    <td>{row.responsible || '—'}</td>
                    <td>{row.manager || '—'}</td>
                    <td>{formatSum(row)}</td>
                    <td className="onec-movements-journal-cell-notes">{row.comment || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="onec-movements-journal-pager">
          <button
            type="button"
            className="btn-secondary onec-movements-journal-pager-btn"
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
            className="btn-secondary onec-movements-journal-pager-btn"
            disabled={!canNext || loading}
            onClick={() => setSkip((s) => s + limit)}
          >
            Наступна сторінка
          </button>
        </div>
      </div>

      {viewRequestNumber ? (
        <OneCRequestViewModal
          requestNumber={viewRequestNumber}
          user={user}
          onClose={() => setViewRequestNumber(null)}
        />
      ) : null}
    </div>
  );
}
