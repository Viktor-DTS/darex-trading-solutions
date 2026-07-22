import React, { useState } from 'react';
import MarketingLeadsTab from './marketing/MarketingLeadsTab';
import './MarketingDashboard.css';

const INTEGRATIONS = [
  {
    id: 'inbound-api',
    title: 'Універсальний API прийому',
    status: 'ready',
    description: 'POST /api/marketing/leads/inbound з заголовком X-Marketing-Api-Key. Підтримує UTM, Meta IDs, landing page.',
  },
  {
    id: 'website',
    title: 'Сайт Energy Star / landing',
    status: 'ready',
    description: 'Форми сайту можуть надсилати ліди в DTS через inbound API. Автоматично: джерело, UTM, продукт, коментар.',
  },
  {
    id: 'facebook',
    title: 'Facebook / Meta Lead Ads',
    status: 'planned',
    description: 'Webhook Meta Leadgen + збереження metaLeadId, metaFormId, metaCampaignId для атрибуції кампаній.',
  },
  {
    id: 'google',
    title: 'Google Ads Lead Form',
    status: 'planned',
    description: 'Webhook або офлайн-імпорт з gclid / utm для зв’язку з рекламними кампаніями.',
  },
  {
    id: 'telegram',
    title: 'Telegram / Viber боти',
    status: 'planned',
    description: 'Боти з короткою формою заявки → inbound API з source=telegram|viber.',
  },
  {
    id: 'duplicate',
    title: 'Дедуплікація за телефоном',
    status: 'planned',
    description: 'Попередження при повторному ліді з того ж номера протягом N днів.',
  },
];

function MarketingIntegrationsTab() {
  return (
    <div>
      <p style={{ margin: '0 0 16px', color: 'rgba(244,244,245,0.7)', lineHeight: 1.6 }}>
        Архітектура підготовлена до підключення зовнішніх джерел. Маркетинг аналізує вхідні заявки,
        призначає менеджера та передає в CRM через вкладку «Запити з зовнішньої реклами».
      </p>
      <div className="marketing-integrations-grid">
        {INTEGRATIONS.map((item) => (
          <div key={item.id} className="marketing-integration-card">
            <h4>{item.title}</h4>
            <p>{item.description}</p>
            <span className={`marketing-integration-status marketing-integration-status--${item.status}`}>
              {item.status === 'ready' ? 'Готово' : 'Заплановано'}
            </span>
          </div>
        ))}
      </div>
      <div className="marketing-api-hint">
        POST /api/marketing/leads/inbound<br />
        Header: X-Marketing-Api-Key: &lt;MARKETING_INBOUND_API_KEY&gt;<br />
        Body: clientName, contactPhone, source, utmSource, utmCampaign, metaCampaignId, productInterest, comment
      </div>
      <ul className="marketing-roadmap-list">
        <li>Автоматичне правило маршрутизації за регіоном / продуктом</li>
        <li>SLA-таймер: «новий» → «на розгляді» → «передано»</li>
        <li>Зв’язок ліда з угодою CRM після конвертації</li>
        <li>Дашборд ROI по UTM / кампаніях Meta та Google</li>
        <li>Email-сповіщення маркетингу про нові inbound-ліди</li>
      </ul>
    </div>
  );
}

function MarketingDashboard({ user }) {
  const [tab, setTab] = useState('leads');

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
