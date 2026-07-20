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

const MOVE_PAGE_SIZE = 50;

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
  const [movePage, setMovePage] = useState(0);
  const [moveRegionalScope, setMoveRegionalScope] = useState(false);
  const [moveReceiptDrafts, setMoveReceiptDrafts] = useState({});
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
      const items = Array.isArray(data.items) ? data.items : [];
      setPendingMoves(items);
      setMoveRegionalScope(Boolean(data.regionalScope));
      const drafts = {};
      for (const m of items) {
        if (m.moveKey) {
          drafts[m.moveKey] = m.qty != null ? String(m.qty) : '';
        }
      }
      setMoveReceiptDrafts(drafts);
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
    setMovePage(0);
  }, [pendingMoves.length]);

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

  const updateMoveReceiptDraft = (moveKey, value) => {
    setMoveReceiptDrafts((prev) => ({ ...prev, [moveKey]: value }));
  };

  const handleConfirmMoves = async () => {
    if (selectedMoveKeys.size === 0) {
      alert('Виберіть хоча б одне переміщення для підтвердження');
      return;
    }

    const items = [];
    for (const moveKey of selectedMoveKeys) {
      const move = pendingMoves.find((m) => m.moveKey === moveKey);
      if (!move) continue;
      const raw = moveReceiptDrafts[moveKey];
      const v = raw === '' || raw == null ? move.qty : Number(raw);
      if (!Number.isFinite(v) || v < 0) {
        alert(`Некоректна кількість для «${move.nomenclature || move.docNumber || moveKey}»`);
        return;
      }
      items.push({ moveKey, receivedQuantity: v });
    }

    if (!items.length) {
      alert('Немає рядків для підтвердження');
      return;
    }

    const partialCount = items.filter((it) => {
      const move = pendingMoves.find((m) => m.moveKey === it.moveKey);
      const exp = move?.qty != null ? Number(move.qty) : null;
      return exp != null && Number.isFinite(exp) && it.receivedQuantity < exp;
    }).length;

    const confirmMsg =
      partialCount > 0
        ? `Підтвердити ${items.length} переміщень? ${partialCount} з частковим прийомом — відправнику регіону буде надіслано сповіщення.`
        : `Підтвердити прийом ${items.length} переміщень з 1С?`;
    if (!confirm(confirmMsg)) {
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
        body: JSON.stringify({ items }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        const partialNote =
          result.partialCount > 0
            ? ` Часткових: ${result.partialCount} (сповіщення відправнику).`
            : '';
        alert(`Підтверджено: ${result.confirmedCount || 0} переміщень.${partialNote}`);
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

  const totalMovesCount = pendingMoves.length;
  const movePageCount = Math.max(1, Math.ceil(totalMovesCount / MOVE_PAGE_SIZE));
  const safeMovePage = Math.min(movePage, movePageCount - 1);
  const moveSkip = safeMovePage * MOVE_PAGE_SIZE;
  const pageMoves = pendingMoves.slice(moveSkip, moveSkip + MOVE_PAGE_SIZE);

  const groupedByWarehouse = pageMoves.reduce((acc, move) => {
    const warehouseId = move.toWarehouseId || move.toWarehouseName || 'unknown';
    const warehouseName = move.toWarehouseName || getWarehouseName(warehouseId);
    if (!acc[warehouseId]) {
      acc[warehouseId] = { warehouseId, warehouseName, moves: [] };
    }
    acc[warehouseId].moves.push(move);
    return acc;
  }, {});

  const procurementEmpty = !procurementLoading && procurementInbound.length === 0;

  return (
    <div className="receipt-approval">
      <div className="receipt-approval-topbar">
        <h2>Затвердження отримання товару</h2>
      </div>

      <details
        id="procurement-inbound-block"
        className={`receipt-procurement-block${procurementEmpty ? ' receipt-procurement-block--empty' : ''}`}
        open={!procurementEmpty}
      >
        <summary className="receipt-procurement-summary">
          <span className="receipt-procurement-summary-title">Надходження від закупівель</span>
          {procurementLoading ? (
            <span className="receipt-procurement-summary-meta">завантаження…</span>
          ) : procurementEmpty ? (
            <span className="receipt-procurement-summary-meta">немає очікуваних</span>
          ) : (
            <span className="receipt-procurement-summary-meta receipt-procurement-summary-meta--active">
              {procurementInbound.length} заявок
            </span>
          )}
        </summary>
        <p className="receipt-procurement-hint">
          Заявки «Чекає відвантаження на склад». У колонці «Прийнято факт» вкажіть кількість; при розбіжностях
          закупівлі отримають сповіщення.
        </p>
        {procurementLoading ? (
          <div className="receipt-inline-status">Завантаження…</div>
        ) : procurementEmpty ? null : (
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
      </details>

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

      <section className="receipt-approval-moves-section">
        {loading ? (
          <div className="receipt-inline-status">Завантаження переміщень…</div>
        ) : pendingMoves.length === 0 ? (
          <div className="receipt-moves-topbar">
            <div className="receipt-moves-title-row">
              <h3>Переміщення з 1С</h3>
              <span className="receipt-moves-count">немає міжрегіональних</span>
            </div>
          </div>
        ) : (
          <>
            <div className="receipt-moves-topbar">
              <div className="receipt-moves-title-row">
                <h3>Переміщення з 1С</h3>
                <span
                  className="receipt-moves-count"
                  title="Лише міжрегіональні переміщення. Вкажіть фактичну кількість; при частковому прийомі відправнику регіону надійде сповіщення."
                >
                  {totalMovesCount} між регіонами
                  {moveRegionalScope ? ' · ваш регіон' : ''}
                </span>
              </div>
              <div className="receipt-moves-actions">
                <button type="button" className="btn-select-all btn-select-all--compact" onClick={handleSelectAll}>
                  {selectedMoveKeys.size === totalMovesCount && totalMovesCount > 0
                    ? 'Скасувати'
                    : `Всі (${totalMovesCount})`}
                </button>
                <span className="selected-count">
                  {selectedMoveKeys.size}/{totalMovesCount}
                </span>
                <button
                  type="button"
                  className="btn-approve-receipt btn-approve-receipt--compact"
                  onClick={handleConfirmMoves}
                  disabled={selectedMoveKeys.size === 0 || approving}
                >
                  {approving ? '…' : `✅ Підтвердити (${selectedMoveKeys.size})`}
                </button>
              </div>
            </div>

            <div className="receipt-approval-moves-body">
              <div className="receipt-approval-content">
                {Object.values(groupedByWarehouse).map((group) => (
                  <div key={group.warehouseId} className="warehouse-group">
                    <div className="warehouse-group-header">
                      <h4>{group.warehouseName}</h4>
                      <span className="warehouse-count">
                        {group.moves.length}
                        {totalMovesCount > MOVE_PAGE_SIZE ? ' на стор.' : ''}
                      </span>
                    </div>
                    <div className="receipt-moves-table-wrap">
                      <table className="receipt-moves-table">
                        <thead>
                          <tr>
                            <th style={{ width: 36 }} />
                            <th>Дата</th>
                            <th>Документ 1С</th>
                            <th>Номенклатура</th>
                            <th>К-сть</th>
                            <th>Прийнято факт</th>
                            <th>Зі складу</th>
                            <th>На склад</th>
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
                              <td className="receipt-moves-cell-date">{formatDate(move.docDate)}</td>
                              <td className="receipt-moves-cell-doc">
                                <strong>{move.docNumber || '—'}</strong>
                                {move.docTypeName ? (
                                  <div className="receipt-moves-doc-type">{move.docTypeName}</div>
                                ) : null}
                              </td>
                              <td className="receipt-moves-cell-nomenclature">{move.nomenclature || '—'}</td>
                              <td className="receipt-moves-cell-qty">
                                {move.qty != null ? move.qty : '—'} {move.unit || ''}
                              </td>
                              <td className="receipt-moves-cell-received">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="receipt-moves-qty-input"
                                  value={moveReceiptDrafts[move.moveKey] ?? ''}
                                  disabled={approving}
                                  onChange={(e) => updateMoveReceiptDraft(move.moveKey, e.target.value)}
                                  aria-label={`Прийнято факт: ${move.nomenclature || move.docNumber || ''}`}
                                />
                              </td>
                              <td>{move.fromWarehouse1c || '—'}</td>
                              <td>{move.toWarehouseName || move.toWarehouse1c || '—'}</td>
                              <td className="receipt-moves-cell-region">
                                {move.fromWarehouseRegion && move.toWarehouseRegion
                                  ? `${move.fromWarehouseRegion} → ${move.toWarehouseRegion}`
                                  : move.toWarehouseRegion || move.fromWarehouseRegion || '—'}
                              </td>
                              <td className="receipt-moves-cell-comment">{move.comment || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {totalMovesCount > MOVE_PAGE_SIZE && (
              <div className="receipt-moves-pager">
                <button
                  type="button"
                  className="receipt-moves-pager-btn"
                  disabled={safeMovePage <= 0}
                  onClick={() => setMovePage((p) => Math.max(0, p - 1))}
                >
                  ←
                </button>
                <span className="receipt-moves-pager-info">
                  {safeMovePage + 1}/{movePageCount}
                  {' · '}
                  {moveSkip + 1}–{Math.min(moveSkip + MOVE_PAGE_SIZE, totalMovesCount)} з {totalMovesCount}
                </span>
                <button
                  type="button"
                  className="receipt-moves-pager-btn"
                  disabled={safeMovePage >= movePageCount - 1}
                  onClick={() => setMovePage((p) => Math.min(movePageCount - 1, p + 1))}
                >
                  →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default ReceiptApproval;

