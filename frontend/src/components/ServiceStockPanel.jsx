import React, { useCallback, useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import { useNomenclatureStock } from '../hooks/useNomenclatureStock';
import NomenclatureStockPanel from './shared/NomenclatureStockPanel';
import WarehouseTransferRequestModal from './WarehouseTransferRequestModal';
import './ServiceStockPanel.css';

const STATUS_LABELS = {
  pending: 'Очікує підтвердження',
  approved: 'Підтверджено',
  rejected: 'Відхилено',
  cancelled: 'Скасовано',
};

export default function ServiceStockPanel({ user }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [hints, setHints] = useState([]);
  const [hintsLoading, setHintsLoading] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [transferInitial, setTransferInitial] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(String(searchQuery || '').trim()), 280);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/warehouses`, { headers: authHeaders });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setWarehouses(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  useEffect(() => {
    const q = debouncedQuery;
    if (q.length < 2) {
      setHints([]);
      setHintsLoading(false);
      return undefined;
    }
    setHintsLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/service/material-hints?q=${encodeURIComponent(q)}`,
          { headers: authHeaders },
        );
        if (!res.ok) throw new Error('hints failed');
        const data = await res.json();
        setHints(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setHints([]);
      } finally {
        setHintsLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [debouncedQuery, authHeaders]);

  const stockMaterials = useMemo(() => {
    if (debouncedQuery.length >= 2) {
      return [{ name: debouncedQuery, productId: hints[0]?.id ? String(hints[0].id) : '' }];
    }
    return [];
  }, [debouncedQuery, hints]);

  const { items: stockItems, loading: stockLoading, hasMaterials } = useNomenclatureStock(
    stockMaterials,
    { authHeaders, warehouses, enabled: debouncedQuery.length >= 2 },
  );

  const loadMyRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/warehouse-transfer-requests?mine=1`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('requests failed');
      const data = await res.json();
      setMyRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setMyRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadMyRequests();
  }, [loadMyRequests]);

  const handleRequestTransfer = (payload) => {
    setTransferInitial(payload);
    setTransferOpen(true);
  };

  return (
    <div className="service-stock-panel">
      <div className="service-stock-header">
        <h1>Залишки на складах</h1>
        <p>
          Перегляд залишків матеріалів для виконання заявок. Список складів — як у відділі закупівель.
          Якщо матеріал є на іншому складі, можна надіслати запит на переміщення завскладу.
        </p>
      </div>

      <div className="service-stock-search-row">
        <input
          type="search"
          className="service-stock-search"
          placeholder="Пошук номенклатури (мін. 2 символи)…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {hintsLoading && debouncedQuery.length >= 2 ? (
        <p className="service-stock-subhint">Пошук номенклатури…</p>
      ) : null}

      {hints.length > 0 && debouncedQuery.length >= 2 ? (
        <div className="service-stock-hints">
          {hints.slice(0, 8).map((h) => (
            <button
              key={`${h.id || h.label}`}
              type="button"
              className="service-stock-hint-chip"
              onClick={() => setSearchQuery(h.label || '')}
            >
              {h.label}
              {h.regionQty > 0 ? ` · ${h.regionQty} у регіоні` : ''}
            </button>
          ))}
        </div>
      ) : null}

      <NomenclatureStockPanel
        items={stockItems}
        loading={stockLoading}
        canRequestTransfer
        onRequestTransfer={handleRequestTransfer}
        emptyHint={
          debouncedQuery.length < 2
            ? 'Введіть назву матеріалу для перегляду залишків.'
            : hasMaterials
              ? 'Залишків не знайдено.'
              : 'Введіть назву матеріалу (мінімум 2 символи).'
        }
      />

      <section className="service-stock-requests">
        <div className="service-stock-requests-head">
          <h2>Мої запити на переміщення</h2>
          <button type="button" className="service-stock-refresh" onClick={loadMyRequests}>
            Оновити
          </button>
        </div>
        {requestsLoading ? (
          <p className="service-stock-subhint">Завантаження…</p>
        ) : !myRequests.length ? (
          <p className="service-stock-subhint">Запитів поки немає.</p>
        ) : (
          <div className="service-stock-requests-table-wrap">
            <table className="service-stock-requests-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Номенклатура</th>
                  <th>З → На</th>
                  <th>К-сть</th>
                  <th>Статус</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.map((r) => (
                  <tr key={r._id}>
                    <td>{r.requestNumber || '—'}</td>
                    <td>{r.nomenclature}</td>
                    <td>
                      {r.fromWarehouseName} → {r.toWarehouseName}
                    </td>
                    <td>{r.quantity}</td>
                    <td>
                      <span className={`service-stock-status service-stock-status--${r.status}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                      {r.status === 'rejected' && r.sourceRejectReason ? (
                        <div className="service-stock-reject-reason">{r.sourceRejectReason}</div>
                      ) : null}
                    </td>
                    <td>
                      {r.createdAt ? new Date(r.createdAt).toLocaleString('uk-UA') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <WarehouseTransferRequestModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        user={user}
        authHeaders={authHeaders}
        warehouses={warehouses}
        initial={transferInitial}
        onSuccess={() => loadMyRequests()}
      />
    </div>
  );
}
