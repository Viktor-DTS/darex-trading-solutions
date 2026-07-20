import React, { useState, useEffect, useCallback, useRef } from 'react';
import API_BASE_URL from '../../config';
import './ReceiptApproval.css';

/** Узгоджено з backend: основна кількість + аналог (якщо відвантажується аналог). */
function expectedQtyForProcurementLine(m) {
  if (!m || m.rejected) return 0;
  let main = 0;
  if (m.quantity != null && Number.isFinite(Number(m.quantity))) {
    main = Math.max(0, Number(m.quantity));
  }
  let analog = 0;
  if (
    m.analogShipped &&
    String(m.analogName || '').trim() &&
    m.analogQuantity != null &&
    Number.isFinite(Number(m.analogQuantity))
  ) {
    analog = Math.max(0, Number(m.analogQuantity));
  }
  const sum = main + analog;
  if (sum <= 0) return null;
  return sum;
}

function buildProcurementReceiptPayloadLine(m, raw) {
  const exp = expectedQtyForProcurementLine(m);
  const rq = raw;
  if (m.rejected) {
    const v = rq === '' || rq == null ? 0 : Number(rq);
    return { receivedQuantity: Number.isFinite(v) ? v : 0 };
  }
  if (exp === null) {
    if (rq === '' || rq == null) return { receivedQuantity: null };
    const v = Number(rq);
    return { receivedQuantity: Number.isFinite(v) ? v : null };
  }
  const v = rq === '' || rq == null ? exp : Number(rq);
  return { receivedQuantity: Number.isFinite(v) ? v : exp };
}

function ReceiptApproval({
  user,
  warehouses,
  focusProcurementId,
  onConsumedFocusProcurement,
  onProcurementReceiptChanged,
  onMoveReceiptChanged
}) {
  const [pendingMoves, setPendingMoves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMoveKeys, setSelectedMoveKeys] = useState(new Set());
  const [approving, setApproving] = useState(false);
  const [moveRegionalScope, setMoveRegionalScope] = useState(false);
  const [procurementInbound, setProcurementInbound] = useState([]);
  const [procurementLoading, setProcurementLoading] = useState(true);
  const [receiptDrafts, setReceiptDrafts] = useState({});
  const [procurementSubmitting, setProcurementSubmitting] = useState(null);
  /** Фінальне підтвердження прийому (як модалка після дії на вкладці «Надходження») */
  const [procurementConfirmModalPr, setProcurementConfirmModalPr] = useState(null);
  const procurementCardRefs = useRef({});

  const initReceiptDrafts = useCallback((rows) => {
    const next = {};
    for (const pr of rows) {
      const id = pr._id;
      next[id] = (pr.materials || []).map((m) => {
        if (m.rejected) return '0';
        const e = expectedQtyForProcurementLine(m);
        if (e === null) return '';
        return String(e);
      });
    }
    setReceiptDrafts(next);
  }, []);

  const loadProcurementInbound = useCallback(async () => {
    setProcurementLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/procurement-requests/pending-warehouse-receipt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        setProcurementInbound([]);
        return;
      }
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      setProcurementInbound(rows);
      initReceiptDrafts(rows);
    } catch {
      setProcurementInbound([]);
    } finally {
      setProcurementLoading(false);
    }
  }, [initReceiptDrafts]);

  const loadPendingMoves = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/onec/pending-move-receipts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setPendingMoves([]);
        return;
      }
      const data = await res.json();
      setPendingMoves(Array.isArray(data.items) ? data.items : []);
      setMoveRegionalScope(Boolean(data.regionalScope));
    } catch {
      setPendingMoves([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPendingMoves();
    loadProcurementInbound();
  }, [loadPendingMoves, loadProcurementInbound]);

  useEffect(() => {
    if (!focusProcurementId) return;
    const id = String(focusProcurementId);
    const t = window.setTimeout(() => {
      const el = procurementCardRefs.current[id];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        onConsumedFocusProcurement?.();
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusProcurementId, procurementInbound, onConsumedFocusProcurement]);

  useEffect(() => {
    if (!procurementConfirmModalPr) return;
    const stillThere = procurementInbound.some(
      (p) => String(p._id) === String(procurementConfirmModalPr._id)
    );
    if (!stillThere) setProcurementConfirmModalPr(null);
  }, [procurementInbound, procurementConfirmModalPr]);

  const handleToggleSelect = (moveKey) => {
    setSelectedMoveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(moveKey)) next.delete(moveKey);
      else next.add(moveKey);
      return next;
    });
  };

  const handleSelectAll = () => {
    const allKeys = pendingMoves.map((m) => m.moveKey).filter(Boolean);
    if (selectedMoveKeys.size === allKeys.length && allKeys.length > 0) {
      setSelectedMoveKeys(new Set());
    } else {
      setSelectedMoveKeys(new Set(allKeys));
    }
  };

  const handleConfirmMoves = async () => {
    if (selectedMoveKeys.size === 0) {
      alert('Виберіть хоча б одне переміщення для підтвердження');
      return;
    }
    if (!confirm(`Підтвердити прийом ${selectedMoveKeys.size} переміщень з 1С?`)) {
      return;
    }
    setApproving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/onec/confirm-move-receipts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moveKeys: Array.from(selectedMoveKeys) }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        alert(`Підтверджено: ${result.confirmedCount || 0} переміщень`);
        setSelectedMoveKeys(new Set());
        loadPendingMoves();
        onMoveReceiptChanged?.();
      } else {
        alert(`Помилка: ${result.error || 'Не вдалося підтвердити'}`);
      }
    } catch (error) {
      alert('Помилка підтвердження переміщень');
    } finally {
      setApproving(false);
    }
  };

  const getWarehouseName = (warehouseId) => {
    if (!warehouseId) return 'Не вказано';
    const warehouse = warehouses.find(w => w._id === warehouseId);
    return warehouse ? warehouse.name : warehouseId;
  };

  const updateReceiptDraft = (requestId, lineIdx, value) => {
    setReceiptDrafts((prev) => {
      const arr = [...(prev[requestId] || [])];
      arr[lineIdx] = value;
      return { ...prev, [requestId]: arr };
    });
  };

  const openProcurementConfirmModal = (pr) => {
    const id = pr._id;
    const draft = receiptDrafts[id];
    if (!draft || draft.length !== (pr.materials || []).length) {
      alert('Некоректні дані рядків прийому');
      return;
    }
    setProcurementConfirmModalPr(pr);
  };

  const submitProcurementReceipt = async (pr) => {
    const id = pr._id;
    const draft = receiptDrafts[id];
    if (!draft || draft.length !== (pr.materials || []).length) {
      alert('Некоректні дані рядків прийому');
      return;
    }
    setProcurementSubmitting(id);
    try {
      const token = localStorage.getItem('token');
      const lines = (pr.materials || []).map((m, i) => buildProcurementReceiptPayloadLine(m, draft[i]));
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${id}/warehouse-receipt`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lines })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося зберегти прийом');
        return;
      }
      const data = await res.json().catch(() => ({}));
      await loadProcurementInbound();
      onProcurementReceiptChanged?.();
      setProcurementConfirmModalPr(null);
      if (data.warehouseStockError) {
        alert(
          `Прийом у заявці збережено, але залишки на складі (Equipment) не нараховано автоматично — зверніться до адміністратора.\n\n${data.warehouseStockError}`
        );
      } else {
        alert('Прийом на складі збережено');
      }
    } catch (e) {
      alert(e.message || 'Помилка');
    } finally {
      setProcurementSubmitting(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Не вказано';
    try {
      return new Date(dateString).toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const groupedByWarehouse = pendingMoves.reduce((acc, move) => {
    const warehouseId = move.toWarehouseId || move.toWarehouseName || 'unknown';
    const warehouseName = move.toWarehouseName || getWarehouseName(warehouseId);
    if (!acc[warehouseId]) {
      acc[warehouseId] = { warehouseId, warehouseName, moves: [] };
    }
    acc[warehouseId].moves.push(move);
    return acc;
  }, {});

  const totalMovesCount = pendingMoves.length;

  return (
    <div className="receipt-approval">
      <div className="receipt-approval-header">
        <h2>Затвердження отримання товару</h2>
        <p className="receipt-approval-description">
          Спочатку вкажіть фактичні кількості по заявці закупівель; натисніть «Підтвердити прийом на складі» — відкриється
          вікно підтвердження (як при прийомі на вкладці «Надходження»). Нижче — підтвердження прийому переміщень з 1С на ваш склад.
        </p>
      </div>

      <div className="procurement-receipt-section" id="procurement-inbound-block">
        <h3>Надходження від закупівель</h3>
        <p className="procurement-receipt-hint">
          Заявки у статусі «Чекає відвантаження на склад» для складів вашого регіону. У колонці «Прийнято факт» введіть
          фактичну кількість; при розбіжностях відділ закупівель отримає сповіщення. Після підтвердження вашої частини
          заявка зникне зі списку, доки інший регіон не завершить прийом (якщо заявка на кілька складів).
        </p>
        {procurementLoading ? (
          <div className="loading-indicator">Завантаження…</div>
        ) : procurementInbound.length === 0 ? (
          <p className="receipt-approval-description">Немає очікуваних надходжень від відділу закупівель.</p>
        ) : (
          procurementInbound.map((pr) => (
            <div
              key={pr._id}
              id={`procurement-receipt-${pr._id}`}
              ref={(el) => {
                if (el) procurementCardRefs.current[pr._id] = el;
                else delete procurementCardRefs.current[pr._id];
              }}
              className="procurement-receipt-card"
            >
              <div className="procurement-receipt-card-head">
                <span>
                  <strong>№ заявки:</strong> {pr.requestNumber || '—'}
                </span>
                <span>
                  <strong>Склад:</strong> {pr.actualWarehouse || '—'}
                </span>
                <span>
                  <strong>Виконавець (закупівлі):</strong> {pr.executorName || pr.executorLogin || '—'}
                </span>
              </div>
              <div className="procurement-receipt-table-wrap">
                <table className="procurement-receipt-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Фактичний склад</th>
                      <th>Найменування / аналог</th>
                      <th>Очікувано</th>
                      <th>Прийнято факт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pr.materials || [])
                      .map((m, idx) => ({ m, idx }))
                      .filter(({ m }) => m.receiptLineEditable !== false)
                      .map(({ m, idx }, visIdx) => {
                      const exp = expectedQtyForProcurementLine(m);
                      const expLabel = m.rejected
                        ? '0 (відхилено)'
                        : exp === null
                          ? '—'
                          : String(exp);
                      const lineWh =
                        String(m.actualWarehouse || '').trim() || String(pr.actualWarehouse || '').trim() || '—';
                      const rowLabel = m.rejected
                        ? `${m.name || '—'} (відхилено)`
                        : [m.name, m.analogName && `Аналог: ${m.analogName}`].filter(Boolean).join(' · ');
                      const draftRow = receiptDrafts[pr._id] || [];
                      const val = draftRow[idx] ?? '';
                      return (
                        <tr key={idx}>
                          <td>{visIdx + 1}</td>
                          <td className="procurement-receipt-line-warehouse">{lineWh}</td>
                          <td>{rowLabel}</td>
                          <td>{expLabel}</td>
                          <td>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={val}
                              disabled={procurementSubmitting === pr._id}
                              onChange={(e) => updateReceiptDraft(pr._id, idx, e.target.value)}
                              aria-label={`Прийнято факт, позиція ${idx + 1}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="procurement-receipt-actions">
                <button
                  type="button"
                  className="btn-procurement-submit"
                  disabled={procurementSubmitting === pr._id}
                  onClick={() => openProcurementConfirmModal(pr)}
                >
                  Підтвердити прийом на складі
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {procurementConfirmModalPr && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="procurement-confirm-modal-title"
          onClick={() => !procurementSubmitting && setProcurementConfirmModalPr(null)}
        >
          <div className="modal-content receipt-document-modal procurement-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="procurement-confirm-modal-title">
                📥 Підтвердження надходження на склад
                {procurementConfirmModalPr.requestNumber ? ` — ${procurementConfirmModalPr.requestNumber}` : ''}
              </h3>
              <button
                type="button"
                className="btn-close"
                disabled={!!procurementSubmitting}
                onClick={() => setProcurementConfirmModalPr(null)}
                aria-label="Закрити"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="document-info">
                <div className="info-row">
                  <span className="label">Склад:</span>
                  <span className="value">{procurementConfirmModalPr.actualWarehouse || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Виконавець (закупівлі):</span>
                  <span className="value">
                    {procurementConfirmModalPr.executorName || procurementConfirmModalPr.executorLogin || '—'}
                  </span>
                </div>
              </div>
              <p className="procurement-confirm-modal-lead">
                Перевірте фактичні кількості та завершіть прийом — товар буде обліковано на зазначеному складі.
              </p>
                <div className="procurement-receipt-table-wrap">
                <table className="procurement-receipt-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Фактичний склад</th>
                      <th>Найменування / аналог</th>
                      <th>Очікувано</th>
                      <th>Прийнято факт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(procurementConfirmModalPr.materials || [])
                      .map((m, idx) => ({ m, idx }))
                      .filter(({ m }) => m.receiptLineEditable !== false)
                      .map(({ m, idx }, visIdx) => {
                      const exp = expectedQtyForProcurementLine(m);
                      const expLabel = m.rejected
                        ? '0 (відхилено)'
                        : exp === null
                          ? '—'
                          : String(exp);
                      const lineWh =
                        String(m.actualWarehouse || '').trim() ||
                        String(procurementConfirmModalPr.actualWarehouse || '').trim() ||
                        '—';
                      const rowLabel = m.rejected
                        ? `${m.name || '—'} (відхилено)`
                        : [m.name, m.analogName && `Аналог: ${m.analogName}`].filter(Boolean).join(' · ');
                      const draftRow = receiptDrafts[procurementConfirmModalPr._id] || [];
                      const val = draftRow[idx] ?? '';
                      return (
                        <tr key={idx}>
                          <td>{visIdx + 1}</td>
                          <td className="procurement-receipt-line-warehouse">{lineWh}</td>
                          <td>{rowLabel}</td>
                          <td>{expLabel}</td>
                          <td>{val === '' ? '—' : val}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                disabled={!!procurementSubmitting}
                onClick={() => setProcurementConfirmModalPr(null)}
              >
                Назад до редагування
              </button>
              <button
                type="button"
                className="btn-procurement-submit"
                disabled={procurementSubmitting === procurementConfirmModalPr._id}
                onClick={() => submitProcurementReceipt(procurementConfirmModalPr)}
              >
                {procurementSubmitting === procurementConfirmModalPr._id
                  ? 'Збереження…'
                  : 'Завершити прийом на склад'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="receipt-approval-header" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20 }}>Переміщення з 1С (очікують прийому)</h2>
        <p className="receipt-approval-description">
          Оберіть рядки переміщення з 1С, які фактично отримані на склад. Після підтвердження вони не з&apos;являться
          повторно при наступному імпорті ведомості.
          {moveRegionalScope ? ' Показано переміщення на склади вашого регіону.' : ''}
        </p>
      </div>

      {loading ? (
        <div className="loading-indicator">Завантаження переміщень…</div>
      ) : pendingMoves.length === 0 ? (
        <div className="empty-state">
          <p>Немає переміщень 1С, що очікують підтвердження прийому</p>
        </div>
      ) : (
        <>
          <div className="receipt-approval-toolbar">
            <div className="toolbar-left">
              <button type="button" className="btn-select-all" onClick={handleSelectAll}>
                {selectedMoveKeys.size === totalMovesCount && totalMovesCount > 0
                  ? 'Скасувати вибір'
                  : 'Вибрати всі'}
              </button>
              <span className="selected-count">
                Вибрано: {selectedMoveKeys.size} з {totalMovesCount}
              </span>
            </div>
            <div className="toolbar-right">
              <button
                type="button"
                className="btn-approve-receipt"
                onClick={handleConfirmMoves}
                disabled={selectedMoveKeys.size === 0 || approving}
              >
                {approving ? 'Підтвердження…' : `✅ Підтвердити прийом (${selectedMoveKeys.size})`}
              </button>
            </div>
          </div>

          <div className="receipt-approval-content">
            {Object.values(groupedByWarehouse).map((group) => (
              <div key={group.warehouseId} className="warehouse-group">
                <div className="warehouse-group-header">
                  <h3>📦 Склад: {group.warehouseName}</h3>
                  <span className="warehouse-count">
                    {group.moves.length}{' '}
                    {group.moves.length === 1 ? 'переміщення' : 'переміщень'}
                  </span>
                </div>
                <div className="equipment-table-wrapper">
                  <table className="equipment-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>Дата</th>
                        <th>Документ 1С</th>
                        <th>Номенклатура</th>
                        <th>К-сть</th>
                        <th>Зі складу</th>
                        <th>Регіон</th>
                        <th>Коментар</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.moves.map((move) => (
                        <tr
                          key={move.moveKey}
                          className={selectedMoveKeys.has(move.moveKey) ? 'fully-selected' : ''}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedMoveKeys.has(move.moveKey)}
                              onChange={() => handleToggleSelect(move.moveKey)}
                              aria-label="Обрати переміщення"
                            />
                          </td>
                          <td>{formatDate(move.docDate)}</td>
                          <td>
                            <strong>{move.docNumber || '—'}</strong>
                            {move.docTypeName ? (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                {move.docTypeName}
                              </div>
                            ) : null}
                          </td>
                          <td>{move.nomenclature || '—'}</td>
                          <td>
                            {move.qty != null ? move.qty : '—'} {move.unit || ''}
                          </td>
                          <td>{move.fromWarehouse1c || '—'}</td>
                          <td>{move.toWarehouseRegion || '—'}</td>
                          <td>{move.comment || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ReceiptApproval;

