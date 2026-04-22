import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API_BASE_URL from '../config';
import { tryHandleUnauthorizedResponse } from '../utils/authSession';
import ManagerNotificationsTab from './manager/ManagerNotificationsTab';
import './ProcurementDashboard.css';

const EXECUTOR_DOC_KIND_OPTIONS = [
  { value: 'invoice', label: 'Рахунок' },
  { value: 'delivery_note', label: 'Видаткова накладна' },
  { value: 'other', label: 'Інше' }
];

function executorAttachmentDocLabel(k) {
  return EXECUTOR_DOC_KIND_OPTIONS.find((o) => o.value === k)?.label || '';
}

const PRIORITY_OPTIONS = [
  { value: '1_workday', label: 'На протязі 1 робочого дня' },
  { value: '5_workdays', label: 'На протязі 5 робочих днів' },
  { value: '7_workdays', label: 'На протязі 7 робочих днів' },
  { value: 'more_than_7_workdays', label: 'Більше 7 робочих днів' }
];

const APPLICATION_KIND_OPTIONS = [
  { value: 'purchase', label: 'Закупівля' },
  { value: 'price_determination', label: 'Визначення ціни' }
];

const STATUS_LABELS = {
  pending_review: 'Очікує розгляду',
  in_progress: 'Взята в роботу',
  awaiting_warehouse: 'Чекає відвантаження на склад',
  partially_fulfilled: 'Частково виконана',
  completed: 'Повністю виконана'
};

function isProcurementExecutorWorkStatus(status) {
  return status === 'in_progress' || status === 'partially_fulfilled';
}

const PAYER_COMPANY_OPTIONS = [
  { value: 'dts', label: 'ДТС' },
  { value: 'dareks_energo', label: 'Дарекс Енерго' }
];

function payerCompanyLabel(v) {
  return PAYER_COMPANY_OPTIONS.find((p) => p.value === v)?.label || v || '—';
}

function applicationKindLabel(row) {
  if (row.applicationKind) {
    return APPLICATION_KIND_OPTIONS.find((p) => p.value === row.applicationKind)?.label || row.applicationKind;
  }
  const legacy = String(row.description || '').trim();
  if (legacy) return legacy.length > 120 ? `${legacy.slice(0, 120)}…` : legacy;
  return '—';
}

function formatDt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

/** П.І.Б. у шапці, поки заявка чекає інші склади (з backend warehouseConfirmerActions). */
function formatWarehouseConfirmerActions(actions) {
  if (!Array.isArray(actions) || !actions.length) return '';
  return actions
    .map((a) => {
      const n = a.confirmerName || a.confirmerLogin || '—';
      return a.at ? `${n} (${formatDt(a.at)})` : n;
    })
    .join(' · ');
}

function priorityLabel(v) {
  return PRIORITY_OPTIONS.find((p) => p.value === v)?.label || v || '—';
}

function procurementExecutorRowLabel(r) {
  const name = String(r?.executorName || '').trim();
  const login = String(r?.executorLogin || '').trim();
  if (name) return name;
  if (login) return login;
  return '—';
}

function sumWarehouseAcceptedQty(events) {
  if (!Array.isArray(events)) return 0;
  return events.reduce((acc, ev) => acc + (Number(ev?.acceptedQuantity) || 0), 0);
}

/**
 * Колонка «Прийоми завскладом»: історія warehouseReceiptEvents; інакше — receivedQuantity, коли завсклад
 * вже зберіг прийом, але заявка ще чекає інші склади/рядки (події тоді не додаються в БД).
 * Для завершених старих заявок: якщо подій у рядку немає, показуємо кількість + з шапки (ПІБ, дата).
 */
function procurementReceiptsCellContent(m, detail) {
  const evs = m?.warehouseReceiptEvents;
  if (evs && evs.length) {
    return (
      <>
        <ul className="procurement-wh-event-list">
          {evs.map((ev, j) => (
            <li key={j}>
              <strong>{ev.acceptedQuantity}</strong> шт — {ev.confirmerName || ev.confirmerLogin || '—'},{' '}
              {ev.acceptedAt ? formatDt(ev.acceptedAt) : '—'}
            </li>
          ))}
        </ul>
        <div className="procurement-wh-total">Всього прийнято: {sumWarehouseAcceptedQty(evs)} шт.</div>
      </>
    );
  }
  if (
    m &&
    m.receivedQuantity != null &&
    m.receivedQuantity !== '' &&
    Number.isFinite(Number(m.receivedQuantity))
  ) {
    const docName = detail?.warehouseConfirmerName || detail?.warehouseConfirmerLogin;
    const docAt = detail?.warehouseReceivedAt;
    return (
      <>
        <strong>{String(m.receivedQuantity)}</strong> шт
        {detail && (detail.status === 'awaiting_warehouse' || detail.status === 'partially_fulfilled') && (
          <div className="procurement-receipt-pending-hint">Очікується прийом на інших складах за потреби.</div>
        )}
        {detail?.status === 'completed' && (docName || docAt) && (
          <div className="procurement-receipt-archive-meta">
            {[docName, docAt ? formatDt(docAt) : null].filter(Boolean).join(' — ')}
          </div>
        )}
      </>
    );
  }
  if (
    detail?.status === 'completed' &&
    (detail.warehouseConfirmerName || detail.warehouseConfirmerLogin || detail.warehouseReceivedAt)
  ) {
    const parts = [];
    if (detail.warehouseConfirmerName || detail.warehouseConfirmerLogin) {
      parts.push(detail.warehouseConfirmerName || detail.warehouseConfirmerLogin);
    }
    if (detail.warehouseReceivedAt) {
      parts.push(formatDt(detail.warehouseReceivedAt));
    }
    if (parts.length) {
      return <div className="procurement-receipt-archive-meta">{parts.join(' — ')}</div>;
    }
  }
  return '—';
}

/** Залишок до відвантаження: основний + аналог (узгоджено з backend expectedQtyForProcurementMaterialLine) */
function expectedQtyForLine(m) {
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

/** Початкова кількість по заявці (узгоджено з backend procurementLineInitialOrdered). */
function initialQtyForLine(m) {
  if (!m) return null;
  if (m.rejected) {
    if (m.initialQuantity != null && Number.isFinite(Number(m.initialQuantity))) {
      return Number(m.initialQuantity);
    }
    if (m.quantity != null && Number.isFinite(Number(m.quantity))) return Number(m.quantity);
    return null;
  }
  if (m.initialQuantity != null && Number.isFinite(Number(m.initialQuantity))) {
    return Number(m.initialQuantity);
  }
  const evSum = sumWarehouseAcceptedQty(m.warehouseReceiptEvents);
  const cur = expectedQtyForLine(m);
  if (cur === null) return null;
  return evSum + cur;
}

function maxRemainderAfterWarehouse(m) {
  const init = initialQtyForLine(m);
  if (init == null) return null;
  const evSum = sumWarehouseAcceptedQty(m?.warehouseReceiptEvents);
  return Math.max(0, init - evSum);
}

function parseNonNegMaterialQty(v) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** У режимі «основний + аналог»: сума не більше maxCap. Спочатку зменшуємо аналог, потім основний. */
function clampMainAnalogSumToCap(main, analog, maxCap) {
  if (maxCap == null || !Number.isFinite(maxCap)) return { main, analog };
  let m = Math.max(0, main);
  let a = Math.max(0, analog);
  if (m + a <= maxCap) return { main: m, analog: a };
  a = Math.max(0, maxCap - m);
  if (m + a > maxCap) {
    m = Math.max(0, maxCap - a);
  }
  return { main: m, analog: a };
}

const RECEIPT_OUTCOME_LABELS = {
  pending: 'Очікує прийому на складі',
  full: 'Повністю прийнято завскладом',
  partial: 'Частково / з розбіжностями'
};

function emptyMaterialRow() {
  return { name: '', quantity: '', price: '', productId: '' };
}

function ProcurementDashboard({ user }) {
  const [activeSection, setActiveSection] = useState('active'); // 'active' | 'archive' | 'notifications'
  const [requests, setRequests] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const [createForm, setCreateForm] = useState({
    applicationKind: 'purchase',
    payerCompany: '',
    priority: '5_workdays',
    desiredWarehouse: '',
    materials: [emptyMaterialRow()],
    notes: '',
    files: []
  });

  const [materialsDraft, setMaterialsDraft] = useState(null);
  const [executorUploadDocKind, setExecutorUploadDocKind] = useState('invoice');
  const [nomenclatureHints, setNomenclatureHints] = useState([]);
  const [hintsForRow, setHintsForRow] = useState(null);
  const hintDebounceRef = useRef(null);
  const [procurementNotifUnreadCount, setProcurementNotifUnreadCount] = useState(0);

  const role = String(user?.role || '').toLowerCase();
  const isVidZakupok = ['vidzakupok', 'admin', 'administrator'].includes(role);
  const isWarehouseConfirmer = ['warehouse', 'zavsklad', 'admin', 'administrator'].includes(role);
  const isAdmin = ['admin', 'administrator'].includes(role);

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const activeRequests = useMemo(
    () => requests.filter((r) => r.status !== 'completed'),
    [requests]
  );
  const archivedRequests = useMemo(
    () => requests.filter((r) => r.status === 'completed'),
    [requests]
  );

  const fetchProcurementNotifUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/manager-notifications/unread-count?procurement=1`, {
        headers: authHeaders
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setProcurementNotifUnreadCount(typeof data.count === 'number' ? data.count : 0);
      }
    } catch (_) {
      /* ignore */
    }
  }, [authHeaders]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setRequests(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadWarehouses = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/warehouses`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setWarehouses(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadRequests();
    loadWarehouses();
  }, [loadRequests, loadWarehouses]);

  useEffect(() => {
    fetchProcurementNotifUnreadCount();
    const id = setInterval(fetchProcurementNotifUnreadCount, 60000);
    return () => clearInterval(id);
  }, [fetchProcurementNotifUnreadCount]);

  useEffect(() => {
    if (!detail?.materials) {
      setMaterialsDraft(null);
      return;
    }
    setMaterialsDraft(
      detail.materials.map((m) => ({
        name: m.name || '',
        quantity: m.quantity,
        price: m.price,
        productId: m.productId ? String(m.productId) : '',
        actualWarehouse: m.actualWarehouse != null && m.actualWarehouse !== undefined ? String(m.actualWarehouse) : '',
        analogName: m.analogName || '',
        analogQuantity: m.analogQuantity != null && m.analogQuantity !== '' ? String(m.analogQuantity) : '',
        analogShipped: !!m.analogShipped,
        rejected: !!m.rejected,
        rejectionReason: m.rejectionReason || '',
        initialQuantity: m.initialQuantity
      }))
    );
  }, [detail?._id, detail?.materials]);

  const warehouseOptions = useMemo(() => {
    return warehouses
      .filter((w) => w.isActive !== false)
      .map((w) => ({ value: w.name || w._id, label: w.name || String(w._id) }));
  }, [warehouses]);

  const resetCreateForm = () => {
    setCreateForm({
      applicationKind: 'purchase',
      payerCompany: '',
      priority: '5_workdays',
      desiredWarehouse: '',
      materials: [emptyMaterialRow()],
      notes: '',
      files: []
    });
    setNomenclatureHints([]);
    setHintsForRow(null);
  };

  const requestNomenclatureHints = useCallback(
    (rowIndex, query) => {
      if (hintDebounceRef.current) clearTimeout(hintDebounceRef.current);
      const q = String(query || '').trim();
      if (q.length < 2) {
        setNomenclatureHints([]);
        setHintsForRow(null);
        return;
      }
      hintDebounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/procurement-requests/nomenclature-hints?q=${encodeURIComponent(q)}`,
            { headers: authHeaders }
          );
          if (tryHandleUnauthorizedResponse(res)) return;
          if (res.ok) {
            const data = await res.json();
            setNomenclatureHints(Array.isArray(data) ? data : []);
            setHintsForRow(rowIndex);
          }
        } catch (e) {
          console.error(e);
        }
      }, 320);
    },
    [authHeaders]
  );

  const updateMaterialRow = (idx, patch) => {
    setCreateForm((prev) => {
      const materials = [...prev.materials];
      materials[idx] = { ...materials[idx], ...patch };
      return { ...prev, materials };
    });
  };

  const addMaterialRow = () => {
    setCreateForm((prev) => ({ ...prev, materials: [...prev.materials, emptyMaterialRow()] }));
  };

  const removeMaterialRow = (idx) => {
    setCreateForm((prev) => {
      if (prev.materials.length <= 1) return prev;
      const materials = prev.materials.filter((_, i) => i !== idx);
      return { ...prev, materials };
    });
  };

  const pickNomenclatureHint = (rowIndex, hint) => {
    updateMaterialRow(rowIndex, {
      name: hint.label,
      productId: hint.id ? String(hint.id) : ''
    });
    setNomenclatureHints([]);
    setHintsForRow(null);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.applicationKind) {
      alert('Оберіть тип заявки');
      return;
    }
    if (!createForm.payerCompany) {
      alert('Оберіть компанію платника');
      return;
    }
    const dw = String(createForm.desiredWarehouse || '').trim();
    if (!dw) {
      alert('Оберіть бажаний склад відвантаження');
      return;
    }
    const materialsPayload = createForm.materials
      .filter((m) => m && String(m.name || '').trim())
      .map((m) => ({
        name: String(m.name).trim(),
        quantity: m.quantity === '' ? null : Number(m.quantity),
        price: m.price === '' ? null : Number(m.price),
        productId: m.productId || null
      }));

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('applicationKind', createForm.applicationKind);
      fd.append('payerCompany', createForm.payerCompany);
      fd.append('priority', createForm.priority);
      fd.append('desiredWarehouse', dw);
      fd.append('notes', String(createForm.notes || '').trim());
      fd.append('materials', JSON.stringify(materialsPayload));
      (createForm.files || []).forEach((f) => fd.append('files', f));

      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/procurement-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося створити заявку');
        return;
      }
      const created = await res.json().catch(() => null);
      const num = created && created.requestNumber ? String(created.requestNumber).trim() : '';
      setCreateOpen(false);
      resetCreateForm();
      await loadRequests();
      if (num) {
        alert(`Заявку створено. Номер: ${num}`);
      }
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const downloadAttachment = async (requestId, att, kind = 'requester') => {
    try {
      const token = localStorage.getItem('token');
      const path =
        kind === 'executor'
          ? `${API_BASE_URL}/procurement-requests/${requestId}/executor-attachments/${att._id}`
          : `${API_BASE_URL}/procurement-requests/${requestId}/attachments/${att._id}`;
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        alert('Не вдалося завантажити файл');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.originalName || 'file';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || 'Помилка завантаження');
    }
  };

  const uploadExecutorFiles = async (requestId, fileList, docKind) => {
    if (!fileList || !fileList.length) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('docKind', docKind || 'other');
      Array.from(fileList).forEach((f) => fd.append('files', f));
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${requestId}/executor-attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося завантажити файли');
        return;
      }
      const updated = await res.json();
      setDetail(updated);
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const takeInWork = async (id) => {
    if (!window.confirm('Взяти цю заявку в роботу?')) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${id}/take-in-work`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' }
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Помилка');
        return;
      }
      const updated = await res.json();
      setDetail(updated);
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const persistExecutorMaterials = async (requestId) => {
    if (!materialsDraft || !materialsDraft.length) return true;
    const payload = materialsDraft.map((m) => ({
      quantity:
        m.quantity === '' || m.quantity === undefined || m.quantity === null ? null : Number(m.quantity),
      actualWarehouse: String(m.actualWarehouse || '').trim(),
      analogName: m.analogName,
      analogQuantity: m.analogQuantity === '' ? null : Number(m.analogQuantity),
      analogShipped: !!m.analogShipped,
      rejected: !!m.rejected,
      rejectionReason: String(m.rejectionReason || '').trim()
    }));
    for (let i = 0; i < payload.length; i++) {
      if (payload[i].rejected && !payload[i].rejectionReason) {
        alert(`Позиція ${i + 1}: для відхиленого матеріалу обовʼязково вкажіть причину`);
        return false;
      }
      if (payload[i].analogQuantity !== null && !Number.isFinite(payload[i].analogQuantity)) {
        alert(`Позиція ${i + 1}: некоректна кількість аналогу`);
        return false;
      }
      if (payload[i].quantity !== null && !Number.isFinite(payload[i].quantity)) {
        alert(`Позиція ${i + 1}: некоректна кількість (залишок основного товару)`);
        return false;
      }
      const row = detail?.materials?.[i];
      const maxR = row ? maxRemainderAfterWarehouse(row) : null;
      const m = materialsDraft[i];
      const draftAnalog = !!m?.analogShipped && String(m?.analogName || '').trim();
      const mainPart =
        payload[i].quantity != null && Number.isFinite(payload[i].quantity)
          ? Math.max(0, payload[i].quantity)
          : 0;
      const analogPart =
        draftAnalog && payload[i].analogQuantity != null && Number.isFinite(payload[i].analogQuantity)
          ? Math.max(0, payload[i].analogQuantity)
          : 0;
      if (!payload[i].rejected && maxR !== null && mainPart + analogPart > maxR) {
        alert(
          `Позиція ${i + 1}: сума кількості основного товару (${mainPart}) та аналогу (${analogPart}) не більше ${maxR} шт. (залишок з урахуванням прийомів на складі).`
        );
        return false;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${requestId}/executor-materials`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ materials: payload })
      });
      if (tryHandleUnauthorizedResponse(res)) return false;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося зберегти матеріали');
        return false;
      }
      const updated = await res.json();
      setDetail(updated);
      await loadRequests();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const draftLineNeedsExecutorWarehouse = (m, savedLine) => {
    if (!m || m.rejected) return false;
    const maxR = savedLine ? maxRemainderAfterWarehouse(savedLine) : null;
    if (maxR === null) return false;
    const draftAnalog = !!m.analogShipped && String(m.analogName || '').trim();
    const main = parseNonNegMaterialQty(m.quantity);
    const analog = draftAnalog ? parseNonNegMaterialQty(m.analogQuantity) : 0;
    return main + analog > 0;
  };

  const completeExecutor = async (id) => {
    if (canActAsExecutorOnRequest(detail) && materialsDraft && (detail.materials || []).length > 0) {
      for (let i = 0; i < materialsDraft.length; i++) {
        const m = materialsDraft[i];
        const saved = detail?.materials?.[i];
        if (!draftLineNeedsExecutorWarehouse(m, saved)) continue;
        if (!String(m.actualWarehouse || '').trim()) {
          alert(`Позиція ${i + 1}: вкажіть фактичний склад відвантаження`);
          return;
        }
      }
      const saved = await persistExecutorMaterials(id);
      if (!saved) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${id}/complete-executor`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualWarehouse: '' })
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Помилка');
        return;
      }
      const updated = await res.json();
      setDetail(updated);
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const openProcurementRequestById = async (id) => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${id}`, {
        headers: authHeaders
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося відкрити заявку');
        return;
      }
      const row = await res.json();
      openDetail(row);
      setActiveSection(row.status === 'completed' ? 'archive' : 'active');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (row) => {
    setDetail(row);
  };

  const deleteProcurementRequest = async (e, r) => {
    e.stopPropagation();
    e.preventDefault();
    const label = r.requestNumber || r._id;
    if (!window.confirm(`Видалити заявку ${label} безповоротно?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/procurement-requests/${r._id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося видалити заявку');
        return;
      }
      if (detail && String(detail._id) === String(r._id)) setDetail(null);
      await loadRequests();
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  /** Виконавець (або адмін) під час статусу «Взята в роботу» */
  const canActAsExecutorOnRequest = (d) => {
    if (!d || !isProcurementExecutorWorkStatus(d.status)) return false;
    if (!isVidZakupok) return false;
    if (isAdmin) return true;
    return String(d.executorLogin || '') === String(user?.login || '');
  };

  const updateMaterialDraftRow = (idx, patch) => {
    setMaterialsDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  return (
    <div className="procurement-dashboard">
      <div className="procurement-dashboard-main">
        <aside className="procurement-sidebar">
          <div className="procurement-sidebar-inner">
            <nav className="procurement-sidebar-nav">
              <div className="procurement-sidebar-section-title">Відділ закупівель</div>
              <button
                type="button"
                className={`procurement-sidebar-tab ${activeSection === 'active' ? 'active' : ''}`}
                onClick={() => setActiveSection('active')}
              >
                <span className="tab-icon">📋</span>
                <span className="tab-label">Активні заявки на закупівлю</span>
              </button>
              <button
                type="button"
                className={`procurement-sidebar-tab ${activeSection === 'notifications' ? 'active' : ''} ${
                  procurementNotifUnreadCount > 0 ? 'procurement-sidebar-tab--with-badge' : ''
                }`}
                onClick={() => {
                  setActiveSection('notifications');
                  fetchProcurementNotifUnreadCount();
                }}
              >
                <span className="tab-icon">🔔</span>
                <span className="tab-label">Сповіщення</span>
                {procurementNotifUnreadCount > 0 ? (
                  <span
                    className="procurement-sidebar-badge"
                    aria-label={`Непрочитано сповіщень закупівель: ${procurementNotifUnreadCount}`}
                  >
                    {procurementNotifUnreadCount > 99 ? '99+' : procurementNotifUnreadCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={`procurement-sidebar-tab ${activeSection === 'archive' ? 'active' : ''}`}
                onClick={() => setActiveSection('archive')}
              >
                <span className="tab-icon">📦</span>
                <span className="tab-label">Архів заявок</span>
              </button>
            </nav>
          </div>
        </aside>

        <main className="procurement-main-content">
          {activeSection === 'notifications' && (
            <div className="procurement-active-panel">
              <ManagerNotificationsTab
                procurementOnly
                title="Сповіщення відділу закупівель"
                onOpenProcurementRequest={openProcurementRequestById}
                onUnreadCountChange={fetchProcurementNotifUnreadCount}
                description="Події по заявках закупівель: нова заявка для виконавців VidZakupok та адміністраторів, виконання заявки (персонально заявнику), частковий прийом, надходження на склад. Резерви обладнання та інші сповіщення менеджерів тут не показуються. Натисніть номер заявки (VZ-…), щоб відкрити картку."
              />
            </div>
          )}
          {activeSection === 'archive' && (
            <div className="procurement-active-panel procurement-archive-panel">
              <div className="procurement-toolbar">
                <h1 className="procurement-title">Архів заявок</h1>
              </div>
              <p className="procurement-hint">
                Повністю виконані заявки (статус «Повністю виконана»). Відкрийте рядок, щоб переглянути картку з
                матеріалами та історією прийомів на складі.
              </p>
              {loading ? (
                <div className="procurement-loading">Завантаження…</div>
              ) : (
                <div className="procurement-table-wrap">
                  <table className="procurement-table">
                    <thead>
                      <tr>
                        <th>№ заявки</th>
                        <th>Статус</th>
                        <th>Тип заявки</th>
                        <th>Компанія платник</th>
                        <th>Відповідальний (хто подав)</th>
                        <th>Пріоритет</th>
                        <th>Дата подачі</th>
                        <th>Бажаний склад</th>
                        <th>Фактичний склад відвантаження</th>
                        <th>Відповідальний за виконання заявки</th>
                        <th>Дата виконання (відділ закупівель)</th>
                        {isAdmin ? <th className="procurement-th-actions">Дії</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {archivedRequests.map((r) => (
                        <tr
                          key={r._id}
                          className="procurement-table-row--openable"
                          tabIndex={0}
                          onClick={() => openDetail(r)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDetail(r);
                            }
                          }}
                        >
                          <td>{r.requestNumber || '—'}</td>
                          <td>
                            <span className={`procurement-status procurement-status--${r.status}`}>
                              {STATUS_LABELS[r.status] || r.status}
                            </span>
                          </td>
                          <td className="procurement-desc-cell">{applicationKindLabel(r)}</td>
                          <td>{payerCompanyLabel(r.payerCompany)}</td>
                          <td>{r.requesterName || r.requesterLogin || '—'}</td>
                          <td>{priorityLabel(r.priority)}</td>
                          <td>{formatDt(r.createdAt)}</td>
                          <td>{r.desiredWarehouse || '—'}</td>
                          <td className="procurement-table-col-warehouse">
                            {r.actualWarehouse ? r.actualWarehouse : '—'}
                          </td>
                          <td className="procurement-table-col-executor">
                            {procurementExecutorRowLabel(r)}
                          </td>
                          <td className="procurement-table-col-date">
                            {formatDt(r.executorCompletedAt)}
                          </td>
                          {isAdmin ? (
                            <td
                              className="procurement-td-actions"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="procurement-btn-delete-row"
                                disabled={saving}
                                title="Видалити заявку (лише адміністратор)"
                                onClick={(e) => deleteProcurementRequest(e, r)}
                              >
                                Видалити
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!archivedRequests.length && (
                    <div className="procurement-empty">Немає виконаних заявок в архіві.</div>
                  )}
                </div>
              )}
            </div>
          )}
          {activeSection === 'active' && (
            <div className="procurement-active-panel">
              <div className="procurement-toolbar">
                <h1 className="procurement-title">Активні заявки на закупівлю</h1>
                <button
                  type="button"
                  className="procurement-btn-primary"
                  onClick={() => setCreateOpen(true)}
                  disabled={saving}
                >
                  + Подати заявку
                </button>
              </div>
              <p className="procurement-hint">
                Статус заявки змінюється автоматично за подіями (розгляд → робота → очікування на складі →
                виконано; за потреби після часткового прийому завскладом — «частково виконана» і знову робота
                виконавця з оновленими залишками). Поле статусу не редагується вручну.
              </p>
              {!isVidZakupok && (
                <p className="procurement-hint">
                  У цьому списку показано лише <strong>ваші</strong> заявки. Усі заявки бачать виконавці відділу
                  закупівель (VidZakupok) та адміністратори.
                </p>
              )}

              {loading ? (
                <div className="procurement-loading">Завантаження…</div>
              ) : (
                <div className="procurement-table-wrap">
                  <table className="procurement-table">
                    <thead>
                      <tr>
                        <th>№ заявки</th>
                        <th>Статус</th>
                        <th>Тип заявки</th>
                        <th>Компанія платник</th>
                        <th>Відповідальний (хто подав)</th>
                        <th>Пріоритет</th>
                        <th>Дата подачі</th>
                        <th>Бажаний склад</th>
                        <th>Фактичний склад відвантаження</th>
                        <th>Відповідальний за виконання заявки</th>
                        <th>Дата виконання (відділ закупівель)</th>
                        {isAdmin ? <th className="procurement-th-actions">Дії</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {activeRequests.map((r) => (
                        <tr
                          key={r._id}
                          className="procurement-table-row--openable"
                          tabIndex={0}
                          onClick={() => openDetail(r)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDetail(r);
                            }
                          }}
                        >
                          <td>{r.requestNumber || '—'}</td>
                          <td>
                            <span className={`procurement-status procurement-status--${r.status}`}>
                              {STATUS_LABELS[r.status] || r.status}
                            </span>
                          </td>
                          <td className="procurement-desc-cell">{applicationKindLabel(r)}</td>
                          <td>{payerCompanyLabel(r.payerCompany)}</td>
                          <td>{r.requesterName || r.requesterLogin || '—'}</td>
                          <td>{priorityLabel(r.priority)}</td>
                          <td>{formatDt(r.createdAt)}</td>
                          <td>{r.desiredWarehouse || '—'}</td>
                          <td className="procurement-table-col-warehouse">
                            {r.actualWarehouse ? r.actualWarehouse : '—'}
                          </td>
                          <td className="procurement-table-col-executor">
                            {procurementExecutorRowLabel(r)}
                          </td>
                          <td className="procurement-table-col-date">
                            {formatDt(r.executorCompletedAt)}
                          </td>
                          {isAdmin ? (
                            <td
                              className="procurement-td-actions"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="procurement-btn-delete-row"
                                disabled={saving}
                                title="Видалити заявку (лише адміністратор)"
                                onClick={(e) => deleteProcurementRequest(e, r)}
                              >
                                Видалити
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!activeRequests.length && (
                    <div className="procurement-empty">Немає заявок. Натисніть «Подати заявку».</div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {createOpen && (
        <div className="procurement-modal-overlay" role="dialog" aria-modal="true">
          <div className="procurement-modal procurement-modal--xlarge">
            <div className="procurement-modal-header">
              <h2>Нова заявка на закупівлю</h2>
              <button
                type="button"
                className="procurement-modal-close"
                onClick={() => !saving && setCreateOpen(false)}
                aria-label="Закрити"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="procurement-modal-body">
              <label className="procurement-field">
                <span>Тип заявки *</span>
                <select
                  required
                  value={createForm.applicationKind}
                  onChange={(e) => setCreateForm({ ...createForm, applicationKind: e.target.value })}
                >
                  {APPLICATION_KIND_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="procurement-field">
                <span>Компанія платник *</span>
                <select
                  required
                  value={createForm.payerCompany}
                  onChange={(e) => setCreateForm({ ...createForm, payerCompany: e.target.value })}
                >
                  <option value="" disabled>
                    — Оберіть компанію —
                  </option>
                  {PAYER_COMPANY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="procurement-field">
                <span>Пріоритет *</span>
                <select
                  value={createForm.priority}
                  onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="procurement-field">
                <span>Бажаний склад відвантаження *</span>
                <select
                  required
                  value={createForm.desiredWarehouse}
                  onChange={(e) => setCreateForm({ ...createForm, desiredWarehouse: e.target.value })}
                >
                  <option value="" disabled>
                    — Оберіть склад —
                  </option>
                  {warehouseOptions.map((w) => (
                    <option key={w.value} value={w.label}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="procurement-field procurement-materials-block">
                <span>Найменування матеріалів</span>
                <p className="procurement-field-hint">
                  Підказки з номенклатури складу (карточки продуктів). Введіть від 2 символів для пошуку.
                </p>
                <div className="procurement-materials-head">
                  <span>Найменування</span>
                  <span>Початкова кількість по заявці</span>
                  <span>Ціна</span>
                  <span></span>
                </div>
                {createForm.materials.map((row, idx) => (
                  <div key={idx} className="procurement-material-row">
                    <div className="procurement-material-cell procurement-material-cell--name">
                      <input
                        type="text"
                        value={row.name}
                        autoComplete="off"
                        onChange={(e) => {
                          const v = e.target.value;
                          updateMaterialRow(idx, { name: v, productId: '' });
                          requestNomenclatureHints(idx, v);
                        }}
                        onFocus={() => {
                          if (String(row.name || '').trim().length >= 2) {
                            requestNomenclatureHints(idx, row.name);
                          }
                        }}
                        placeholder="Пошук з бази або вручну"
                      />
                      {hintsForRow === idx && nomenclatureHints.length > 0 && (
                        <ul className="procurement-hints-list" role="listbox">
                          {nomenclatureHints.map((h) => (
                            <li key={String(h.id)}>
                              <button
                                type="button"
                                className="procurement-hint-item"
                                onClick={() => pickNomenclatureHint(idx, h)}
                              >
                                <span className="procurement-hint-label">{h.label}</span>
                                {h.subtitle ? (
                                  <span className="procurement-hint-sub">{h.subtitle}</span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="procurement-material-cell">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(e) => updateMaterialRow(idx, { quantity: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="procurement-material-cell">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.price}
                        onChange={(e) => updateMaterialRow(idx, { price: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="procurement-material-cell procurement-material-cell--actions">
                      <button
                        type="button"
                        className="procurement-btn-icon"
                        title="Видалити рядок"
                        onClick={() => removeMaterialRow(idx)}
                        disabled={createForm.materials.length <= 1}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="procurement-btn-secondary procurement-add-line" onClick={addMaterialRow}>
                  + Додати матеріал
                </button>
              </div>

              <label className="procurement-field">
                <span>Файли заявника (Excel, Word, PDF, JPEG)</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg"
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      files: e.target.files ? Array.from(e.target.files) : []
                    })
                  }
                />
                <span className="procurement-field-hint">
                  До 12 файлів (документи або JPEG), кожен до 15 МБ; зберігаються в базі.
                </span>
              </label>

              <label className="procurement-field">
                <span>Примітки</span>
                <textarea
                  rows={5}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Додаткові коментарі до заявки…"
                />
              </label>

              <div className="procurement-modal-actions">
                <button type="button" className="procurement-btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
                  Скасувати
                </button>
                <button type="submit" className="procurement-btn-primary" disabled={saving}>
                  {saving ? 'Збереження…' : 'Подати заявку'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="procurement-modal-overlay" role="dialog" aria-modal="true">
          <div className="procurement-modal procurement-modal--wide procurement-modal--detail-wide">
            <div className="procurement-modal-header">
              <h2>Заявка на закупівлю{detail.requestNumber ? ` (${detail.requestNumber})` : ''}</h2>
              <button
                type="button"
                className="procurement-modal-close"
                onClick={() => setDetail(null)}
                aria-label="Закрити"
              >
                ×
              </button>
            </div>
            <div className="procurement-modal-body procurement-detail-grid">
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Номер заявки</span>
                <span className="procurement-detail-v">{detail.requestNumber || '—'}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Статус заявки</span>
                <span className="procurement-detail-v">{STATUS_LABELS[detail.status] || detail.status}</span>
              </div>
              {detail.status === 'completed' && detail.receiptOutcome ? (
                <div className="procurement-detail-row">
                  <span className="procurement-detail-k">Прийом на складі</span>
                  <span className="procurement-detail-v">
                    {RECEIPT_OUTCOME_LABELS[detail.receiptOutcome] || detail.receiptOutcome}
                  </span>
                </div>
              ) : null}
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Тип заявки</span>
                <span className="procurement-detail-v">{applicationKindLabel(detail)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Компанія платник</span>
                <span className="procurement-detail-v">{payerCompanyLabel(detail.payerCompany)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Відповідальний за запит (хто подав)</span>
                <span className="procurement-detail-v">{detail.requesterName || detail.requesterLogin || '—'}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Пріоритет заявки</span>
                <span className="procurement-detail-v">{priorityLabel(detail.priority)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Дата та час подачі заявки</span>
                <span className="procurement-detail-v">{formatDt(detail.createdAt)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Бажаний склад відвантаження</span>
                <span className="procurement-detail-v">{detail.desiredWarehouse || '—'}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Фактичний склад відвантаження</span>
                <span className="procurement-detail-v">{detail.actualWarehouse || '—'}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Дата виконання (відділ закупівель)</span>
                <span className="procurement-detail-v">{formatDt(detail.executorCompletedAt)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">П.І.Б. виконавця заявки (VidZakupok)</span>
                <span className="procurement-detail-v">{detail.executorName || detail.executorLogin || '—'}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">Дата відвантаження на склад (затвердження завскладу)</span>
                <span className="procurement-detail-v">{formatDt(detail.warehouseReceivedAt)}</span>
              </div>
              <div className="procurement-detail-row">
                <span className="procurement-detail-k">П.І.Б. завскладу (підтвердження надходження)</span>
                <span className="procurement-detail-v">
                  {detail.warehouseConfirmerName ||
                    (detail.warehouseConfirmerActions && detail.warehouseConfirmerActions.length
                      ? formatWarehouseConfirmerActions(detail.warehouseConfirmerActions)
                      : '') ||
                    detail.warehouseConfirmerLogin ||
                    '—'}
                </span>
              </div>

              {(detail.materials || []).length > 0 && (
                <div className="procurement-detail-materials procurement-detail-materials--full">
                  <span className="procurement-detail-k">Матеріали</span>
                  <div className="procurement-detail-v">
                    {canActAsExecutorOnRequest(detail) && materialsDraft ? (
                      <div className="procurement-executor-materials-editor">
                        <p className="procurement-field-hint">
                          Для кожної позиції з кількістю до відвантаження вкажіть <strong>фактичний склад</strong> (може
                          відрізнятися між рядками). Можна вказати аналог і кількість, позначити відвантаження аналогу,
                          відхилити позицію з обовʼязковою причиною. Сума кількості в колонках «Залишок (макс.)»
                          (основний товар) та «К-сть аналогу» (якщо увімкнено «Відвант. аналог») не може перевищувати
                          залишок після прийомів на складі.
                        </p>
                        <datalist id="procurement-wh-executor">
                          {warehouseOptions.map((w) => (
                            <option key={w.value} value={w.label} />
                          ))}
                        </datalist>
                        <div className="procurement-exec-table-wrap">
                          <table className="procurement-exec-materials-table">
                            <thead>
                              <tr>
                                <th>Заявник: найменування</th>
                                <th>Початкова кількість по заявці</th>
                                <th>Прийоми завскладом</th>
                                <th>Залишок (макс.)</th>
                                <th>Ціна</th>
                                <th>Фактичний склад відвантаження *</th>
                                <th>Аналог</th>
                                <th>К-сть аналогу</th>
                                <th>Відвант. аналог</th>
                                <th>Відхилити</th>
                                <th>Причина відхилення</th>
                              </tr>
                            </thead>
                            <tbody>
                              {materialsDraft.map((m, i) => {
                                const savedLine = detail.materials?.[i];
                                const maxRemainCap = savedLine ? maxRemainderAfterWarehouse(savedLine) : null;
                                const initialQtyDisp = savedLine ? initialQtyForLine(savedLine) : null;
                                const draftAnalog =
                                  !!m.analogShipped && String(m.analogName || '').trim().length > 0;
                                return (
                                <tr key={i} className={m.rejected ? 'procurement-row-rejected' : ''}>
                                  <td>{m.name}</td>
                                  <td>
                                    {initialQtyDisp != null && Number.isFinite(initialQtyDisp)
                                      ? initialQtyDisp
                                      : '—'}
                                  </td>
                                  <td className="procurement-wh-cell">
                                    {procurementReceiptsCellContent(savedLine || {}, detail)}
                                  </td>
                                  <td className="procurement-remainder-cell">
                                    {m.rejected || maxRemainCap === null ? (
                                      '—'
                                    ) : (
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        className="procurement-exec-input procurement-exec-input--narrow"
                                        value={
                                          m.quantity === null || m.quantity === undefined
                                            ? ''
                                            : String(m.quantity)
                                        }
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (maxRemainCap == null || m.rejected) {
                                            updateMaterialDraftRow(i, { quantity: v });
                                            return;
                                          }
                                          if (v === '') {
                                            if (draftAnalog) {
                                              const pair = clampMainAnalogSumToCap(
                                                0,
                                                parseNonNegMaterialQty(m.analogQuantity),
                                                maxRemainCap
                                              );
                                              updateMaterialDraftRow(i, {
                                                quantity: '',
                                                analogQuantity: String(pair.analog)
                                              });
                                            } else {
                                              updateMaterialDraftRow(i, { quantity: '' });
                                            }
                                            return;
                                          }
                                          if (Number.isNaN(Number(v))) {
                                            updateMaterialDraftRow(i, { quantity: v });
                                            return;
                                          }
                                          let n = Number(v);
                                          if (n < 0) n = 0;
                                          if (draftAnalog) {
                                            const pair = clampMainAnalogSumToCap(
                                              n,
                                              parseNonNegMaterialQty(m.analogQuantity),
                                              maxRemainCap
                                            );
                                            updateMaterialDraftRow(i, {
                                              quantity: String(pair.main),
                                              analogQuantity: String(pair.analog)
                                            });
                                          } else {
                                            if (n > maxRemainCap) n = maxRemainCap;
                                            updateMaterialDraftRow(i, { quantity: String(n) });
                                          }
                                        }}
                                        disabled={m.rejected}
                                        title="Кількість основного товару до відвантаження; разом з аналогом — не більше залишку"
                                      />
                                    )}
                                  </td>
                                  <td>{m.price != null && m.price !== '' ? m.price : '—'}</td>
                                  <td>
                                    <input
                                      type="text"
                                      className="procurement-exec-input"
                                      list="procurement-wh-executor"
                                      value={m.actualWarehouse != null && m.actualWarehouse !== undefined ? m.actualWarehouse : ''}
                                      onChange={(e) =>
                                        updateMaterialDraftRow(i, { actualWarehouse: e.target.value })
                                      }
                                      placeholder="Оберіть або введіть"
                                      disabled={m.rejected}
                                      title="Фактичний склад для цієї позиції (обовʼязково, якщо є кількість до відвантаження)"
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      className="procurement-exec-input"
                                      value={m.analogName}
                                      onChange={(e) => {
                                        const name = e.target.value;
                                        const willDraft =
                                          !!m.analogShipped &&
                                          String(name || '').trim().length > 0;
                                        if (
                                          willDraft &&
                                          maxRemainCap != null &&
                                          !m.rejected
                                        ) {
                                          const pair = clampMainAnalogSumToCap(
                                            parseNonNegMaterialQty(m.quantity),
                                            parseNonNegMaterialQty(m.analogQuantity),
                                            maxRemainCap
                                          );
                                          updateMaterialDraftRow(i, {
                                            analogName: name,
                                            quantity: String(pair.main),
                                            analogQuantity: String(pair.analog)
                                          });
                                        } else {
                                          updateMaterialDraftRow(i, { analogName: name });
                                        }
                                      }}
                                      placeholder="Аналог"
                                      disabled={m.rejected}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className="procurement-exec-input procurement-exec-input--narrow"
                                      value={m.analogQuantity}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (maxRemainCap == null || m.rejected) {
                                          updateMaterialDraftRow(i, { analogQuantity: v });
                                          return;
                                        }
                                        if (draftAnalog) {
                                          if (v === '') {
                                            const main = Math.min(
                                              parseNonNegMaterialQty(m.quantity),
                                              maxRemainCap
                                            );
                                            updateMaterialDraftRow(i, {
                                              analogQuantity: '',
                                              quantity: String(main)
                                            });
                                            return;
                                          }
                                          if (Number.isNaN(Number(v))) {
                                            updateMaterialDraftRow(i, { analogQuantity: v });
                                            return;
                                          }
                                          let n = Number(v);
                                          if (n < 0) n = 0;
                                          const pair = clampMainAnalogSumToCap(
                                            parseNonNegMaterialQty(m.quantity),
                                            n,
                                            maxRemainCap
                                          );
                                          updateMaterialDraftRow(i, {
                                            quantity: String(pair.main),
                                            analogQuantity: String(pair.analog)
                                          });
                                          return;
                                        }
                                        if (v !== '' && !Number.isNaN(Number(v))) {
                                          let n = Number(v);
                                          if (n > maxRemainCap) n = maxRemainCap;
                                          if (n < 0) n = 0;
                                          updateMaterialDraftRow(i, { analogQuantity: String(n) });
                                        } else {
                                          updateMaterialDraftRow(i, { analogQuantity: v });
                                        }
                                      }}
                                      placeholder="0"
                                      disabled={m.rejected}
                                    />
                                  </td>
                                  <td className="procurement-td-center">
                                    <input
                                      type="checkbox"
                                      checked={!!m.analogShipped}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        if (!checked) {
                                          updateMaterialDraftRow(i, { analogShipped: false });
                                          return;
                                        }
                                        if (
                                          maxRemainCap == null ||
                                          m.rejected ||
                                          !String(m.analogName || '').trim().length
                                        ) {
                                          updateMaterialDraftRow(i, { analogShipped: true });
                                          return;
                                        }
                                        const pair = clampMainAnalogSumToCap(
                                          parseNonNegMaterialQty(m.quantity),
                                          parseNonNegMaterialQty(m.analogQuantity),
                                          maxRemainCap
                                        );
                                        updateMaterialDraftRow(i, {
                                          analogShipped: true,
                                          quantity: String(pair.main),
                                          analogQuantity: String(pair.analog)
                                        });
                                      }}
                                      disabled={m.rejected}
                                      title="Відвантажити аналог"
                                    />
                                  </td>
                                  <td className="procurement-td-center">
                                    <input
                                      type="checkbox"
                                      checked={!!m.rejected}
                                      onChange={(e) => {
                                        const rej = e.target.checked;
                                        updateMaterialDraftRow(i, {
                                          rejected: rej,
                                          ...(rej
                                            ? {}
                                            : { rejectionReason: '', analogName: m.analogName })
                                        });
                                      }}
                                      title="Відхилити позицію"
                                    />
                                  </td>
                                  <td>
                                    <textarea
                                      className="procurement-exec-textarea"
                                      rows={2}
                                      value={m.rejectionReason}
                                      onChange={(e) =>
                                        updateMaterialDraftRow(i, { rejectionReason: e.target.value })
                                      }
                                      placeholder={m.rejected ? 'Обовʼязково: чому відхилено' : ''}
                                      disabled={!m.rejected}
                                    />
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <button
                          type="button"
                          className="procurement-btn-secondary"
                          disabled={saving}
                          onClick={() => persistExecutorMaterials(detail._id)}
                        >
                          Зберегти зміни по матеріалах
                        </button>
                      </div>
                    ) : (
                      <>
                        {isProcurementExecutorWorkStatus(detail.status) && !canActAsExecutorOnRequest(detail) ? (
                          <p className="procurement-field-hint procurement-materials-readonly-hint">
                            Редагування аналогів і відхилень доступне лише <strong>виконавцю</strong>, який натиснув «Взяти в
                            роботу» (або адміністратору).
                          </p>
                        ) : null}
                        {!isProcurementExecutorWorkStatus(detail.status) ? (
                          <p className="procurement-field-hint procurement-materials-readonly-hint">
                            <strong>Як змінити матеріал на аналог:</strong> це робить виконавець (VidZakupok), коли заявка
                            у статусі <strong>«Взята в роботу»</strong> або <strong>«Частково виконана»</strong> — у
                            колонках «Аналог», «К-сть аналогу», за потреби «Відвант. аналог», потім «Зберегти зміни по
                            матеріалах» і «Підтвердити відвантаження». Після переходу в «Чекає відвантаження на склад»
                            або «Повністю виконана» таблиця стає лише для перегляду.
                          </p>
                        ) : null}
                        <div className="procurement-exec-table-wrap">
                        <table className="procurement-mini-table procurement-mini-table--wide">
                        <thead>
                          <tr>
                            <th>Найменування</th>
                            <th>Початкова кількість по заявці</th>
                            <th>Прийоми завскладом</th>
                            <th>Залишок (макс.)</th>
                            <th>Ціна</th>
                            <th>Фактичний склад відвантаження</th>
                            <th>Аналог</th>
                            <th>К-сть аналогу</th>
                            <th>Відвант. аналог</th>
                            <th>Відхилено</th>
                            <th>Причина</th>
                            {detail.status === 'completed' ? <th>Очікувано (підсумок)</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.materials.map((m, i) => {
                            const exp = expectedQtyForLine(m);
                            const expDisp =
                              exp === null ? '—' : m.rejected ? '0' : String(exp);
                            const initialDisp = initialQtyForLine(m);
                            return (
                              <tr key={i}>
                                <td>{m.name}</td>
                                <td>
                                  {initialDisp != null && Number.isFinite(initialDisp)
                                    ? initialDisp
                                    : '—'}
                                </td>
                                <td className="procurement-wh-cell">
                                  {procurementReceiptsCellContent(m, detail)}
                                </td>
                                <td>{m.rejected || exp === null ? '—' : exp}</td>
                                <td>{m.price != null && m.price !== '' ? m.price : '—'}</td>
                                <td>{m.actualWarehouse ? m.actualWarehouse : '—'}</td>
                                <td>{m.analogName || '—'}</td>
                                <td>{m.analogQuantity != null && m.analogQuantity !== '' ? m.analogQuantity : '—'}</td>
                                <td>{m.analogShipped ? 'Так' : '—'}</td>
                                <td>{m.rejected ? 'Так' : '—'}</td>
                                <td>{m.rejectionReason || '—'}</td>
                                {detail.status === 'completed' ? <td>{expDisp}</td> : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {String(detail.notes || '').trim() ? (
                <div className="procurement-detail-row procurement-detail-row--block">
                  <span className="procurement-detail-k">Примітки</span>
                  <span className="procurement-detail-v procurement-detail-notes">{detail.notes}</span>
                </div>
              ) : null}

              <div className="procurement-detail-files">
                <span className="procurement-detail-k">Файли заявника</span>
                <div className="procurement-detail-v">
                  {(detail.attachments || []).length === 0 && <span>—</span>}
                  {(detail.attachments || []).map((a) => (
                    <button
                      key={a._id}
                      type="button"
                      className="procurement-file-link"
                      onClick={() => downloadAttachment(detail._id, a, 'requester')}
                    >
                      {a.originalName}
                      {a.size ? ` (${Math.round(a.size / 1024)} КБ)` : ''}
                    </button>
                  ))}
                </div>
              </div>

              {((detail.executorAttachments || []).length > 0 || canActAsExecutorOnRequest(detail)) && (
                <div className="procurement-detail-files">
                  <span className="procurement-detail-k">Файли виконавця (рахунки, видаткові накладні)</span>
                  <div className="procurement-detail-v">
                    {(detail.executorAttachments || []).length === 0 && <span>—</span>}
                    {(detail.executorAttachments || []).map((a) => (
                      <button
                        key={a._id}
                        type="button"
                        className="procurement-file-link procurement-file-link--executor"
                        onClick={() => downloadAttachment(detail._id, a, 'executor')}
                      >
                        {a.docKind ? `[${executorAttachmentDocLabel(a.docKind)}] ` : ''}
                        {a.originalName}
                        {a.size ? ` (${Math.round(a.size / 1024)} КБ)` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {canActAsExecutorOnRequest(detail) && (
                <div className="procurement-executor-upload">
                  <span className="procurement-detail-k">Додати файли виконавця</span>
                  <div className="procurement-detail-v procurement-executor-upload-row">
                    <label className="procurement-exec-doc-kind">
                      <span>Тип документа</span>
                      <select
                        value={executorUploadDocKind}
                        onChange={(e) => setExecutorUploadDocKind(e.target.value)}
                      >
                        {EXECUTOR_DOC_KIND_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      type="file"
                      multiple
                      disabled={saving}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,image/jpeg"
                      onChange={(e) => {
                        const fl = e.target.files;
                        if (fl && fl.length) uploadExecutorFiles(detail._id, fl, executorUploadDocKind);
                        e.target.value = '';
                      }}
                    />
                    <span className="procurement-field-hint">
                      Рахунки, видаткові накладні, зображення (JPEG); до 12 файлів за один раз (до 15 МБ кожен).
                    </span>
                  </div>
                </div>
              )}

              <div className="procurement-detail-actions">
                {detail.status === 'pending_review' && isVidZakupok && (
                  <button
                    type="button"
                    className="procurement-btn-primary"
                    disabled={saving}
                    onClick={() => takeInWork(detail._id)}
                  >
                    Взяти в роботу
                  </button>
                )}
                {isProcurementExecutorWorkStatus(detail.status) && isVidZakupok && (
                  <div className="procurement-executor-block">
                    <button
                      type="button"
                      className="procurement-btn-primary"
                      disabled={saving}
                      onClick={() => completeExecutor(detail._id)}
                    >
                      Підтвердити відвантаження (завершити етап закупівель)
                    </button>
                  </div>
                )}
                {detail.status === 'awaiting_warehouse' && isWarehouseConfirmer && (
                  <p className="procurement-field-hint" style={{ marginTop: 12 }}>
                    Підтвердження фактичної кількості прийому робить <strong>завсклад</strong> у розділі{' '}
                    <strong>Складський облік → Затвердження отримання товару</strong> (блок «Надходження від
                    закупівель»).
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProcurementDashboard;
