import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API_BASE_URL from '../config';
import { filterProcurementAllowedWarehouses } from '../utils/procurementWarehouseFilter';
import EquipmentList from './equipment/EquipmentList';
import WarehouseTransferRequestModal from './WarehouseTransferRequestModal';
import '../components/InventoryDashboard.css';
import './ServiceStockPanel.css';

const STATUS_LABELS = {
  pending: 'Очікує підтвердження',
  approved: 'Підтверджено',
  rejected: 'Відхилено',
  cancelled: 'Скасовано',
};

export default function ServiceStockPanel({ user }) {
  const [warehouses, setWarehouses] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [transferInitial, setTransferInitial] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const equipmentListRef = useRef(null);

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const allowedWarehouses = useMemo(
    () => filterProcurementAllowedWarehouses(warehouses),
    [warehouses],
  );

  const allowedWarehouseNames = useMemo(
    () =>
      new Set(
        allowedWarehouses
          .map((w) => String(w.name || '').trim().toLowerCase())
          .filter(Boolean),
      ),
    [allowedWarehouses],
  );

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

  const handleRequestTransfer = useCallback((item) => {
    const whName = String(item.currentWarehouseName || item.currentWarehouse || '').trim();
    const productIdRaw = item.productId?._id || item.productId || '';
    setTransferInitial({
      label: String(item.type || '').trim(),
      productId: productIdRaw ? String(productIdRaw) : '',
      fromWarehouseName: whName,
      fromWarehouseId: String(item.currentWarehouse || ''),
      availableQty: Number(item.quantity) || 1,
    });
    setTransferOpen(true);
  }, []);

  return (
    <div className="service-stock-panel">
      <div className="service-stock-intro">
        <h1>Залишки на складах</h1>
        <p>
          Залишки завантажуються одразу. Список складів — як у відділі закупівель. Для переміщення
          на свій склад натисніть 🔁 у рядку.
        </p>
      </div>

      <div className="service-stock-layout inventory-dashboard-main">
        <div className="inventory-tab-content inventory-stock-list-only service-stock-list-area">
          <EquipmentList
            ref={equipmentListRef}
            user={user}
            warehouses={allowedWarehouses}
            serviceStockMode
            allowedWarehouseNames={allowedWarehouseNames}
            onRequestTransfer={handleRequestTransfer}
          />
        </div>
      </div>
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
