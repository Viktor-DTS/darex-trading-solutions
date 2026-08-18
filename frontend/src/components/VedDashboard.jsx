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

function formatRegistryCategories(row, equipmentTypesMap) {
  const labels =
    Array.isArray(row.categoryLabels) && row.categoryLabels.length
      ? row.categoryLabels
      : (Array.isArray(row.equipmentTypes) && row.equipmentTypes.length
          ? row.equipmentTypes
          : String(row.equipmentType || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        ).map((t) => equipmentTypesMap[t] || t);
  return labels.filter(Boolean);
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
  const [searchForm, setSearchForm] = useState({
    equipmentTypes: ['generator_diesel'],
    equipmentName: '',
    technicalRequirements: '',
    quantity: 1,
    extraSearchHint: '',
  });

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
    setRegistryLoading(true);
    try {
      const qs = registryFilterType ? `?equipmentType=${encodeURIComponent(registryFilterType)}` : '';
      const res = await fetch(`${API_BASE_URL}/ved/supplier-registry${qs}`, { headers: authHeaders });
      if (tryHandleUnauthorizedResponse(res)) return;
      if (res.ok) setSupplierRegistry(await res.json());
      else setSupplierRegistry([]);
    } catch {
      setSupplierRegistry([]);
    } finally {
      setRegistryLoading(false);
    }
  }, [authHeaders, canManage, registryFilterType]);

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
    if (section === 'supplier-search' && canManage) {
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
    if (section === 'new' || section === 'notifications' || section === 'supplier-search') {
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
                {aiConfig.hasWebSearch ? '✓ Веб-пошук (SerpApi)' : '⚠ Без веб-пошуку — лише LLM'}
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
          Реєстр постачальників наповнюється поступово: автоматично {registryMeta?.nextRunHint || 'щодня о 02:00 (Europe/Kyiv)'} та вручну за кнопкою нижче. Дублікати постачальників не додаються.
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
                {aiConfig.hasWebSearch ? '✓ Веб-пошук (SerpApi)' : '⚠ Без веб-пошуку — лише LLM'}
                {' · '}
                Залишилось сьогодні: {aiConfig.remainingToday} / {aiConfig.dailyLimit}
                {registryMeta && (
                  <>
                    {' · '}
                    У реєстрі: {registryMeta.total}
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
                    placeholder="Напр. Китай, OEM, CE"
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

      <div className="ved-card ved-registry-table-card">
        <div className="ved-registry-table-toolbar">
          <button
            type="button"
            className="ved-collapsible-header ved-collapsible-header-inline"
            onClick={() => setRegistryExpanded((v) => !v)}
            aria-expanded={registryExpanded}
          >
            <h3 style={{ margin: 0 }}>Реєстр постачальників</h3>
            <span className="ved-collapsible-toggle">{registryExpanded ? '▼' : '▶'}</span>
          </button>
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
          </div>
        </div>

        {registryExpanded && (
          <>
        {registryLoading && supplierRegistry.length === 0 ? (
          <div className="ved-loading">Завантаження реєстру…</div>
        ) : supplierRegistry.length === 0 ? (
          <div className="ved-empty">
            Реєстр порожній. Запустіть ручний пошук або дочекайтеся автоматичного оновлення о 02:00.
          </div>
        ) : (
          <div className="ved-registry-table-wrap">
            <table className="ved-table ved-registry-table">
              <thead>
                <tr>
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
                </tr>
              </thead>
              <tbody>
                {supplierRegistry.map((row) => {
                  const site = formatWebsite(row.website);
                  const categories = formatRegistryCategories(row, equipmentTypesMap);
                  return (
                    <tr key={row._id}>
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
    </div>
  );

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
              </button>
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
          <header className="ved-hero">
            <h1>Відділ зовнішньоекономічної діяльності</h1>
            <p>
              Заявки менеджерів на імпорт обладнання (генератори, інвертори, LiFePO4). Спеціаліст ВЕД підбирає
              постачальників і порівнює пропозиції з обов’язковими полями Incoterms, валюта, MOQ, lead time, % передоплати.
            </p>
          </header>

          {section === 'detail' && renderDetail()}
          {section === 'new' && renderNewForm()}
          {section === 'supplier-search' && renderSupplierSearch()}
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
