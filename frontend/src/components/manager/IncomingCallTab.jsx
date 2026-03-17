import React, { useState, useEffect, useRef } from 'react';
import { searchClients } from '../../utils/clientsAPI';
import ClientCardModal from './ClientCardModal';
import './ManagerTabs.css';

const DEBOUNCE_MS = 400;

function IncomingCallTab({ user }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedClientFromSearch, setSelectedClientFromSearch] = useState(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchClients(searchQuery.trim());
        if (requestIdRef.current === id) {
          setResults(Array.isArray(data) ? data : data.results || []);
        }
      } catch (err) {
        if (requestIdRef.current === id) {
          console.error(err);
          setResults([]);
        }
      } finally {
        if (requestIdRef.current === id) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const handleOpenCard = (clientOrId) => {
    const id = typeof clientOrId === 'object' ? clientOrId._id : clientOrId;
    const fromSearch = typeof clientOrId === 'object' ? clientOrId : null;
    setSelectedClientId(id);
    setSelectedClientFromSearch(fromSearch);
    setShowCardModal(true);
  };

  return (
    <div className="manager-tab-content manager-crm-tab incoming-call-tab">
      <div className="manager-header" style={{ flexShrink: 0 }}>
        <h2>📞 Перевірка клієнта</h2>
        <p className="tab-description">
          Введіть номер телефону або назву клієнта. Якщо клієнт закріплений за іншим менеджером — показуватиметься лише базова інформація для перенаправлення.
        </p>
      </div>

      <div className="incoming-call-search">
        <input
          type="text"
          className="search-input large"
          placeholder="Номер телефону, назва компанії або ЄДРПОУ..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="search-results">
        {loading ? (
          <div className="loading-indicator">Пошук...</div>
        ) : results.length === 0 && searchQuery.trim() ? (
          <div className="no-history">Нічого не знайдено</div>
        ) : results.length > 0 ? (
          <div className="results-list">
            {results.map(r => (
              <div
                key={r._id}
                className={`result-card ${r.limited ? 'limited' : ''}`}
                onClick={() => handleOpenCard(r)}
              >
                <div className="result-main">
                  <span className="result-name">{r.name || '—'}</span>
                  {r.limited && (
                    <span className="limited-badge">Закріплений за іншим менеджером</span>
                  )}
                </div>
                {r.edrpou && (
                  <div className="result-edrpou">ЄДРПОУ: {r.edrpou}</div>
                )}
                {r.contactPhone && (
                  <div className="result-phone">📞 {r.contactPhone}</div>
                )}
                {(r.assignedManagerName || r.assignedManagerLogin) && r.limited && (
                  <div className="result-manager">Менеджер: {r.assignedManagerName || r.assignedManagerLogin}</div>
                )}
                <button className="btn-small" onClick={(e) => { e.stopPropagation(); handleOpenCard(r); }}>
                  Переглянути
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <ClientCardModal
        open={showCardModal}
        onClose={() => { setShowCardModal(false); setSelectedClientId(null); setSelectedClientFromSearch(null); }}
        clientId={selectedClientId}
        initialClientFromSearch={selectedClientFromSearch}
      />
    </div>
  );
}

export default IncomingCallTab;
