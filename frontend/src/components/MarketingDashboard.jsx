import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import MarketingLeadsTab from './marketing/MarketingLeadsTab';
import MarketingIntegrationsTab from './marketing/MarketingIntegrationsTab';
import ManagerNotificationsTab from './manager/ManagerNotificationsTab';
import './MarketingDashboard.css';

function MarketingDashboard({ user }) {
  const [tab, setTab] = useState('leads');
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);

  const fetchMarketingNotificationsUnread = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/manager-notifications/unread-count?marketingFeed=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotificationsUnreadCount(typeof data.count === 'number' ? data.count : 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchMarketingNotificationsUnread();
    const id = setInterval(fetchMarketingNotificationsUnread, 60000);
    return () => clearInterval(id);
  }, [fetchMarketingNotificationsUnread]);

  useEffect(() => {
    const openNotifications = () => setTab('notifications');
    window.addEventListener('dts-open-notifications-tab', openNotifications);
    return () => window.removeEventListener('dts-open-notifications-tab', openNotifications);
  }, []);

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
          <button
            type="button"
            className={`marketing-tab-btn marketing-tab-btn--with-badge ${tab === 'notifications' ? 'active' : ''}`}
            onClick={() => {
              setTab('notifications');
              fetchMarketingNotificationsUnread();
            }}
          >
            Сповіщення
            {notificationsUnreadCount > 0 ? (
              <span className="marketing-tab-badge" aria-label={`Непрочитано: ${notificationsUnreadCount}`}>
                {notificationsUnreadCount > 99 ? '99+' : notificationsUnreadCount}
              </span>
            ) : null}
          </button>
        </nav>

        <div className="marketing-content-panel">
          {tab === 'leads' ? (
            <MarketingLeadsTab user={user} />
          ) : tab === 'integrations' ? (
            <MarketingIntegrationsTab />
          ) : (
            <ManagerNotificationsTab
              marketingFeed
              onUnreadCountChange={fetchMarketingNotificationsUnread}
              description="Сповіщення маркетингового відділу: нові ліди з реклами, передача менеджерам, підключення Telegram."
              title="Сповіщення"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default MarketingDashboard;
