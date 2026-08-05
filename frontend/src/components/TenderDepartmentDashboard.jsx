import React, { useState } from 'react';
import TenderSearchTab from './tender/TenderSearchTab';
import TenderWatchlistTab from './tender/TenderWatchlistTab';
import './tender/TenderDepartment.css';

function TenderDepartmentDashboard({ user }) {
  const [tab, setTab] = useState('search');
  const [watchlistKey, setWatchlistKey] = useState(0);

  return (
    <div className="tender-dashboard">
      <div className="tender-dashboard-inner">
        <header className="tender-hero">
          <h1>Тендерний відділ</h1>
          <p>
            Пошук актуальних закупівель на Prozorro за профілем компанії: дизель-генератори, сервіс, монтаж, ДБЖ/UPS.
            Аналіз бюджету, дедлайну, регіону та конкурентоспроможності — з передачею менеджерам для реалізації.
          </p>
          <span className="tender-hero-badge">Prozorro · ДГ · Сервіс · Монтаж · ДБЖ</span>
        </header>

        <nav className="tender-tabs">
          <button
            type="button"
            className={`tender-tab-btn ${tab === 'search' ? 'active' : ''}`}
            onClick={() => setTab('search')}
          >
            🔍 Пошук Prozorro
          </button>
          <button
            type="button"
            className={`tender-tab-btn ${tab === 'watchlist' ? 'active' : ''}`}
            onClick={() => setTab('watchlist')}
          >
            📋 Робочий список
          </button>
        </nav>

        <div className="tender-content-panel">
          {tab === 'search' ? (
            <TenderSearchTab
              onSaved={() => {
                setWatchlistKey((k) => k + 1);
              }}
            />
          ) : (
            <TenderWatchlistTab key={watchlistKey} user={user} />
          )}
        </div>
      </div>
    </div>
  );
}

export default TenderDepartmentDashboard;
