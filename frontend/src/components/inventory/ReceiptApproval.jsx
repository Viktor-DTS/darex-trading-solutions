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

function ReceiptApproval({ user, warehouses, focusProcurementId, onConsumedFocusProcurement }) {
  const [movementDocuments, setMovementDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [approving, setApproving] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentItems, setDocumentItems] = useState([]);
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

  useEffect(() => {
    loadMovementDocuments();
    loadProcurementInbound();
  }, [loadProcurementInbound]);

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

  const loadMovementDocuments = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Спочатку завантажуємо всі товари в дорозі
      const equipmentResponse = await fetch(`${API_BASE_URL}/equipment?status=in_transit`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!equipmentResponse.ok) {
        const error = await equipmentResponse.json();
        console.error('[ERROR] Помилка завантаження товарів:', error);
        alert(`Помилка завантаження: ${error.error || 'Невідома помилка'}`);
        setLoading(false);
        return;
      }

      const allEquipment = await equipmentResponse.json();
      console.log('[DEBUG] Завантажено товарів в дорозі:', allEquipment.length);

      if (allEquipment.length === 0) {
        setMovementDocuments([]);
        setLoading(false);
        return;
      }

      // Створюємо мапу товарів по ID
      const equipmentMap = new Map(allEquipment.map(eq => [eq._id, eq]));

      // Завантажуємо всі документи переміщення (не тільки in_transit, щоб знайти всі пов'язані)
      const documentsResponse = await fetch(`${API_BASE_URL}/documents/movement`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      let documents = [];
      if (documentsResponse.ok) {
        documents = await documentsResponse.json();
        console.log('[DEBUG] Завантажено документів переміщення:', documents.length);
      }

      // Групуємо товари по документах переміщення
      const documentsWithItems = [];
      const equipmentInDocuments = new Set();

      // Спочатку додаємо товари, які є в документах
      for (const doc of documents) {
        const items = [];
        if (doc.items && doc.items.length > 0) {
          for (const item of doc.items) {
            if (item.equipmentId) {
              const equipment = equipmentMap.get(item.equipmentId);
              if (equipment && equipment.status === 'in_transit') {
                items.push({
                  ...equipment,
                  quantity: item.quantity || 1,
                  notes: item.notes || ''
                });
                equipmentInDocuments.add(equipment._id);
              }
            }
          }
        }
        
        // Додаємо документ тільки якщо в ньому є товари в дорозі
        if (items.length > 0) {
          documentsWithItems.push({
            ...doc,
            items,
            totalItems: items.length
          });
        }
      }

      // Додаємо товари, які не в документах (створюємо "віртуальні" документи)
      const equipmentNotInDocuments = allEquipment.filter(eq => !equipmentInDocuments.has(eq._id));
      
      if (equipmentNotInDocuments.length > 0) {
        // Групуємо по останньому переміщенню з історії
        const groupedByMovement = equipmentNotInDocuments.reduce((acc, eq) => {
          const lastMovement = eq.movementHistory && eq.movementHistory.length > 0 
            ? eq.movementHistory[eq.movementHistory.length - 1]
            : null;
          
          if (lastMovement) {
            const key = `${lastMovement.fromWarehouse}_${lastMovement.toWarehouse}_${new Date(lastMovement.date).toISOString().split('T')[0]}`;
            if (!acc[key]) {
              acc[key] = {
                fromWarehouse: lastMovement.fromWarehouse,
                fromWarehouseName: lastMovement.fromWarehouseName,
                toWarehouse: lastMovement.toWarehouse,
                toWarehouseName: lastMovement.toWarehouseName,
                documentDate: lastMovement.date,
                createdByName: lastMovement.movedByName,
                items: []
              };
            }
            acc[key].items.push({
              ...eq,
              quantity: 1,
              notes: lastMovement.notes || ''
            });
          } else {
            // Якщо немає історії, створюємо окремий документ для кожного товару
            const key = `single_${eq._id}`;
            acc[key] = {
              fromWarehouse: eq.currentWarehouse,
              fromWarehouseName: eq.currentWarehouseName,
              toWarehouse: eq.currentWarehouse,
              toWarehouseName: eq.currentWarehouseName,
              documentDate: new Date(),
              createdByName: 'Невідомо',
              items: [{
                ...eq,
                quantity: 1,
                notes: ''
              }]
            };
          }
          return acc;
        }, {});

        // Додаємо віртуальні документи
        Object.values(groupedByMovement).forEach(doc => {
          documentsWithItems.push({
            _id: `virtual_${Date.now()}_${Math.random()}`,
            documentNumber: 'Без документа',
            ...doc,
            totalItems: doc.items.length,
            isVirtual: true
          });
        });
      }

      console.log('[DEBUG] Підготовлено документів для відображення:', documentsWithItems.length);
      console.log('[DEBUG] Документи з товарами:', documentsWithItems.filter(d => d.totalItems > 0).length);
      console.log('[DEBUG] Загальна кількість товарів:', documentsWithItems.reduce((sum, d) => sum + (d.totalItems || 0), 0));
      setMovementDocuments(documentsWithItems);
    } catch (error) {
      console.error('Помилка завантаження документів переміщення:', error);
      alert('Помилка завантаження документів переміщення');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (equipmentId) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(equipmentId)) {
        newSet.delete(equipmentId);
      } else {
        newSet.add(equipmentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    // Збираємо всі ID товарів з усіх документів
    const allItemIds = movementDocuments.flatMap(doc => 
      doc.items.map(item => item._id).filter(Boolean)
    );
    
    if (selectedItems.size === allItemIds.length && allItemIds.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(allItemIds));
    }
  };

  const handleDocumentClick = (document) => {
    setSelectedDocument(document);
    setDocumentItems(document.items || []);
    setShowDocumentModal(true);
  };

  const handleApproveReceipt = async () => {
    if (selectedItems.size === 0) {
      alert('Виберіть хоча б один товар для затвердження отримання');
      return;
    }

    if (!confirm(`Затвердити отримання ${selectedItems.size} товарів?`)) {
      return;
    }

    setApproving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/approve-receipt`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          equipmentIds: Array.from(selectedItems)
        })
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Успішно затверджено отримання ${result.approvedCount} товарів`);
        setSelectedItems(new Set());
        loadMovementDocuments();
        loadProcurementInbound();
      } else {
        const error = await response.json();
        alert(`Помилка: ${error.error || 'Не вдалося затвердити отримання'}`);
      }
    } catch (error) {
      console.error('Помилка затвердження отримання:', error);
      alert('Помилка затвердження отримання товарів');
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

  // Групуємо документи переміщення за складом призначення
  const groupedByWarehouse = movementDocuments.reduce((acc, doc) => {
    if (!doc || !doc._id) {
      console.warn('[WARN] Пропущено документ без ID:', doc);
      return acc;
    }
    const warehouseId = doc.toWarehouse || 'unknown';
    const warehouseName = doc.toWarehouseName || getWarehouseName(warehouseId);
    
    if (!acc[warehouseId]) {
      acc[warehouseId] = {
        warehouseId,
        warehouseName,
        documents: []
      };
    }
    acc[warehouseId].documents.push(doc);
    return acc;
  }, {});

  // Підраховуємо загальну кількість товарів
  const totalItemsCount = movementDocuments.reduce((sum, doc) => sum + (doc.totalItems || 0), 0);

  return (
    <div className="receipt-approval">
      <div className="receipt-approval-header">
        <h2>Затвердження отримання товару</h2>
        <p className="receipt-approval-description">
          Спочатку вкажіть фактичні кількості по заявці закупівель; натисніть «Підтвердити прийом на складі» — відкриється
          вікно підтвердження (як при прийомі на вкладці «Надходження»). Нижче — прийом обладнання в дорозі між складами.
        </p>
      </div>

      <div className="procurement-receipt-section" id="procurement-inbound-block">
        <h3>Надходження від закупівель</h3>
        <p className="procurement-receipt-hint">
          Заявки у статусі «Чекає відвантаження на склад». Рядки інших регіонів/складів недоступні для редагування; їх
          підтвердить відповідний завсклад. У колонці «Прийнято факт» введіть фактичну кількість по своїх рядках; при
          розбіжностях відділ закупівель отримає сповіщення.
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
                    {(pr.materials || []).map((m, idx) => {
                      const lineEditable = m.receiptLineEditable !== false;
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
                        <tr
                          key={idx}
                          className={!lineEditable ? 'procurement-receipt-line-foreign' : undefined}
                        >
                          <td>{idx + 1}</td>
                          <td className="procurement-receipt-line-warehouse">{lineWh}</td>
                          <td>{rowLabel}</td>
                          <td>{expLabel}</td>
                          <td>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={val}
                              disabled={procurementSubmitting === pr._id || !lineEditable}
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
                    {(procurementConfirmModalPr.materials || []).map((m, idx) => {
                      const lineEditable = m.receiptLineEditable !== false;
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
                        <tr
                          key={idx}
                          className={!lineEditable ? 'procurement-receipt-line-foreign' : undefined}
                        >
                          <td>{idx + 1}</td>
                          <td className="procurement-receipt-line-warehouse">{lineWh}</td>
                          <td>{rowLabel}</td>
                          <td>{expLabel}</td>
                          <td>
                            {val === '' ? '—' : val}
                            {!lineEditable && (
                              <span className="procurement-receipt-foreign-hint" title="Рядок іншого регіону">
                                {' '}
                                (інший регіон)
                              </span>
                            )}
                          </td>
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
        <h2 style={{ fontSize: 20 }}>Переміщення між складами (товари в дорозі)</h2>
        <p className="receipt-approval-description">
          Оберіть товари, які отримані на склад. Вибрані товари будуть переведені в статус «На складі».
        </p>
      </div>

      {loading ? (
        <div className="loading-indicator">Завантаження переміщень…</div>
      ) : movementDocuments.length === 0 ? (
        <div className="empty-state">
          <p>Немає товарів в дорозі</p>
        </div>
      ) : (
        <>
          <div className="receipt-approval-toolbar">
            <div className="toolbar-left">
              <button
                className="btn-select-all"
                onClick={handleSelectAll}
              >
                {selectedItems.size === totalItemsCount && totalItemsCount > 0 ? 'Скасувати вибір' : 'Вибрати всі'}
              </button>
              <span className="selected-count">
                Вибрано: {selectedItems.size} з {totalItemsCount}
              </span>
            </div>
            <div className="toolbar-right">
              <button
                className="btn-approve-receipt"
                onClick={handleApproveReceipt}
                disabled={selectedItems.size === 0 || approving}
              >
                {approving ? 'Затвердження...' : `✅ Затвердити отримання (${selectedItems.size})`}
              </button>
            </div>
          </div>

          <div className="receipt-approval-content">
            {Object.values(groupedByWarehouse).map(group => {
              return (
                <div key={group.warehouseId} className="warehouse-group">
                  <div className="warehouse-group-header">
                    <h3>📦 Склад: {group.warehouseName}</h3>
                    <span className="warehouse-count">
                      {group.documents.length} {group.documents.length === 1 ? 'переміщення' : 'переміщень'}
                    </span>
                  </div>
                  {group.documents && group.documents.length > 0 ? (
                    <div className="equipment-table-wrapper">
                      <table className="equipment-table">
                        <thead>
                          <tr>
                            <th>Документ</th>
                            <th>Тип обладнання</th>
                            <th>Кількість</th>
                            <th>Зі складу</th>
                            <th>Дата переміщення</th>
                            <th>Хто перемістив</th>
                            <th>Примітки</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.documents.map(doc => {
                            const allItemsSelected = doc.items.length > 0 && 
                              doc.items.every(item => item._id && selectedItems.has(item._id));
                            const someItemsSelected = doc.items.some(item => item._id && selectedItems.has(item._id));
                            
                            return (
                              <tr 
                                key={doc._id} 
                                className={`movement-document-row ${someItemsSelected ? 'partially-selected' : ''} ${allItemsSelected ? 'fully-selected' : ''}`}
                                onClick={() => handleDocumentClick(doc)}
                                style={{ cursor: 'pointer' }}
                              >
                                <td>
                                  <div style={{ fontWeight: 'bold', color: doc.isVirtual ? '#ffc107' : 'var(--primary)' }}>
                                    {doc.documentNumber || (doc.isVirtual ? 'Без документа' : '—')}
                                  </div>
                                </td>
                                <td>
                                  {doc.items.length > 0 ? (
                                    <div>
                                      {doc.items[0].type || '—'}
                                      {doc.items.length > 1 && (
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '11px', marginLeft: '8px' }}>
                                          та ще {doc.items.length - 1}
                                        </span>
                                      )}
                                    </div>
                                  ) : '—'}
                                </td>
                                <td>
                                  <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                                    {doc.totalItems || doc.items.length} {doc.totalItems === 1 ? 'одиниця' : 'одиниць'}
                                  </span>
                                </td>
                                <td>
                                  <div>
                                    <div>{doc.fromWarehouseName || doc.fromWarehouse || '—'}</div>
                                  </div>
                                </td>
                                <td>
                                  {formatDate(doc.documentDate)}
                                </td>
                                <td>
                                  {doc.createdByName || '—'}
                                </td>
                                <td>
                                  {doc.notes || doc.reason || '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                      Немає переміщень для відображення
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Модальне вікно для вибору одиниць документа */}
      {showDocumentModal && selectedDocument && (
        <div className="modal-overlay" onClick={() => setShowDocumentModal(false)}>
          <div className="modal-content receipt-document-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📦 Переміщення: {selectedDocument.documentNumber}</h3>
              <button className="btn-close" onClick={() => setShowDocumentModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="document-info">
                <div className="info-row">
                  <span className="label">Зі складу:</span>
                  <span className="value">{selectedDocument.fromWarehouseName || selectedDocument.fromWarehouse || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="label">На склад:</span>
                  <span className="value">{selectedDocument.toWarehouseName || selectedDocument.toWarehouse || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Дата переміщення:</span>
                  <span className="value">{formatDate(selectedDocument.documentDate)}</span>
                </div>
                <div className="info-row">
                  <span className="label">Хто перемістив:</span>
                  <span className="value">{selectedDocument.createdByName || '—'}</span>
                </div>
                {selectedDocument.notes && (
                  <div className="info-row">
                    <span className="label">Примітки:</span>
                    <span className="value">{selectedDocument.notes}</span>
                  </div>
                )}
              </div>

              <div className="document-items-section">
                <h4>Оберіть отримані одиниці:</h4>
                <div className="items-table-wrapper">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>
                          <input
                            type="checkbox"
                            checked={documentItems.length > 0 && documentItems.every(item => item._id && selectedItems.has(item._id))}
                            onChange={() => {
                              const allSelected = documentItems.every(item => item._id && selectedItems.has(item._id));
                              if (allSelected) {
                                setSelectedItems(prev => {
                                  const newSet = new Set(prev);
                                  documentItems.forEach(item => {
                                    if (item._id) newSet.delete(item._id);
                                  });
                                  return newSet;
                                });
                              } else {
                                setSelectedItems(prev => {
                                  const newSet = new Set(prev);
                                  documentItems.forEach(item => {
                                    if (item._id) newSet.add(item._id);
                                  });
                                  return newSet;
                                });
                              }
                            }}
                          />
                        </th>
                        <th>Тип обладнання</th>
                        <th>Серійний номер</th>
                        <th>Виробник</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentItems.map(item => (
                        <tr 
                          key={item._id} 
                          className={selectedItems.has(item._id) ? 'selected' : ''}
                          onClick={(e) => {
                            if (e.target.type !== 'checkbox') {
                              handleToggleSelect(item._id);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item._id)}
                              onChange={() => handleToggleSelect(item._id)}
                            />
                          </td>
                          <td>{item.type || '—'}</td>
                          <td>
                            {item.batchId ? (
                              <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                Партія: {item.batchId}
                              </span>
                            ) : (
                              item.serialNumber || '—'
                            )}
                          </td>
                          <td>{item.manufacturer || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-cancel"
                onClick={() => setShowDocumentModal(false)}
              >
                Закрити
              </button>
              <button 
                className="btn-approve"
                onClick={() => {
                  setShowDocumentModal(false);
                }}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReceiptApproval;

