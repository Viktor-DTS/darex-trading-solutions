import React, { useState, useEffect } from 'react';
import {
  getMarketingLeads,
  getMarketingLeadsMeta,
  getMarketingLead,
  updateMarketingLead,
} from '../../utils/marketingLeadsAPI';
import { findMyClientByPhone } from '../../utils/clientsAPI';
import ClientFormModal from './ClientFormModal';
import SaleFormModal from './SaleFormModal';
import '../marketing/MarketingLeads.css';
import MarketingLeadAttribution from '../marketing/MarketingLeadAttribution';
import MarketingLeadRejectModal from '../marketing/MarketingLeadRejectModal';

function buildLeadNotes(lead) {
  const parts = [];
  if (lead?.comment) parts.push(lead.comment);
  if (lead?.productInterest) parts.push(`Інтерес: ${lead.productInterest}`);
  if (lead?.marketingNotes) parts.push(`Маркетинг: ${lead.marketingNotes}`);
  if (lead?.requestNumber) parts.push(`Заявка ${lead.requestNumber}`);
  if (lead?.source) parts.push(`Джерело: ${lead.source}`);
  return parts.filter(Boolean).join('\n');
}

function leadToClientInitialForm(lead, user) {
  return {
    name: lead?.clientName || '',
    address: lead?.city || '',
    contacts: [{
      id: '1',
      person: lead?.clientName || '',
      phone: lead?.contactPhone || '',
    }],
    email: lead?.contactEmail || '',
    notes: buildLeadNotes(lead),
    assignedManagerLogin: user?.login || '',
    region: user?.region || '',
  };
}

function ExternalAdRequestsTab({ user }) {
  const [leads, setLeads] = useState([]);
  const [meta, setMeta] = useState({ sources: {}, statuses: {} });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [managerNotes, setManagerNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [clientInitialForm, setClientInitialForm] = useState(null);
  const [saleInitialClient, setSaleInitialClient] = useState(null);
  const [saleInitialNotes, setSaleInitialNotes] = useState('');
  const [pendingLead, setPendingLead] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, m] = await Promise.all([
        getMarketingLeads({ scope: 'manager' }),
        getMarketingLeadsMeta(),
      ]);
      setLeads(Array.isArray(list) ? list : []);
      setMeta(m);
    } catch (e) {
      console.error(e);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setManagerNotes('');
      return;
    }
    getMarketingLead(selectedId)
      .then((lead) => {
        setSelected(lead);
        setManagerNotes(lead.managerNotes || '');
      })
      .catch(() => setSelected(null));
  }, [selectedId]);

  const openClientOrDealWorkflow = async (lead) => {
    setPendingLead(lead);
    const notes = buildLeadNotes(lead);
    const phone = lead?.contactPhone;

    if (phone) {
      const existingClient = await findMyClientByPhone(phone);
      if (existingClient) {
        setSaleInitialClient(existingClient);
        setSaleInitialNotes(notes);
        setShowSaleModal(true);
        return;
      }
    }

    setClientInitialForm(leadToClientInitialForm(lead, user));
    setShowClientModal(true);
  };

  const handleTakeWork = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const fresh = await updateMarketingLead(selected._id, { status: 'in_progress' });
      await load();
      setSelected(fresh);
      await openClientOrDealWorkflow(fresh);
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const handleClientCreated = (newClient) => {
    setShowClientModal(false);
    setClientInitialForm(null);
    if (newClient?._id) {
      setSaleInitialClient(newClient);
      setSaleInitialNotes(buildLeadNotes(pendingLead));
      setShowSaleModal(true);
    }
  };

  const closeClientModal = () => {
    setShowClientModal(false);
    setClientInitialForm(null);
  };

  const closeSaleModal = () => {
    setShowSaleModal(false);
    setSaleInitialClient(null);
    setSaleInitialNotes('');
    setPendingLead(null);
  };

  const handleReject = async (reason) => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateMarketingLead(selected._id, {
        status: 'rejected',
        rejectionReason: reason,
        statusNote: reason,
      });
      setShowRejectModal(false);
      setSelectedId(null);
      load();
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateMarketingLead(selected._id, { managerNotes });
      setSelected(updated);
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const handleConverted = async () => {
    if (!selected) return;
    if (!window.confirm('Позначити заявку як конвертовану (клієнт у роботі / угода)?')) return;
    setSaving(true);
    try {
      await updateMarketingLead(selected._id, { status: 'converted', statusNote: 'Конвертовано менеджером' });
      setSelectedId(null);
      load();
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const managerWorkStatusClass = (lead) => {
    if (lead?.status === 'transmitted') return 'waiting';
    if (lead?.status === 'in_progress') return 'in_progress';
    if (lead?.status === 'rejected') return 'rejected';
    if (lead?.status === 'converted') return 'converted';
    return 'none';
  };

  const formatDate = (d) => (d ? new Date(d).toLocaleString('uk-UA') : '—');

  return (
    <div className="marketing-leads-tab">
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 8px', color: '#1a1a2e' }}>Запити з зовнішньої реклами</h2>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          Заявки, передані маркетинговим відділом. Візьміть у роботу — система знайде вашого клієнта за телефоном
          або відкриє форму нового клієнта з даними з заявки.
        </p>
      </div>

      <div className="marketing-toolbar" style={{ marginBottom: 12 }}>
        <button type="button" className="marketing-btn marketing-btn-secondary" onClick={load}>
          Оновити
        </button>
      </div>

      <div className="marketing-leads-layout">
        <div className="marketing-leads-list-wrap" style={{ border: '1px solid #ddd', maxHeight: '65vh' }}>
          {loading ? (
            <div className="marketing-loading" style={{ color: '#666' }}>Завантаження...</div>
          ) : leads.length === 0 ? (
            <div className="marketing-empty" style={{ color: '#888' }}>
              Немає переданих заявок
            </div>
          ) : (
            <table className="marketing-table" style={{ color: '#333' }}>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Дата</th>
                  <th>Джерело</th>
                  <th>Клієнт</th>
                  <th>Телефон</th>
                  <th>Статус роботи</th>
                  <th>Коментар</th>
                  <th>Кому належить клієнт</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l._id}
                    className={selectedId === l._id ? 'selected' : ''}
                    onClick={() => setSelectedId(l._id)}
                    style={{ background: selectedId === l._id ? 'rgba(33,150,243,0.08)' : undefined }}
                  >
                    <td>{l.requestNumber || '—'}</td>
                    <td>{formatDate(l.transmittedToManagerAt || l.createdAt)}</td>
                    <td>{meta.sources?.[l.source] || l.source}</td>
                    <td>{l.clientName || '—'}</td>
                    <td>{l.contactPhone || '—'}</td>
                    <td>
                      <span className={`marketing-work-status marketing-work-status--${managerWorkStatusClass(l)}`}>
                        {l.managerWorkStatusLabel || meta.statuses?.[l.status] || l.status}
                      </span>
                    </td>
                    <td className="marketing-table-comment">{l.managerWorkComment || '—'}</td>
                    <td>{l.clientOwnerName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <aside
            className="card-vip"
            style={{
              border: '1px solid #ddd',
              background: '#fafafa',
              color: '#333',
            }}
          >
            <h3 style={{ color: '#1a1a2e' }}>{selected.requestNumber}</h3>
            <p><strong>Статус роботи:</strong> {selected.managerWorkStatusLabel || meta.statuses?.[selected.status] || selected.status}</p>
            <p><strong>Клієнт:</strong> {selected.clientName || '—'}</p>
            <p><strong>Тел:</strong> {selected.contactPhone || '—'}</p>
            <p><strong>Email:</strong> {selected.contactEmail || '—'}</p>
            <p><strong>Місто:</strong> {selected.city || '—'}</p>
            <p><strong>Інтерес:</strong> {selected.productInterest || '—'}</p>
            <p><strong>Кому належить клієнт:</strong> {selected.clientOwnerName || '—'}</p>
            <p><strong>Коментар роботи:</strong> {selected.managerWorkComment || '—'}</p>
            <p><strong>Коментар:</strong> {selected.comment || '—'}</p>
            {selected.marketingNotes && (
              <p><strong>Нотатки маркетингу:</strong> {selected.marketingNotes}</p>
            )}
            <MarketingLeadAttribution lead={selected} user={user} />
            <label style={{ display: 'block', marginTop: 12, fontSize: 13 }}>
              Нотатки менеджера
              <textarea
                className="marketing-input"
                rows={3}
                value={managerNotes}
                onChange={(e) => setManagerNotes(e.target.value)}
                style={{ width: '100%', marginTop: 4, boxSizing: 'border-box', background: '#fff', color: '#333' }}
              />
            </label>
            <div className="marketing-detail-actions" style={{ marginTop: 12 }}>
              {selected.status === 'transmitted' && (
                <button type="button" className="marketing-btn marketing-btn-primary" disabled={saving} onClick={handleTakeWork}>
                  Взяти в роботу
                </button>
              )}
              {(selected.status === 'transmitted' || selected.status === 'in_progress') && (
                <button type="button" className="marketing-btn marketing-btn-ghost" disabled={saving} onClick={() => setShowRejectModal(true)}>
                  Відхилити
                </button>
              )}
              <button type="button" className="marketing-btn marketing-btn-secondary" disabled={saving} onClick={handleSaveNotes}>
                Зберегти нотатки
              </button>
              {selected.status === 'in_progress' && (
                <button type="button" className="marketing-btn marketing-btn-ghost" disabled={saving} onClick={handleConverted}>
                  Конвертовано
                </button>
              )}
            </div>
          </aside>
        )}
      </div>

      <MarketingLeadRejectModal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={handleReject}
        saving={saving}
      />

      <ClientFormModal
        open={showClientModal}
        onClose={closeClientModal}
        onSuccess={handleClientCreated}
        initialForm={clientInitialForm}
        user={user}
      />

      <SaleFormModal
        open={showSaleModal}
        onClose={closeSaleModal}
        initialClient={saleInitialClient}
        initialNotes={saleInitialNotes}
        user={user}
      />
    </div>
  );
}

export default ExternalAdRequestsTab;
