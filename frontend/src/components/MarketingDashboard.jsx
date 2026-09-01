import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import MarketingLeadsTab from './marketing/MarketingLeadsTab';
import MarketingLeadsArchiveTab from './marketing/MarketingLeadsArchiveTab';
import MarketingIntegrationsTab from './marketing/MarketingIntegrationsTab';
import ManagerNotificationsTab from './manager/ManagerNotificationsTab';
import './MarketingDashboard.css';

const SIDEBAR_ITEMS = [
  { id: 'leads', icon: '📋', label: 'Заявки та ліди' },
  { id: 'archive', icon: '📦', label: 'Архів рекламних заявок', badgeKey: 'archived' },
  { id: 'integrations', icon: '🔗', label: 'Джерела та інтеграції' },
  { id: 'notifications', icon: '🔔', label: 'Сповіщення', badgeKey: 'notifications' },
];

function MarketingDashboard({ user }) {
  const [tab, setTab] = useState('leads');
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);

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

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE_URL}/marketing/leads/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.archivedCount === 'number') setArchivedCount(data.archivedCount);
      })
      .catch(() => {});
  }, [tab]);

  const getBadgeCount = (key) => {
    if (key === 'archived') return archivedCount;
    if (key === 'notifications') return notificationsUnreadCount;
    return 0;
  };

  const handleTabClick = (id) => {
    setTab(id);
    if (id === 'notifications') fetchMarketingNotificationsUnread();
  };

  return (
    <div className="marketing-dashboard">
      <div className="marketing-dashboard-main">
        <aside className="marketing-sidebar">
          <div className="marketing-sidebar-brand">
            <h1>Маркетинговий відділ</h1>
            <span className="marketing-sidebar-badge">VIP · Lead Hub</span>
            <p className="marketing-sidebar-desc">
              Центр обробки заявок з сайту, Meta/Facebook, Google Ads та інших каналів.
            </p>
          </div>

          <nav className="marketing-sidebar-nav" aria-label="Розділи маркетингу">
            {SIDEBAR_ITEMS.map((item) => {
              const badge = item.badgeKey ? getBadgeCount(item.badgeKey) : 0;
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`marketing-sidebar-tab ${isActive ? 'active' : ''} ${badge > 0 ? 'marketing-sidebar-tab--with-badge' : ''}`}
                  onClick={() => handleTabClick(item.id)}
                >
                  <span className="marketing-sidebar-tab-icon" aria-hidden>{item.icon}</span>
                  <span className="marketing-sidebar-tab-label">{item.label}</span>
                  {badge > 0 ? (
                    <span
                      className={`marketing-sidebar-tab-badge ${item.badgeKey === 'archived' ? 'marketing-sidebar-tab-badge--muted' : ''}`}
                      aria-label={`${item.label}: ${badge}`}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="marketing-main-content">
          <div className="marketing-content-panel">
            {tab === 'leads' ? (
              <MarketingLeadsTab user={user} onArchiveChange={setArchivedCount} />
            ) : tab === 'archive' ? (
              <MarketingLeadsArchiveTab user={user} onArchiveChange={setArchivedCount} />
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
        </main>
      </div>
    </div>
  );
}

export default MarketingDashboard;
