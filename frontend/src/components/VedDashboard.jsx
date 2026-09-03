import React, { useCallback, useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import { tryHandleUnauthorizedResponse } from '../utils/authSession';
import ManagerNotificationsTab from './manager/ManagerNotificationsTab';
import './VedDashboard.css';

const VED_EQUIPMENT_TYPE_LABELS = {
  generator_diesel: 'Дизель-генератор',
  generator_benzin_gas: 'Бензин/газовий генератор',
  generator_gas: 'Газовий генератор',
  inverter_lifepo4: 'Інвертор + LiFePO4',
  inverter_hybrid: 'Гібридний інвертор',
  batteries_lifepo4: 'Батареї LiFePO4',
  ups: 'ДБЖ / UPS',
  ats: 'АВР / ATS',
  solar_panels: 'Сонячні панелі',
  solar_inverter: 'Сонячний інвертор',
  charging_ev: 'Зарядна станція EV',
  spare_parts: 'Запчастини / комплектуючі',
  other: 'Інше обладнання',
};

const PRODUCT_ORDER_DEFAULT_STATUS = 'активен';

const SUPPLIER_REGISTRY_SECTIONS = {
  'supplier-search': {
    workflowStatus: 'registry',
    title: 'Реєстр постачальників',
    emptyText: 'Реєстр порожній. Запустіть ручний пошук або дочекайтеся автоматичного оновлення о 02:00.',
  },
  'suppliers-active': {
    workflowStatus: 'active',
    title: 'Активні постачальники',
    emptyText: 'Немає активних постачальників.',
  },
  'suppliers-review': {
    workflowStatus: 'review',
    title: 'Постачальники на розгляді',
    emptyText: 'Немає постачальників на розгляді.',
  },
  'suppliers-rejected': {
    workflowStatus: 'rejected',
    title: 'Відхилені постачальники',
    emptyText: 'Немає відхилених постачальників.',
  },
};

function isSupplierRegistrySection(section) {
  return Object.prototype.hasOwnProperty.call(SUPPLIER_REGISTRY_SECTIONS, section);
}

const EMPTY_PROPOSAL = {
  supplierName: '',
  country: '',
  website: '',
  contact: '',
  productModel: '',
  price: '',
  currency: 'USD',
  incoterms: 'FOB',
  moq: '',
  leadTime: '',
  prepaymentPercent: '',
  paymentTerms: '',
  comment: '',
};

function normalizeRole(role) {
  return String(role || '').toLowerCase();
}

function isVedStaff(user) {
  return ['admin', 'administrator', 'ved', 'vidved'].includes(normalizeRole(user?.role));
}

function isVedAdmin(user) {
  return ['admin', 'administrator'].includes(normalizeRole(user?.role));
}

function formatDt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatPriceRange(from, to, currency) {
  const cur = currency ? ` ${currency}` : '';
  if (from != null && to != null && from !== to) return `${from} – ${to}${cur}`;
  if (from != null) return `${from}${cur}`;
  if (to != null) return `${to}${cur}`;
  return '—';
}

function formatRegistryCategories(row) {
  const labels = Array.isArray(row.tradeCategories) && row.tradeCategories.length
    ? row.tradeCategories
    : Array.isArray(row.categoryLabels) && row.categoryLabels.length
      ? row.categoryLabels
      : [];
  return labels.map((x) => String(x || '').trim()).filter(Boolean);
}

function formatWebsite(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const href = raw.startsWith('http') ? raw : `https://${raw}`;
  const label = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '').slice(0, 48);
  return { href, label: label || href };
}

function VedDashboard({ user }) {
  const canManage = isVedStaff(user);
  const canAdminRegistry = isVedAdmin(user);
  const canCreate = canManage || ['manager', 'mgradm'].includes(normalizeRole(user?.role));

  const [meta, setMeta] = useState(null);
  const [section, setSection] = useState('active');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [proposalForm, setProposalForm] = useState(EMPTY_PROPOSAL);
  const [editingProposalId, setEditingProposalId] = useState(null);
  const [vedCommentDraft, setVedCommentDraft] = useState('');
  const [aiConfig, setAiConfig] = useState(null);
  const [aiSessions, setAiSessions] = useState([]);
  const [aiSessionDetail, setAiSessionDetail] = useState(null);
  const [aiExtraHint, setAiExtraHint] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [supplierRegistry, setSupplierRegistry] = useState([]);
  const [registryMeta, setRegistryMeta] = useState(null);
  const [registryFilterType, setRegistryFilterType] = useState('');
  const [registryLoading, setRegistryLoading] = useState(false);
  const [lastSearchResult, setLastSearchResult] = useState(null);
  const [searchFormExpanded, setSearchFormExpanded] = useState(true);
  const [registryExpanded, setRegistryExpanded] = useState(true);
  const [autoSearchInfoExpanded, setAutoSearchInfoExpanded] = useState(false);
  const [selectedRegistryIds, setSelectedRegistryIds] = useState([]);
  const [registryDeleting, setRegistryDeleting] = useState(false);
  const [registryWorkflowChanging, setRegistryWorkflowChanging] = useState(null);
  const [searchForm, setSearchForm] = useState({
    equipmentTypes: ['generator_diesel'],
    equipmentName: '',
    technicalRequirements: '',
    quantity: 1,
    extraSearchHint: '',
  });

  const [productOrderMeta, setProductOrderMeta] = useState(null);
  const [productOrderSheet, setProductOrderSheet] = useState('dgu');
  const [productOrders, setProductOrders] = useState([]);
  const [productOrderTotal, setProductOrderTotal] = useState(0);
  const [productOrderLoading, setProductOrderLoading] = useState(false);
  const [productOrderSearch, setProductOrderSearch] = useState('');
  const [productOrderStatusFilter, setProductOrderStatusFilter] = useState(PRODUCT_ORDER_DEFAULT_STATUS);
  const [productOrderSupplierFilter, setProductOrderSupplierFilter] = useState('');

  const [newForm, setNewForm] = useState({
    equipmentType: 'generator_diesel',
    equipmentName: '',
    technicalRequirements: '',
    quantity: 1,
    desiredDeliveryDate: '',
    priority: 'normal',
    managerComment: '',
  });

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadAiConfig = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ved/ai/config`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) setAiConfig(await res.json());
    } catch {
      /* ignore */
    }
  }, [authHeaders, canManage]);

  const loadAiSessions = useCallback(
    async (requestId) => {
      if (!canManage || !requestId) {
        setAiSessions([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/ved/requests/${requestId}/ai-research`, {
          headers: authHeaders,
        });
        if (tryHandleUnauthorizedResponse(res)) return;
        if (res.ok) setAiSessions(await res.json());
        else setAiSessions([]);
      } catch {
        setAiSessions([]);
      }
    },
    [authHeaders, canManage]
  );

  const loadAiSessionDetail = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        setAiSessionDetail(null);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/ved/ai-research/${sessionId}`, { headers: authHeaders });
        if (tryHandleUnauthorizedResponse(res)) return;
        if (res.ok) setAiSessionDetail(await res.json());
      } catch {
        setAiSessionDetail(null);
      }
    },
    [authHeaders]
  );

  const loadSupplierRegistry = useCallback(async () => {
    if (!canManage) return;
    const workflowStatus = SUPPLIER_REGISTRY_SECTIONS[section]?.workflowStatus || 'registry';
    setRegistryLoading(true);
    try {
      const params = new URLSearchParams({ workflowStatus });
      if (registryFilterType) params.set('equipmentType', registryFilterType);
      const res = await fetch(`${API_BASE_URL}/ved/supplier-registry?${params}`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) setSupplierRegistry(await res.json());
      else setSupplierRegistry([]);
    } catch {
      setSupplierRegistry([]);
    } finally {
      setRegistryLoading(false);
    }
  }, [authHeaders, canManage, registryFilterType, section]);

  const loadRegistryMeta = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ved/supplier-registry/meta`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) setRegistryMeta(await res.json());
    } catch {
      /* ignore */
    }
  }, [authHeaders, canManage]);

  useEffect(() => {
    loadAiConfig();
  }, [loadAiConfig]);

  useEffect(() => {
    if (canManage) loadRegistryMeta();
  }, [canManage, loadRegistryMeta]);

  useEffect(() => {
    if (isSupplierRegistrySection(section) && canManage) {
      setSelectedRegistryIds([]);
      loadSupplierRegistry();
      loadRegistryMeta();
    }
  }, [section, canManage, loadSupplierRegistry, loadRegistryMeta]);

  useEffect(() => {
    if (selectedId && canManage) loadAiSessions(selectedId);
    else {
      setAiSessions([]);
      setAiSessionDetail(null);
    }
  }, [selectedId, canManage, loadAiSessions]);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/ved/meta`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) setMeta(await res.json());
    } catch {
      /* ignore */
    }
  }, [authHeaders]);

  const loadRequests = useCallback(async () => {
    if (
      section === 'new' ||
      section === 'notifications' ||
      section === 'product-orders' ||
      isSupplierRegistrySection(section)
    ) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ved/requests?section=${section}`, {
        headers: authHeaders,
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) {
        setRequests(await res.json());
      } else {
        setRequests([]);
      }
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, section]);

  const loadProductOrderMeta = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ved/product-orders/meta`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) setProductOrderMeta(await res.json());
    } catch {
      /* ignore */
    }
  }, [authHeaders, canManage]);

  useEffect(() => {
    if (canManage) loadProductOrderMeta();
  }, [canManage, loadProductOrderMeta]);

  const loadProductOrders = useCallback(async (overrides = {}) => {
    if (!canManage) return;
    setProductOrderLoading(true);
    try {
      const sheetType = overrides.sheetType ?? productOrderSheet;
      const search = overrides.search !== undefined ? overrides.search : productOrderSearch;
      const status = overrides.status !== undefined ? overrides.status : productOrderStatusFilter;
      const supplier =
        overrides.supplier !== undefined ? overrides.supplier : productOrderSupplierFilter;

      const params = new URLSearchParams({
        sheetType,
        limit: '500',
      });
      if (String(search || '').trim()) params.set('search', String(search).trim());
      if (String(status || '').trim()) params.set('status', String(status).trim());
      if (String(supplier || '').trim()) params.set('supplier', String(supplier).trim());
      const res = await fetch(`${API_BASE_URL}/ved/product-orders?${params}`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) {
        const data = await res.json();
        setProductOrders(data.rows || []);
        setProductOrderTotal(data.total ?? 0);
      } else {
        setProductOrders([]);
        setProductOrderTotal(0);
      }
    } catch {
      setProductOrders([]);
      setProductOrderTotal(0);
    } finally {
      setProductOrderLoading(false);
    }
  }, [
    authHeaders,
    canManage,
    productOrderSheet,
    productOrderSearch,
    productOrderStatusFilter,
    productOrderSupplierFilter,
  ]);

  useEffect(() => {
    if (section === 'product-orders' && canManage) {
      loadProductOrderMeta();
      loadProductOrders();
    }
  }, [section, canManage, loadProductOrderMeta, loadProductOrders]);

  const loadDetail = useCallback(
    async (id) => {
      if (!id) {
        setDetail(null);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/ved/requests/${id}`, { headers: authHeaders });
        if (tryHandleUnauthorizedResponse(res)) return;
        if (res.ok) {
          const data = await res.json();
          setDetail(data);
          setVedCommentDraft(data.vedComment || '');
        }
      } catch {
        setDetail(null);
      }
    },
    [authHeaders]
  );

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const statusLabel = (status) => meta?.statuses?.[status] || status || '—';
  const equipmentTypesMap = meta?.equipmentTypes || VED_EQUIPMENT_TYPE_LABELS;
  const equipmentLabel = (type) => equipmentTypesMap[type] || type || '—';
  const priorityLabel = (p) => meta?.priorities?.[p] || p || '—';

  const openRequest = (id) => {
    setSelectedId(id);
    setSection('detail');
    setEditingProposalId(null);
    setProposalForm(EMPTY_PROPOSAL);
  };

  const backToList = () => {
    setSelectedId(null);
    setDetail(null);
    setSection('active');
    setEditingProposalId(null);
    setProposalForm(EMPTY_PROPOSAL);
    loadRequests();
  };

  const submitNewRequest = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ved/requests`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Помилка');
        return;
      }
      setNewForm({
        equipmentType: 'generator_diesel',
        equipmentName: '',
        technicalRequirements: '',
        quantity: 1,
        desiredDeliveryDate: '',
        priority: 'normal',
        managerComment: '',
      });
      alert(`Заявку ${data.requestNumber || ''} подано до ВЕД`);
      setSection('active');
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const apiAction = async (path, body, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ved/requests/${detail._id}${path}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Помилка');
        return;
      }
      setDetail(data);
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const saveVedComment = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ved/requests/${detail._id}/ved-comment`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ vedComment: vedCommentDraft }),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Помилка');
        return;
      }
      setDetail(data);
    } finally {
      setSaving(false);
    }
  };

  const saveProposal = async () => {
    setSaving(true);
    try {
      const url = editingProposalId
        ? `${API_BASE_URL}/ved/requests/${detail._id}/proposals/${editingProposalId}`
        : `${API_BASE_URL}/ved/requests/${detail._id}/proposals`;
      const res = await fetch(url, {
        method: editingProposalId ? 'PATCH' : 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalForm),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Помилка');
        return;
      }
      setDetail(data);
      setEditingProposalId(null);
      setProposalForm(EMPTY_PROPOSAL);
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const deleteProposal = async (proposalId) => {
    if (!window.confirm('Видалити цю пропозицію?')) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/ved/requests/${detail._id}/proposals/${proposalId}`,
        { method: 'DELETE', headers: authHeaders }
      );
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Помилка');
        return;
      }
      setDetail(data);
      await loadRequests();
    } finally {
      setSaving(false);
    }
  };

  const startEditProposal = (p) => {
    setEditingProposalId(p._id);
    setProposalForm({
      supplierName: p.supplierName || '',
      country: p.country || '',
      website: p.website || '',
      contact: p.contact || '',
      productModel: p.productModel || '',
      price: p.price ?? '',
      currency: p.currency || 'USD',
      incoterms: p.incoterms || 'FOB',
      moq: p.moq || '',
      leadTime: p.leadTime || '',
      prepaymentPercent: p.prepaymentPercent ?? '',
      paymentTerms: p.paymentTerms || '',
      comment: p.comment || '',
    });
  };

  const runAiResearch = async () => {
    if (!detail?._id) return;
    if (aiConfig?.remainingToday === 0) {
      alert(`Денний ліміт ШІ-пошуків (${aiConfig?.dailyLimit || 8}) вичерпано.`);
      return;
    }
    setAiRunning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/ved/requests/${detail._id}/ai-research`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraSearchHint: aiExtraHint }),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Помилка ШІ-пошуку');
        if (data.sessionId) await loadAiSessionDetail(data.sessionId);
        return;
      }
      setAiSessionDetail(data);
      await loadAiSessions(detail._id);
      await loadAiConfig();
      await loadDetail(detail._id);
      await loadRequests();
    } finally {
      setAiRunning(false);
    }
  };

  const addCandidateFromAi = async (sessionId, candidateId) => {
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/ved/ai-research/${sessionId}/candidates/${candidateId}/add-proposal`,
        { method: 'POST', headers: authHeaders }
      );
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Помилка');
        return;
      }
      setDetail(data.request);
      setAiSessionDetail(data.session);
      await loadAiSessions(detail._id);
      await loadRequests();
      alert('Чернетку додано в пропозиції. Доповніть обов’язкові поля та перевірте дані.');
    } finally {
      setSaving(false);
    }
  };

  const priceStatusLabel = (s) => {
    if (s === 'quoted') return 'котировка (не перевірено)';
    if (s === 'estimated') return 'орієнтовна';
    return 'не перевірено';
  };

  const renderAiSessionResults = (session, { allowAddToProposal = false } = {}) => {
    if (!session) return null;
    return (
      <div className="ved-ai-result">
        {session.status === 'failed' && (
          <p className="ved-ai-error">Помилка: {session.error || 'невідома'}</p>
        )}
        {session.status === 'completed' && (
          <>
            {session.summary && <p className="ved-ai-summary">{session.summary}</p>}
            {session.recommendations?.length > 0 && (
              <ul className="ved-ai-recs">
                {session.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            <p className="ved-ai-disclaimer-small">{session.disclaimer}</p>
            {(session.candidates || []).map((c) => (
              <div key={c._id} className="ved-ai-candidate">
                <div className="ved-ai-candidate-head">
                  <strong>{c.supplierName || '—'}</strong>
                  {c.country ? ` · ${c.country}` : ''}
                </div>
                <div className="ved-ai-candidate-body">
                  {c.productModel && <div>Модель: {c.productModel}</div>}
                  {c.productSummary && <div>{c.productSummary}</div>}
                  {(c.priceEstimate != null || c.currency) && (
                    <div>
                      Ціна: {c.priceEstimate != null ? `${c.priceEstimate} ${c.currency || ''}` : '—'}{' '}
                      <span className="ved-ai-price-tag">({priceStatusLabel(c.priceStatus)})</span>
                    </div>
                  )}
                  {(c.website || c.contact) && (
                    <div>
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noopener noreferrer">
                          {c.website}
                        </a>
                      )}
                      {c.contact ? ` · ${c.contact}` : ''}
                    </div>
                  )}
                  {c.riskNotes?.length > 0 && (
                    <div className="ved-ai-risks">Ризики: {c.riskNotes.join('; ')}</div>
                  )}
                  {c.sourceUrls?.length > 0 && (
                    <div className="ved-ai-sources">
                      Джерела:{' '}
                      {c.sourceUrls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                          [{i + 1}]
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                {allowAddToProposal &&
                  (!c.addedToProposalId ? (
                    <button
                      type="button"
                      className="ved-btn ved-btn-secondary"
                      disabled={saving}
                      onClick={() => addCandidateFromAi(session._id, c._id)}
                    >
                      Додати в пропозиції заявки (чернетка)
                    </button>
                  ) : (
                    <span className="ved-ai-added">✓ Додано в пропозиції</span>
                  ))}
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  const toggleSearchEquipmentType = (key) => {
    setSearchForm((f) => {
      const set = new Set(f.equipmentTypes || []);
      if (set.has(key)) {
        if (set.size <= 1) return f;
        set.delete(key);
      } else {
        set.add(key);
      }
      return { ...f, equipmentTypes: [...set] };
    });
  };

  const visibleRegistryIds = useMemo(
    () => supplierRegistry.map((r) => r._id).filter(Boolean),
    [supplierRegistry]
  );

  const allVisibleRegistrySelected =
    visibleRegistryIds.length > 0 && visibleRegistryIds.every((id) => selectedRegistryIds.includes(id));

  const toggleRegistrySelection = (id) => {
    setSelectedRegistryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleRegistrySelectAll = () => {
    if (allVisibleRegistrySelected) {
      setSelectedRegistryIds((prev) => prev.filter((id) => !visibleRegistryIds.includes(id)));
    } else {
      setSelectedRegistryIds((prev) => [...new Set([...prev, ...visibleRegistryIds])]);
    }
  };

  const deleteRegistryEntries = async (ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return;

    const names = supplierRegistry
      .filter((r) => unique.includes(r._id))
      .map((r) => r.supplierName || r.productName || '—')
      .slice(0, 5);
    const preview = names.join(', ');
    const msg =
      unique.length === 1
        ? `Видалити постачальника «${preview}» з реєстру?`
        : `Видалити ${unique.length} записів з реєстру?\n${preview}${unique.length > 5 ? '…' : ''}`;
    if (!window.confirm(msg)) return;

    setRegistryDeleting(true);
    try {
      const res =
        unique.length === 1
          ? await fetch(`${API_BASE_URL}/ved/supplier-registry/${unique[0]}`, {
              method: 'DELETE',
              headers: authHeaders,
            })
          : await fetch(`${API_BASE_URL}/ved/supplier-registry/bulk-delete`, {
              method: 'POST',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: unique }),
            });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Не вдалося видалити');
        return;
      }
      setSelectedRegistryIds((prev) => prev.filter((id) => !unique.includes(id)));
      await loadSupplierRegistry();
      await loadRegistryMeta();
    } finally {
      setRegistryDeleting(false);
    }
  };

  const changeRegistryWorkflowStatus = async (id, status, supplierName) => {
    const statusLabels = {
      review: 'постачальники на розгляді',
      rejected: 'відхилені постачальники',
      active: 'активні постачальники',
      registry: 'реєстр постачальників',
    };
    const label = statusLabels[status] || status;
    const name = supplierName || 'постачальника';
    if (!window.confirm(`Перевести «${name}» у розділ «${label}»?`)) return;

    setRegistryWorkflowChanging(id);
    try {
      const res = await fetch(`${API_BASE_URL}/ved/supplier-registry/${id}/workflow-status`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Не вдалося змінити статус');
        return;
      }
      setSelectedRegistryIds((prev) => prev.filter((x) => x !== id));
      await loadSupplierRegistry();
      await loadRegistryMeta();
    } finally {
      setRegistryWorkflowChanging(null);
    }
  };

  const runStandaloneSearch = async (e) => {
    e.preventDefault();
    if (!searchForm.equipmentTypes?.length) {
      alert('Оберіть хоча б один тип обладнання');
      return;
    }
    if (aiConfig?.remainingToday === 0) {
      alert(`Денний ліміт ШІ-пошуків (${aiConfig?.dailyLimit || 8}) вичерпано.`);
      return;
    }
    setAiRunning(true);
    setLastSearchResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ved/supplier-registry/search`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(searchForm),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Помилка ШІ-пошуку');
        return;
      }
      setLastSearchResult(data);
      await loadSupplierRegistry();
      await loadRegistryMeta();
      await loadAiConfig();
    } finally {
      setAiRunning(false);
    }
  };

  const renderList = () => (
    <div className="ved-list-panel">
      {loading ? (
        <div className="ved-loading">Завантаження…</div>
      ) : requests.length === 0 ? (
        <div className="ved-empty">Немає заявок у цьому розділі</div>
      ) : (
        <table className="ved-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Дата</th>
              <th>Статус</th>
              <th>Обладнання</th>
              <th>Менеджер</th>
              {canManage && <th>Пропозиції</th>}
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r._id} onClick={() => openRequest(r._id)}>
                <td>{r.requestNumber || '—'}</td>
                <td>{formatDt(r.createdAt)}</td>
                <td>
                  <span className={`ved-status-badge ved-status-${r.status}`}>
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td>
                  {equipmentLabel(r.equipmentType)}
                  {r.equipmentName ? `: ${r.equipmentName}` : ''}
                </td>
                <td>{r.requesterName || r.requesterLogin || '—'}</td>
                {canManage && (
                  <td>
                    {r.validProposalCount ?? 0} / {r.proposalCount ?? 0}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderProposalForm = () => (
    <div className="ved-proposal-form">
      {[
        ['supplierName', 'Постачальник *'],
        ['country', 'Країна *'],
        ['website', 'Сайт'],
        ['contact', 'Контакт *'],
        ['productModel', 'Модель / номенклатура *'],
        ['price', 'Ціна *', 'number'],
        ['currency', 'Валюта *'],
        ['incoterms', 'Incoterms *', 'select'],
        ['moq', 'MOQ *'],
        ['leadTime', 'Lead time *'],
        ['prepaymentPercent', '% передоплати *', 'number'],
        ['paymentTerms', 'Умови оплати (решта)'],
      ].map(([key, label, type]) => (
        <div className="ved-form-row" key={key}>
          <label>{label}</label>
          {type === 'select' ? (
            <select
              value={proposalForm[key]}
              onChange={(e) => setProposalForm((f) => ({ ...f, [key]: e.target.value }))}
            >
              {(meta?.incoterms || ['FOB', 'CIF', 'EXW']).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={type || 'text'}
              value={proposalForm[key]}
              onChange={(e) => setProposalForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <div className="ved-form-row" style={{ gridColumn: '1 / -1' }}>
        <label>Коментар / ризики</label>
        <textarea
          value={proposalForm.comment}
          onChange={(e) => setProposalForm((f) => ({ ...f, comment: e.target.value }))}
          rows={2}
        />
      </div>
      <div className="ved-actions" style={{ gridColumn: '1 / -1' }}>
        <button type="button" className="ved-btn ved-btn-primary" disabled={saving} onClick={saveProposal}>
          {editingProposalId ? 'Зберегти пропозицію' : 'Додати пропозицію'}
        </button>
        {editingProposalId && (
          <button
            type="button"
            className="ved-btn ved-btn-secondary"
            onClick={() => {
              setEditingProposalId(null);
              setProposalForm(EMPTY_PROPOSAL);
            }}
          >
            Скасувати редагування
          </button>
        )}
      </div>
    </div>
  );

  const renderDetail = () => {
    if (!detail) return <div className="ved-loading">Завантаження…</div>;
    const proposals = detail.proposals || [];

    return (
      <div className="ved-detail-panel">
        <div className="ved-detail-header">
          <button type="button" className="ved-back-btn" onClick={backToList}>
            ← До списку
          </button>
          <h2>{detail.requestNumber}</h2>
          <span className={`ved-status-badge ved-status-${detail.status}`}>
            {statusLabel(detail.status)}
          </span>
        </div>

        <div className="ved-card">
          <h3>Заявка</h3>
          <div className="ved-grid">
            <div>
              <label>Тип обладнання</label>
              <div>{equipmentLabel(detail.equipmentType)}</div>
            </div>
            <div>
              <label>Найменування</label>
              <div>{detail.equipmentName || '—'}</div>
            </div>
            <div>
              <label>Кількість</label>
              <div>{detail.quantity ?? '—'}</div>
            </div>
            <div>
              <label>Пріоритет</label>
              <div>{priorityLabel(detail.priority)}</div>
            </div>
            <div>
              <label>Бажаний термін</label>
              <div>{detail.desiredDeliveryDate || '—'}</div>
            </div>
            <div>
              <label>Менеджер</label>
              <div>{detail.requesterName || detail.requesterLogin || '—'}</div>
            </div>
            {canManage && detail.vedName && (
              <div>
                <label>ВЕД</label>
                <div>{detail.vedName}</div>
              </div>
            )}
          </div>
          {detail.technicalRequirements && (
            <div className="ved-form-row" style={{ marginTop: 12 }}>
              <label>Технічні вимоги</label>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{detail.technicalRequirements}</div>
            </div>
          )}
          {detail.managerComment && (
            <div className="ved-form-row">
              <label>Коментар менеджера</label>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{detail.managerComment}</div>
            </div>
          )}
        </div>

        {(detail.finalDecisionSummary || detail.rejectedReason) && (
          <div className="ved-card">
            <h3>Рішення</h3>
            {detail.finalDecisionSummary && (
              <p style={{ margin: '0 0 8px', fontSize: 13 }}>{detail.finalDecisionSummary}</p>
            )}
            {detail.rejectedReason && (
              <p style={{ margin: 0, fontSize: 13, color: '#721c24' }}>
                Причина відхилення: {detail.rejectedReason}
              </p>
            )}
          </div>
        )}

        <div className="ved-card">
          <h3>Коментар ВЕД {canManage ? '' : '(для менеджера)'}</h3>
          {canManage ? (
            <>
              <textarea
                value={vedCommentDraft}
                onChange={(e) => setVedCommentDraft(e.target.value)}
                rows={3}
                style={{ width: '100%', maxWidth: '100%' }}
              />
              <div className="ved-actions">
                <button type="button" className="ved-btn ved-btn-secondary" disabled={saving} onClick={saveVedComment}>
                  Зберегти коментар
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{detail.vedComment || '—'}</div>
          )}
        </div>

        {canManage && meta?.aiEnabled && (
          <div className="ved-card ved-ai-card">
            <h3>🤖 Дослідження ШІ (лише для ВЕД)</h3>
            <p className="ved-ai-disclaimer">
              ШІ формує shortlist і аналітичну записку на основі відкритих джерел. Ціни, контакти та умови
              потребують обов’язкової перевірки перед RFQ. Менеджер цей блок не бачить.
            </p>
            {aiConfig && (
              <p className="ved-ai-meta">
                {aiConfig.hasWebSearch ? '✓ Веб-пошук (SerpApi, Азія + Європа)' : '⚠ Без веб-пошуку — лише LLM'}
                {' · '}
                Залишилось сьогодні: {aiConfig.remainingToday} / {aiConfig.dailyLimit}
              </p>
            )}
            {!['rejected', 'completed'].includes(detail.status) && (
              <>
                <div className="ved-form-row">
                  <label>Додатковий акцент пошуку (країна, бренд, Alibaba…)</label>
                  <input
                    value={aiExtraHint}
                    onChange={(e) => setAiExtraHint(e.target.value)}
                    placeholder="Напр. Китай, OEM, CE certified"
                  />
                </div>
                <div className="ved-actions">
                  <button
                    type="button"
                    className="ved-btn ved-btn-primary"
                    disabled={aiRunning || saving || aiConfig?.remainingToday === 0}
                    onClick={runAiResearch}
                  >
                    {aiRunning ? 'Пошук… (до 1–2 хв)' : 'Підібрати постачальників (ШІ)'}
                  </button>
                </div>
              </>
            )}

            {aiSessions.length > 0 && (
              <div className="ved-ai-sessions">
                <h4>Історія сесій</h4>
                <ul className="ved-ai-session-list">
                  {aiSessions.map((s) => (
                    <li key={s._id}>
                      <button
                        type="button"
                        className={`ved-ai-session-btn ${aiSessionDetail?._id === s._id ? 'active' : ''}`}
                        onClick={() => loadAiSessionDetail(s._id)}
                      >
                        {formatDt(s.createdAt)} — {s.status === 'completed' ? `✓ ${(s.candidates || []).length} канд.` : s.status}
                        {s.createdByName ? ` · ${s.createdByName}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {renderAiSessionResults(aiSessionDetail, { allowAddToProposal: true })}
          </div>
        )}

        {canManage && (
          <>
            <div className="ved-card">
              <h3>Пропозиції постачальників</h3>
              {proposals.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Ще немає пропозицій</p>
              ) : (
                <table className="ved-proposals-table">
                  <thead>
                    <tr>
                      <th>Постачальник</th>
                      <th>Країна</th>
                      <th>Модель</th>
                      <th>Ціна</th>
                      <th>Incoterms</th>
                      <th>MOQ</th>
                      <th>Lead time</th>
                      <th>Prepay %</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((p) => (
                      <tr
                        key={p._id}
                        className={`${!p.isValid ? 'ved-proposal-invalid' : ''} ${p.chosen ? 'ved-proposal-chosen' : ''}`}
                      >
                        <td>{p.supplierName || '—'}</td>
                        <td>{p.country || '—'}</td>
                        <td>{p.productModel || '—'}</td>
                        <td>
                          {p.price != null ? `${p.price} ${p.currency || ''}` : '—'}
                        </td>
                        <td>{p.incoterms || '—'}</td>
                        <td>{p.moq || '—'}</td>
                        <td>{p.leadTime || '—'}</td>
                        <td>{p.prepaymentPercent != null ? `${p.prepaymentPercent}%` : '—'}</td>
                        <td>
                          <button type="button" className="ved-btn ved-btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => startEditProposal(p)}>
                            ✎
                          </button>
                          {!p.chosen && (
                            <button type="button" className="ved-btn ved-btn-danger" style={{ padding: '4px 8px', fontSize: 11, marginLeft: 4 }} onClick={() => deleteProposal(p._id)}>
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {renderProposalForm()}
            </div>

            <div className="ved-actions">
              {detail.status === 'pending_review' && (
                <button type="button" className="ved-btn ved-btn-primary" disabled={saving} onClick={() => apiAction('/take-in-work')}>
                  Взяти в роботу
                </button>
              )}
              {!['rejected', 'completed', 'supplier_chosen'].includes(detail.status) && (
                <button
                  type="button"
                  className="ved-btn ved-btn-primary"
                  disabled={saving}
                  onClick={() => apiAction('/mark-proposals-ready', null, 'Позначити пропозиції як готові?')}
                >
                  Пропозиції готові
                </button>
              )}
              {proposals.filter((p) => p.isValid).length > 0 &&
                !['rejected', 'completed'].includes(detail.status) && (
                  <>
                    {proposals
                      .filter((p) => p.isValid)
                      .map((p) => (
                        <button
                          key={p._id}
                          type="button"
                          className="ved-btn ved-btn-secondary"
                          disabled={saving || detail.status === 'supplier_chosen'}
                          onClick={() =>
                            apiAction('/choose-supplier', { proposalId: p._id }, `Обрати постачальника ${p.supplierName}?`)
                          }
                        >
                          Обрати: {p.supplierName}
                        </button>
                      ))}
                  </>
                )}
              {detail.status === 'supplier_chosen' && (
                <button
                  type="button"
                  className="ved-btn ved-btn-primary"
                  disabled={saving}
                  onClick={() => apiAction('/complete', null, 'Закрити заявку в архів?')}
                >
                  Завершити (архів)
                </button>
              )}
              {!['rejected', 'completed'].includes(detail.status) && (
                <button
                  type="button"
                  className="ved-btn ved-btn-danger"
                  disabled={saving}
                  onClick={() => {
                    const reason = window.prompt('Причина відхилення (необов’язково):') || '';
                    apiAction('/reject', { reason });
                  }}
                >
                  Відхилити
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderRegistryRowActions = (row, workflowStatus) => {
    const busy = registryWorkflowChanging === row._id || registryDeleting;
    const name = row.supplierName || row.productName || '—';
    return (
      <div className="ved-registry-workflow-actions">
        {workflowStatus === 'registry' && canManage && (
          <>
            <button
              type="button"
              className="ved-btn ved-btn-secondary ved-btn-small"
              disabled={busy}
              onClick={() => changeRegistryWorkflowStatus(row._id, 'review', name)}
              title="Перевести на розгляд"
            >
              На розгляд
            </button>
            <button
              type="button"
              className="ved-btn ved-btn-warning ved-btn-small"
              disabled={busy}
              onClick={() => changeRegistryWorkflowStatus(row._id, 'rejected', name)}
              title="Відхилити постачальника"
            >
              Відхилити
            </button>
          </>
        )}
        {workflowStatus === 'review' && canManage && (
          <>
            <button
              type="button"
              className="ved-btn ved-btn-primary ved-btn-small"
              disabled={busy}
              onClick={() => changeRegistryWorkflowStatus(row._id, 'active', name)}
              title="Активувати постачальника"
            >
              Активувати
            </button>
            <button
              type="button"
              className="ved-btn ved-btn-warning ved-btn-small"
              disabled={busy}
              onClick={() => changeRegistryWorkflowStatus(row._id, 'rejected', name)}
              title="Відхилити постачальника"
            >
              Відхилити
            </button>
          </>
        )}
        {canAdminRegistry && (
          <button
            type="button"
            className="ved-btn ved-btn-danger ved-btn-small"
            disabled={busy}
            onClick={() => deleteRegistryEntries([row._id])}
            title="Видалити постачальника"
          >
            🗑
          </button>
        )}
      </div>
    );
  };

  const renderSupplierRegistryTableCard = (sectionKey) => {
    const sectionConfig = SUPPLIER_REGISTRY_SECTIONS[sectionKey];
    const workflowStatus = sectionConfig?.workflowStatus || 'registry';
    const tableTitle = sectionConfig?.title || 'Реєстр постачальників';
    const emptyText = sectionConfig?.emptyText || 'Немає записів';
    const showActionsCol = canManage || canAdminRegistry;
    const isSearchSection = sectionKey === 'supplier-search';

    return (
      <div className="ved-card ved-registry-table-card">
        <div className="ved-registry-table-toolbar">
          {isSearchSection ? (
            <button
              type="button"
              className="ved-collapsible-header ved-collapsible-header-inline"
              onClick={() => setRegistryExpanded((v) => !v)}
              aria-expanded={registryExpanded}
            >
              <h3 style={{ margin: 0 }}>{tableTitle}</h3>
              <span className="ved-collapsible-toggle">{registryExpanded ? '▼' : '▶'}</span>
            </button>
          ) : (
            <h3 style={{ margin: 0 }}>{tableTitle}</h3>
          )}
          <div className="ved-registry-table-filters">
            <label>
              Фільтр типу:
              <select
                value={registryFilterType}
                onChange={(e) => setRegistryFilterType(e.target.value)}
              >
                <option value="">Усі типи</option>
                {Object.entries(equipmentTypesMap).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="ved-btn" onClick={loadSupplierRegistry} disabled={registryLoading}>
              {registryLoading ? '…' : '↻ Оновити'}
            </button>
            {canAdminRegistry && selectedRegistryIds.length > 0 && (
              <button
                type="button"
                className="ved-btn ved-btn-danger"
                disabled={registryDeleting}
                onClick={() => deleteRegistryEntries(selectedRegistryIds)}
              >
                {registryDeleting ? '…' : `🗑 Видалити обрані (${selectedRegistryIds.length})`}
              </button>
            )}
          </div>
        </div>

        {(isSearchSection ? registryExpanded : true) && (
          <>
            {registryLoading && supplierRegistry.length === 0 ? (
              <div className="ved-loading">Завантаження…</div>
            ) : supplierRegistry.length === 0 ? (
              <div className="ved-empty">{emptyText}</div>
            ) : (
              <div className="ved-registry-table-wrap">
                <table className="ved-table ved-registry-table">
                  <thead>
                    <tr>
                      {canAdminRegistry && (
                        <th className="ved-registry-select-col">
                          <input
                            type="checkbox"
                            checked={allVisibleRegistrySelected}
                            onChange={toggleRegistrySelectAll}
                            title="Обрати всі на сторінці"
                          />
                        </th>
                      )}
                      <th>Категорія товару</th>
                      <th>Найменування товару</th>
                      <th>Постачальник</th>
                      <th>Країна</th>
                      <th>Ціна від – до</th>
                      <th>Сайт</th>
                      <th>Контакти</th>
                      <th>Сертифікати</th>
                      <th>Лінійка потужності</th>
                      <th>Ризики співпраці</th>
                      <th>Джерело</th>
                      {showActionsCol && <th className="ved-registry-actions-col">Дії</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {supplierRegistry.map((row) => {
                      const site = formatWebsite(row.website);
                      const categories = formatRegistryCategories(row);
                      return (
                        <tr
                          key={row._id}
                          className={selectedRegistryIds.includes(row._id) ? 'ved-registry-row-selected' : ''}
                        >
                          {canAdminRegistry && (
                            <td className="ved-registry-select-col">
                              <input
                                type="checkbox"
                                checked={selectedRegistryIds.includes(row._id)}
                                onChange={() => toggleRegistrySelection(row._id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                          )}
                          <td className="ved-registry-categories">
                            {categories.length ? (
                              categories.map((label) => (
                                <span key={`${row._id}-${label}`} className="ved-registry-category-chip">
                                  {label}
                                </span>
                              ))
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{row.productName || '—'}</td>
                          <td>{row.supplierName || '—'}</td>
                          <td>{row.country || '—'}</td>
                          <td>{formatPriceRange(row.priceFrom, row.priceTo, row.currency)}</td>
                          <td>
                            {site ? (
                              <a href={site.href} target="_blank" rel="noopener noreferrer">
                                {site.label}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="ved-registry-cell-wrap">{row.contacts || '—'}</td>
                          <td className="ved-registry-cell-wrap">{row.certificates || '—'}</td>
                          <td className="ved-registry-cell-wrap">{row.powerLineup || '—'}</td>
                          <td className="ved-registry-cell-wrap">{row.riskDescription || '—'}</td>
                          <td>
                            <span className={`ved-registry-source ved-registry-source-${row.source || 'manual'}`}>
                              {row.source === 'scheduled' ? 'авто' : 'ручний'}
                            </span>
                            <div className="ved-registry-added-at">{formatDt(row.createdAt)}</div>
                          </td>
                          {showActionsCol && (
                            <td className="ved-registry-actions-col">
                              {renderRegistryRowActions(row, workflowStatus)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderSupplierWorkflowSection = (sectionKey) => (
    <div className="ved-list-panel ved-supplier-registry-panel">{renderSupplierRegistryTableCard(sectionKey)}</div>
  );

  const renderSupplierSearch = () => (
    <div className="ved-list-panel ved-supplier-registry-panel">
      <div className="ved-card ved-ai-card ved-supplier-search-card">
        <button
          type="button"
          className="ved-collapsible-header"
          onClick={() => setSearchFormExpanded((v) => !v)}
          aria-expanded={searchFormExpanded}
        >
          <h2 style={{ margin: 0 }}>🔍 Режим пошуку постачальника</h2>
          <span className="ved-collapsible-toggle">{searchFormExpanded ? '▼' : '▶'}</span>
        </button>

        {searchFormExpanded && (
          <>
        <p className="ved-ai-disclaimer">
          Реєстр постачальників наповнюється поступово: автоматично {registryMeta?.nextRunHint || 'щодня о 02:00 (Europe/Kyiv)'} та вручну за кнопкою нижче. ШІ шукає виробників по всьому світу, зокрема в Азії та Європі (різні мови), а в таблицю опис додає українською. Постачальники з РФ виключені. Дублікати не додаються — ураховуються постачальники з реєстру, на розгляді, активні та відхилені.
        </p>
        {registryMeta?.autoSearch && (
          <div className="ved-auto-search-info">
            <button
              type="button"
              className="ved-auto-search-info-toggle"
              onClick={() => setAutoSearchInfoExpanded((v) => !v)}
            >
              {autoSearchInfoExpanded ? '▼' : '▶'} Критерії автопошуку о 02:00
            </button>
            {autoSearchInfoExpanded && (
              <div className="ved-auto-search-info-body">
                <p>{registryMeta.autoSearch.description}</p>
                <p>
                  <strong>Наступної ночі:</strong> {registryMeta.autoSearch.nextEquipmentType}
                </p>
                <p>
                  <strong>Технічні вимоги (шаблон):</strong> {registryMeta.autoSearch.nextTechnicalRequirements}
                </p>
                <p>
                  <strong>Акцент пошуку:</strong> {registryMeta.autoSearch.nextExtraSearchHint}
                </p>
                <p className="ved-auto-search-rotation-title">Ротація типів (по одному на ніч):</p>
                <ul className="ved-auto-search-rotation">
                  {registryMeta.autoSearch.rotation?.map((row) => (
                    <li key={row.equipmentType}>
                      <strong>{row.label}</strong> — {row.technicalRequirements}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {!meta?.aiEnabled && !aiConfig?.enabled ? (
          <p className="ved-ai-error">
            ШІ не налаштовано на сервері. Додайте OPENAI_API_KEY на Render і перезапустіть backend.
          </p>
        ) : (
          <>
            {aiConfig && (
              <p className="ved-ai-meta">
                {aiConfig.hasWebSearch ? '✓ Веб-пошук (SerpApi, Азія + Європа)' : '⚠ Без веб-пошуку — лише LLM'}
                {' · '}
                Залишилось сьогодні: {aiConfig.remainingToday} / {aiConfig.dailyLimit}
                {registryMeta && (
                  <>
                    {' · '}
                    У реєстрі: {registryMeta.workflowCounts?.registry ?? registryMeta.total}
                    {registryMeta.workflowCounts && (
                      <>
                        {' · '}
                        на розгляді: {registryMeta.workflowCounts.review || 0}
                        {' · '}
                        активні: {registryMeta.workflowCounts.active || 0}
                        {' · '}
                        відхилені: {registryMeta.workflowCounts.rejected || 0}
                      </>
                    )}
                    {registryMeta.lastScheduledRunAt && (
                      <>
                        {' · '}
                        Останнє авто: {formatDt(registryMeta.lastScheduledRunAt)}
                        {registryMeta.lastScheduledAdded > 0 && ` (+${registryMeta.lastScheduledAdded})`}
                      </>
                    )}
                  </>
                )}
              </p>
            )}

            <form className="ved-new-form ved-registry-search-form" onSubmit={runStandaloneSearch}>
              <div className="ved-registry-form-grid">
                <div className="ved-form-row ved-form-row-wide">
                  <label>Тип обладнання * (можна кілька)</label>
                  <div className="ved-equipment-type-grid">
                    {Object.entries(equipmentTypesMap).map(([k, v]) => {
                      const checked = (searchForm.equipmentTypes || []).includes(k);
                      return (
                        <label key={k} className={`ved-equipment-type-chip ${checked ? 'checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSearchEquipmentType(k)}
                          />
                          <span>{v}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="ved-form-row">
                  <label>Найменування / модель</label>
                  <input
                    value={searchForm.equipmentName}
                    onChange={(e) => setSearchForm((f) => ({ ...f, equipmentName: e.target.value }))}
                    placeholder="Напр. Perkins 50 kVA silent"
                  />
                </div>
                <div className="ved-form-row ved-form-row-wide">
                  <label>Технічні вимоги</label>
                  <textarea
                    value={searchForm.technicalRequirements}
                    onChange={(e) => setSearchForm((f) => ({ ...f, technicalRequirements: e.target.value }))}
                    placeholder="кВт, напруга, бренд, країна постачальника… (необов’язково — можна лише тип обладнання)"
                    rows={2}
                  />
                </div>
                <div className="ved-form-row">
                  <label>Кількість</label>
                  <input
                    type="number"
                    min={1}
                    value={searchForm.quantity}
                    onChange={(e) => setSearchForm((f) => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
                <div className="ved-form-row">
                  <label>Додатковий акцент</label>
                  <input
                    value={searchForm.extraSearchHint}
                    onChange={(e) => setSearchForm((f) => ({ ...f, extraSearchHint: e.target.value }))}
                    placeholder="Напр. Азія, Європа, Німеччина, Японія, OEM, CE"
                  />
                </div>
              </div>
              <div className="ved-actions">
                <button
                  type="submit"
                  className="ved-btn ved-btn-primary"
                  disabled={aiRunning || aiConfig?.remainingToday === 0}
                >
                  {aiRunning ? 'Пошук… (до 1–2 хв)' : '🔍 Пошук вручну'}
                </button>
              </div>
            </form>

            {lastSearchResult && (
              <p className="ved-registry-search-result">
                Останній пошук
                {lastSearchResult.equipmentTypes?.length
                  ? ` (${lastSearchResult.equipmentTypes.map((t) => equipmentLabel(t)).join(', ')})`
                  : ''}
                : знайдено {lastSearchResult.candidatesFound ?? 0}, додано в таблицю{' '}
                {lastSearchResult.added?.length ?? 0}, пропущено дублікатів {lastSearchResult.skipped ?? 0}.
              </p>
            )}
          </>
        )}
          </>
        )}
      </div>

      {renderSupplierRegistryTableCard('supplier-search')}
    </div>
  );

const PRODUCT_ORDER_PRICE_FIELDS = new Set(['minSalePrice', 'priceList', 'unitPrice']);

function formatProductOrderPrice(value) {
  const s = String(value ?? '').trim();
  if (!s) return '—';
  if (/[€$]/.test(s)) return s.replace(/(\d),(\d{3})/g, '$1 $2');
  const n = Number(s);
  if (Number.isFinite(n)) {
    return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(Math.round(n));
  }
  return s;
}

function formatCellValue(row, key) {
  const displayKey = `${key}Display`;
  if (row[displayKey]) return row[displayKey];
  const v = row[key];
  if (v == null || v === '') return '—';
  if (PRODUCT_ORDER_PRICE_FIELDS.has(key)) return formatProductOrderPrice(v);
  if (typeof v === 'number') return v;
  return String(v);
}

  const showAllProductOrders = () => {
    setProductOrderStatusFilter('');
    loadProductOrders({ status: '' });
  };

  const showActiveProductOrders = () => {
    setProductOrderStatusFilter(PRODUCT_ORDER_DEFAULT_STATUS);
    loadProductOrders({ status: PRODUCT_ORDER_DEFAULT_STATUS });
  };

  const productOrderStatusOptions = useMemo(() => {
    const fromMeta = productOrderMeta?.sheets?.[productOrderSheet]?.orderStatuses;
    const base = Array.isArray(fromMeta)
      ? [...fromMeta]
      : [
          ...new Set(
            productOrders.map((row) => String(row.orderStatus || '').trim()).filter(Boolean)
          ),
        ];
    const current = String(productOrderStatusFilter || '').trim();
    if (current && !base.includes(current)) base.push(current);
    return base.sort((a, b) => a.localeCompare(b, 'uk'));
  }, [productOrderMeta, productOrderSheet, productOrders, productOrderStatusFilter]);

  const renderProductOrders = () => {
    const sheetMeta = productOrderMeta?.sheets?.[productOrderSheet];
    const columns = sheetMeta?.columns || {};
    const columnKeys = Object.keys(columns);
    const statusFilterActive = Boolean(productOrderStatusFilter.trim());

    return (
      <div className="ved-list-panel ved-product-orders-panel">
        <div className="ved-card">
          <div className="ved-product-orders-header">
            <div>
              <h2 style={{ margin: '0 0 6px' }}>Замовлення товарів</h2>
              <p className="ved-product-orders-subtitle">
                Дані з Excel «ЗАКАЗ ТОВАРОВ !!!.xlsx» (синхронізація агентом 1С після імпорту ведомості).
                {productOrderMeta?.lastImport?.at && (
                  <>
                    {' '}
                    Останній імпорт: {formatDt(productOrderMeta.lastImport.at)}
                    {productOrderMeta.lastImport.fileName ? ` · ${productOrderMeta.lastImport.fileName}` : ''}
                    {productOrderMeta.lastImport.dguRows != null
                      ? ` · ДГУ: ${productOrderMeta.lastImport.dguRows}, ЗИП: ${productOrderMeta.lastImport.zipRows}`
                      : ''}
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              className="ved-btn"
              disabled={productOrderLoading}
              onClick={() => {
                loadProductOrderMeta();
                loadProductOrders();
              }}
            >
              {productOrderLoading ? '…' : '↻ Оновити'}
            </button>
          </div>

          <div className="ved-product-orders-tabs">
            <button
              type="button"
              className={`ved-product-orders-tab ${productOrderSheet === 'dgu' ? 'active' : ''}`}
              onClick={() => setProductOrderSheet('dgu')}
            >
              ДГУ (генератори)
              {productOrderMeta?.sheets?.dgu?.rowCount != null && (
                <span className="ved-sidebar-tab-count">{productOrderMeta.sheets.dgu.rowCount}</span>
              )}
            </button>
            <button
              type="button"
              className={`ved-product-orders-tab ${productOrderSheet === 'zip' ? 'active' : ''}`}
              onClick={() => setProductOrderSheet('zip')}
            >
              ЗИП (запчастини)
              {productOrderMeta?.sheets?.zip?.rowCount != null && (
                <span className="ved-sidebar-tab-count">{productOrderMeta.sheets.zip.rowCount}</span>
              )}
            </button>
          </div>

          <div className="ved-product-orders-filters">
            <input
              type="search"
              placeholder="Пошук (товар, постачальник, замовник, примітки…)"
              value={productOrderSearch}
              onChange={(e) => setProductOrderSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadProductOrders()}
            />
            <label className="ved-product-orders-status-filter">
              Статус:
              <select
                value={productOrderStatusFilter}
                onChange={(e) => setProductOrderStatusFilter(e.target.value)}
              >
                <option value="">Усі статуси</option>
                {productOrderStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="text"
              placeholder="Постачальник"
              value={productOrderSupplierFilter}
              onChange={(e) => setProductOrderSupplierFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadProductOrders()}
            />
            <button type="button" className="ved-btn ved-btn-secondary" onClick={() => loadProductOrders()}>
              Застосувати
            </button>
            {statusFilterActive ? (
              <button type="button" className="ved-btn ved-btn-secondary" onClick={showAllProductOrders}>
                Показати все
              </button>
            ) : (
              <button type="button" className="ved-btn ved-btn-secondary" onClick={showActiveProductOrders}>
                Лише активні
              </button>
            )}
          </div>

          <p className="ved-product-orders-count">
            Показано {productOrders.length} з {productOrderTotal} записів
            {statusFilterActive ? ` · фільтр статусу: «${productOrderStatusFilter}»` : ' · усі статуси'}
            {productOrderTotal > productOrders.length ? ' (перші 500 — уточніть пошук)' : ''}
          </p>
        </div>

        {productOrderLoading ? (
          <div className="ved-loading">Завантаження…</div>
        ) : productOrders.length === 0 ? (
          <div className="ved-empty">
            Немає даних для вкладки «{productOrderSheet === 'dgu' ? 'ДГУ' : 'ЗИП'}».
            {productOrderMeta?.lastImport ? '' : ' Дочекайтеся синхронізації агентом 1С.'}
          </div>
        ) : (
          <div className="ved-product-orders-table-wrap">
            <table className="ved-table ved-product-orders-table">
              <thead>
                <tr>
                  <th>#</th>
                  {columnKeys.map((key) => (
                    <th key={key}>{columns[key]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productOrders.map((row) => (
                  <tr key={row._id || row.rowIndex}>
                    <td>{row.rowIndex}</td>
                    {columnKeys.map((key) => (
                      <td key={key} className="ved-product-order-cell">
                        {formatCellValue(row, key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderNewForm = () => (
    <div className="ved-list-panel">
      <form className="ved-new-form" onSubmit={submitNewRequest}>
        <h2 style={{ marginTop: 0 }}>Нова заявка на імпорт</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Заявка надходить до відділу ВЕД для підбору зарубіжного постачальника.
        </p>
        <div className="ved-form-row">
          <label>Тип обладнання *</label>
          <select
            value={newForm.equipmentType}
            onChange={(e) => setNewForm((f) => ({ ...f, equipmentType: e.target.value }))}
          >
            {Object.entries(equipmentTypesMap).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="ved-form-row">
          <label>Найменування / модель</label>
          <input
            value={newForm.equipmentName}
            onChange={(e) => setNewForm((f) => ({ ...f, equipmentName: e.target.value }))}
            placeholder="Напр. Perkins 50 kVA silent"
          />
        </div>
        <div className="ved-form-row">
          <label>Технічні вимоги *</label>
          <textarea
            value={newForm.technicalRequirements}
            onChange={(e) => setNewForm((f) => ({ ...f, technicalRequirements: e.target.value }))}
            placeholder="кВт, напруга, автономія, бренд тощо"
            required
          />
        </div>
        <div className="ved-form-row">
          <label>Кількість</label>
          <input
            type="number"
            min={1}
            value={newForm.quantity}
            onChange={(e) => setNewForm((f) => ({ ...f, quantity: e.target.value }))}
          />
        </div>
        <div className="ved-form-row">
          <label>Бажаний термін поставки</label>
          <input
            value={newForm.desiredDeliveryDate}
            onChange={(e) => setNewForm((f) => ({ ...f, desiredDeliveryDate: e.target.value }))}
            placeholder="Напр. до 30.09.2026"
          />
        </div>
        <div className="ved-form-row">
          <label>Пріоритет</label>
          <select
            value={newForm.priority}
            onChange={(e) => setNewForm((f) => ({ ...f, priority: e.target.value }))}
          >
            {Object.entries(meta?.priorities || {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="ved-form-row">
          <label>Коментар</label>
          <textarea
            value={newForm.managerComment}
            onChange={(e) => setNewForm((f) => ({ ...f, managerComment: e.target.value }))}
          />
        </div>
        <div className="ved-actions">
          <button type="submit" className="ved-btn ved-btn-primary" disabled={saving}>
            Подати заявку
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="ved-dashboard">
      <div className="ved-dashboard-main">
        <aside className="ved-sidebar">
          <div className="ved-sidebar-inner">
            <div className="ved-sidebar-section-title">Відділ ВЕД</div>
            <button
              type="button"
              className={`ved-sidebar-tab ${section === 'active' ? 'active' : ''}`}
              onClick={() => {
                setSection('active');
                setSelectedId(null);
                setDetail(null);
              }}
            >
              📋 Активні заявки
            </button>
            <button
              type="button"
              className={`ved-sidebar-tab ${section === 'archive' ? 'active' : ''}`}
              onClick={() => {
                setSection('archive');
                setSelectedId(null);
                setDetail(null);
              }}
            >
              🗄️ Архів
            </button>
            {canCreate && (
              <button
                type="button"
                className={`ved-sidebar-tab ${section === 'new' ? 'active' : ''}`}
                onClick={() => {
                  setSection('new');
                  setSelectedId(null);
                  setDetail(null);
                }}
              >
                ➕ Нова заявка
              </button>
            )}
            {canManage && (
              <>
                <button
                  type="button"
                  className={`ved-sidebar-tab ${section === 'supplier-search' ? 'active' : ''}`}
                  onClick={() => {
                    setSection('supplier-search');
                    setSelectedId(null);
                    setDetail(null);
                    setAiSessionDetail(null);
                  }}
                >
                  🔍 Пошук постачальника
                  {registryMeta?.workflowCounts?.registry != null && (
                    <span className="ved-sidebar-tab-count">{registryMeta.workflowCounts.registry}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`ved-sidebar-tab ${section === 'suppliers-active' ? 'active' : ''}`}
                  onClick={() => {
                    setSection('suppliers-active');
                    setSelectedId(null);
                    setDetail(null);
                    setAiSessionDetail(null);
                  }}
                >
                  ✅ Активні постачальники
                  {registryMeta?.workflowCounts?.active != null && (
                    <span className="ved-sidebar-tab-count">{registryMeta.workflowCounts.active}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`ved-sidebar-tab ${section === 'suppliers-review' ? 'active' : ''}`}
                  onClick={() => {
                    setSection('suppliers-review');
                    setSelectedId(null);
                    setDetail(null);
                    setAiSessionDetail(null);
                  }}
                >
                  🕐 Постачальники на розгляді
                  {registryMeta?.workflowCounts?.review != null && (
                    <span className="ved-sidebar-tab-count">{registryMeta.workflowCounts.review}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`ved-sidebar-tab ${section === 'suppliers-rejected' ? 'active' : ''}`}
                  onClick={() => {
                    setSection('suppliers-rejected');
                    setSelectedId(null);
                    setDetail(null);
                    setAiSessionDetail(null);
                  }}
                >
                  ✕ Відхилені постачальники
                  {registryMeta?.workflowCounts?.rejected != null && (
                    <span className="ved-sidebar-tab-count">{registryMeta.workflowCounts.rejected}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`ved-sidebar-tab ${section === 'product-orders' ? 'active' : ''}`}
                  onClick={() => {
                    setSection('product-orders');
                    setSelectedId(null);
                    setDetail(null);
                    setAiSessionDetail(null);
                  }}
                >
                  📦 Замовлення товарів
                  {productOrderMeta?.sheets?.dgu?.rowCount != null && (
                    <span className="ved-sidebar-tab-count">
                      {(productOrderMeta.sheets.dgu.rowCount || 0) + (productOrderMeta.sheets.zip?.rowCount || 0)}
                    </span>
                  )}
                </button>
              </>
            )}
            <button
              type="button"
              className={`ved-sidebar-tab ${section === 'notifications' ? 'active' : ''}`}
              onClick={() => {
                setSection('notifications');
                setSelectedId(null);
                setDetail(null);
              }}
            >
              🔔 Сповіщення
            </button>
          </div>
        </aside>

        <div className="ved-content">
          {section === 'detail' && renderDetail()}
          {section === 'new' && renderNewForm()}
          {section === 'supplier-search' && renderSupplierSearch()}
          {section === 'suppliers-active' && renderSupplierWorkflowSection('suppliers-active')}
          {section === 'suppliers-review' && renderSupplierWorkflowSection('suppliers-review')}
          {section === 'suppliers-rejected' && renderSupplierWorkflowSection('suppliers-rejected')}
          {section === 'product-orders' && canManage && renderProductOrders()}
          {section === 'notifications' && (
            <div className="ved-notifications-wrap">
              <ManagerNotificationsTab
                vedOnly
                title="Сповіщення ВЕД"
                description="Нові заявки та зміни статусів по імпортним заявкам."
                onOpenVedRequest={(id) => openRequest(id)}
              />
            </div>
          )}
          {(section === 'active' || section === 'archive') && renderList()}
        </div>
      </div>
    </div>
  );
}

export default VedDashboard;
