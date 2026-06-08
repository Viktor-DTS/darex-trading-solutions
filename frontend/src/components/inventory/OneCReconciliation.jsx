import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../../config';
import './OneCReconciliation.css';

const STATUS_META = {
  matched: { label: 'Збіг', cls: 'ok' },
  qty_mismatch: { label: 'Розбіжність к-сті', cls: 'warn' },
  unaccounted_in_dts: { label: 'Є в 1С, нема у нас', cls: 'err' },
  pending_in_1c: { label: 'Є у нас, нема в 1С', cls: 'info' },
  discrepancy: { label: 'Розбіжність', cls: 'err' },
};

const OP_LABEL = {
  sale: 'Реалізація',
  receipt: 'Надходження',
  move: 'Переміщення',
  writeoff: 'Списання',
  return: 'Повернення',
  inventory: 'Інвентаризація',
  assembly: 'Комплектація',
};

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('uk-UA');
}

function toInputDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function OneCReconciliation() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [from, setFrom] = useState(toInputDate(monthAgo));
  const [to, setTo] = useState(toInputDate(today));
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ from, to, limit: '1000' });
      if (statusFilter) params.set('status', statusFilter);
      const r = await fetch(`${API_BASE_URL}/onec/reconciliation?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(json.error || `Помилка ${r.status}`);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e.message || 'Помилка мережі');
    } finally {
      setLoading(false);
    }
  }, [from, to, statusFilter]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = data?.summary;

  return (
    <div className="onec-recon">
      <div className="onec-recon-header">
        <h2>🔍 Звірка руху з 1С</h2>
        <p className="onec-recon-sub">
          Порівняння руху товару в 1С (зі звіту «Ведомость») з рухом у нашій системі. Прив'язка до заявки —
          по № у коментарі документа 1С або за номенклатурою/кількістю/датою/контрагентом.
        </p>
      </div>

      <div className="onec-recon-filters">
        <label>
          З
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          По
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Статус
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Усі</option>
            <option value="unaccounted_in_dts">Є в 1С, нема у нас</option>
            <option value="pending_in_1c">Є у нас, нема в 1С</option>
            <option value="qty_mismatch">Розбіжність к-сті</option>
            <option value="matched">Збіг</option>
          </select>
        </label>
        <button type="button" className="onec-recon-btn" onClick={load} disabled={loading}>
          {loading ? 'Завантаження…' : 'Оновити'}
        </button>
      </div>

      {error && <div className="onec-recon-error">{error}</div>}

      {s && (
        <div className="onec-recon-summary">
          <div className="onec-recon-card ok">
            <span className="num">{s.matched}</span>
            <span className="lbl">Збіги</span>
          </div>
          <div className="onec-recon-card warn">
            <span className="num">{s.qtyMismatch}</span>
            <span className="lbl">Розбіжність к-сті</span>
          </div>
          <div className="onec-recon-card err">
            <span className="num">{s.unaccountedInDts}</span>
            <span className="lbl">Є в 1С, нема у нас</span>
          </div>
          <div className="onec-recon-card info">
            <span className="num">{s.pendingIn1C}</span>
            <span className="lbl">Є у нас, нема в 1С</span>
          </div>
          <div className="onec-recon-card">
            <span className="num">{s.total1C}</span>
            <span className="lbl">Рухів 1С у періоді</span>
          </div>
        </div>
      )}

      {data && (
        <div className="onec-recon-table-wrap">
          <div className="onec-recon-count">
            Показано {data.rows.length} із {data.total}
          </div>
          <table className="onec-recon-table">
            <thead>
              <tr>
                <th>Статус</th>
                <th>Тип</th>
                <th>Документ / Заявка</th>
                <th>Дата</th>
                <th>Номенклатура</th>
                <th>К-сть 1С</th>
                <th>К-сть наша</th>
                <th>Контрагент</th>
                <th>Склади</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => {
                const meta = STATUS_META[row.status] || { label: row.status, cls: '' };
                const ref = row.shipmentRequestNumber || row.saleNumber;
                return (
                  <tr key={row.oneCMovementId || `${row.source}-${i}`} className={`row-${meta.cls}`}>
                    <td>
                      <span className={`onec-recon-badge ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td>{OP_LABEL[row.docType] || row.docType}</td>
                    <td>
                      <div className="onec-recon-doc">{row.docNumber || '—'}</div>
                      {ref && <div className="onec-recon-ref">заявка/продаж: {ref}</div>}
                      {row.comment && <div className="onec-recon-comment" title={row.comment}>{row.comment}</div>}
                    </td>
                    <td>{fmtDate(row.docDate)}</td>
                    <td className="onec-recon-nome" title={row.nomenclature}>{row.nomenclature}</td>
                    <td className="onec-recon-qty">{row.source === 'dts' ? '—' : row.qty}</td>
                    <td className="onec-recon-qty">
                      {row.dtsQty != null ? row.dtsQty : '—'}
                    </td>
                    <td className="onec-recon-contractor" title={row.contractor || row.dtsClientName}>
                      {row.contractor || row.dtsClientName || '—'}
                    </td>
                    <td className="onec-recon-wh">
                      {row.fromWarehouse1c || row.toWarehouse1c
                        ? `${row.fromWarehouse1c || '?'} → ${row.toWarehouse1c || '?'}`
                        : row.warehouse1c || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default OneCReconciliation;
