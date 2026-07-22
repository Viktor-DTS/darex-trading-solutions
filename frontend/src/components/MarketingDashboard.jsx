import React, { useState } from 'react';
import MarketingLeadsTab from './marketing/MarketingLeadsTab';
import MarketingIntegrationsTab from './marketing/MarketingIntegrationsTab';
import './MarketingDashboard.css';

function MarketingDashboard({ user }) {  const [tab, setTab] = useState('leads');

  return (
    <div className="marketing-dashboard">
      <div className="marketing-dashboard-inner">
        <header className="marketing-hero">
          <h1>Маркетинговий відділ</h1>
          <p>
            Центр обробки заявок з сайту, Meta/Facebook, Google Ads та інших каналів.
            Аналізуйте ліди, створюйте заявки вручну (телефон) та передавайте їх менеджерам у роботу.
          </p>
          <span className="marketing-hero-badge">VIP · Lead Hub</span>
        </header>

        <nav className="marketing-tabs">
          <button
            type="button"
            className={`marketing-tab-btn ${tab === 'leads' ? 'active' : ''}`}
            onClick={() => setTab('leads')}
          >
            Заявки та ліди
          </button>
          <button
            type="button"
            className={`marketing-tab-btn ${tab === 'integrations' ? 'active' : ''}`}
            onClick={() => setTab('integrations')}
          >
            Джерела та інтеграції
          </button>
        </nav>

        <div className="marketing-content-panel">
          {tab === 'leads' ? (
            <MarketingLeadsTab user={user} />
          ) : (
            <MarketingIntegrationsTab />
          )}
        </div>
      </div>
    </div>
  );
}

export default MarketingDashboard;
