import React, { useState, useEffect } from 'react';
import {
  getMarketingLeads,
  getMarketingLeadsMeta,
  getMarketingLead,
  updateMarketingLead,
} from '../../utils/marketingLeadsAPI';
import '../marketing/MarketingLeads.css';

function ExternalAdRequestsTab({ user }) {
  const [leads, setLeads] = useState([]);
  const [meta, setMeta] = useState({ sources: {}, statuses: {} });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [managerNotes, setManagerNotes] = useState('');
  const [saving, setSaving] = useState(false);

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

  const handleTakeWork = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateMarketingLead(selected._id, { status: 'in_progress' });
      await load();
      const fresh = await getMarketingLead(selected._id);
      setSelected(fresh);
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

  const formatDate = (d) => (d ? new Date(d).toLocaleString('uk-UA') : '—');

  return (
    <div className="marketing-leads-tab">
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 8px', color: '#1a1a2e' }}>Запити з зовнішньої реклами</h2>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          Заявки, передані маркетинговим відділом. Візьміть у роботу, додайте нотатки та позначте конвертацію.
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
                  <th>Статус</th>
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
                    <td>{meta.statuses?.[l.status] || l.status}</td>
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
            <p><strong>Клієнт:</strong> {selected.clientName || '—'}</p>
            <p><strong>Тел:</strong> {selected.contactPhone || '—'}</p>
            <p><strong>Email:</strong> {selected.contactEmail || '—'}</p>
            <p><strong>Місто:</strong> {selected.city || '—'}</p>
            <p><strong>Інтерес:</strong> {selected.productInterest || '—'}</p>
            <p><strong>Коментар:</strong> {selected.comment || '—'}</p>
            {selected.marketingNotes && (
              <p><strong>Нотатки маркетингу:</strong> {selected.marketingNotes}</p>
            )}
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
    </div>
  );
}

export default ExternalAdRequestsTab;
