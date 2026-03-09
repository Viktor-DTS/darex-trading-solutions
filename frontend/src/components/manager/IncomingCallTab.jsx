import React, { useState } from 'react';
import { searchClients } from '../../utils/clientsAPI';
import ClientCardModal from './ClientCardModal';
import './ManagerTabs.css';

function IncomingCallTab({ user }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [showCardModal, setShowCardModal] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const data = await searchClients(searchQuery.trim());
      setResults(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleOpenCard = (id) => {
    setSelectedClientId(id);
    setShowCardModal(true);
  };

  return (
    <div className="manager-tab-content manager-crm-tab incoming-call-tab">
      <div className="manager-header" style={{ flexShrink: 0 }}>
        <h2>📞 Вхідний дзвінок</h2>
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
          onKeyDown={handleKeyDown}
        />
        <button className="btn-primary" onClick={handleSearch} disabled={loading}>
          {loading ? 'Пошук...' : '🔍 Шукати'}
        </button>
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
                onClick={() => handleOpenCard(r._id)}
              >
                <div className="result-main">
                  <span className="result-name">{r.name || '—'}</span>
                  {r.limited && (
                    <span className="limited-badge">Закріплений за іншим менеджером</span>
                  )}
                </div>
                {r.contactPhone && (
                  <div className="result-phone">📞 {r.contactPhone}</div>
                )}
                {(r.assignedManagerName || r.assignedManagerLogin) && r.limited && (
                  <div className="result-manager">Менеджер: {r.assignedManagerName || r.assignedManagerLogin}</div>
                )}
                <button className="btn-small" onClick={(e) => { e.stopPropagation(); handleOpenCard(r._id); }}>
                  Переглянути
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <ClientCardModal
        open={showCardModal}
        onClose={() => { setShowCardModal(false); setSelectedClientId(null); }}
        clientId={selectedClientId}
      />
    </div>
  );
}

export default IncomingCallTab;
