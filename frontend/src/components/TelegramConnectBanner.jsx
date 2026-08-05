import React, { useCallback, useEffect, useState } from 'react';
import API_BASE_URL from '../config';
import './TelegramConnectBanner.css';

function extractInviteLink(text) {
  const match = String(text || '').match(/https:\/\/t\.me\/[^\s]+/);
  return match ? match[0] : null;
}

function bodyWithoutLink(body, link) {
  if (!link) return body;
  return String(body || '').replace(link, '').trim();
}

export default function TelegramConnectBanner({ onOpenNotifications }) {
  const [prompt, setPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const loadPrompt = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setPrompt(null);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/telegram/connect-prompt`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPrompt(await res.json());
      } else {
        setPrompt(null);
      }
    } catch {
      setPrompt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrompt();
    const id = setInterval(loadPrompt, 120000);
    return () => clearInterval(id);
  }, [loadPrompt]);

  if (loading || !prompt?.needed) return null;

  const inviteLink = prompt.inviteLink || extractInviteLink(prompt.body);
  const bodyText = bodyWithoutLink(prompt.body, inviteLink);

  return (
    <div className={`telegram-connect-banner ${collapsed ? 'collapsed' : ''}`} role="status">
      <div className="telegram-connect-banner__header">
        <span className="telegram-connect-banner__icon">📱</span>
        <strong>{prompt.title || 'Підключіть Telegram для робочих сповіщень'}</strong>
        <div className="telegram-connect-banner__header-actions">
          <button
            type="button"
            className="telegram-connect-banner__toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
          >
            {collapsed ? 'Розгорнути' : 'Згорнути'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="telegram-connect-banner__content">
          <pre className="telegram-connect-banner__body">{bodyText}</pre>
          <div className="telegram-connect-banner__actions">
            {inviteLink ? (
              <a
                className="telegram-connect-banner__btn telegram-connect-banner__btn--primary"
                href={inviteLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Підключити Telegram (@{prompt.botUsername || 'DTS_Service_Bot'})
              </a>
            ) : null}
            {onOpenNotifications ? (
              <button
                type="button"
                className="telegram-connect-banner__btn"
                onClick={onOpenNotifications}
              >
                Відкрити в «Системних сповіщеннях»
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
