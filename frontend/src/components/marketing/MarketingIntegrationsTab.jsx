import React, { useState, useEffect } from 'react';
import {
  getMarketingIntegrationsStatus,
  setupTelegramWebhook,
  setupViberWebhook,
} from '../../utils/marketingLeadsAPI';

const ENV_GROUPS = [
  {
    title: 'Загальні (Render)',
    vars: [
      { key: 'MARKETING_INBOUND_API_KEY', label: 'Ключ inbound API (сайт)' },
      { key: 'MARKETING_PUBLIC_BASE_URL', label: 'Публічний URL backend (опційно)' },
      { key: 'MARKETING_DEDUP_DAYS', label: 'Дедуплікація: дні (default 30)' },
      { key: 'MARKETING_DEDUP_MODE', label: 'warn | block | merge' },
    ],
  },
  {
    title: 'Facebook / Meta Lead Ads',
    vars: [
      { key: 'META_APP_ID', label: 'App ID' },
      { key: 'META_APP_SECRET', label: 'App Secret (підпис webhook)' },
      { key: 'META_PAGE_ACCESS_TOKEN', label: 'Page Access Token (Graph API)' },
      { key: 'META_VERIFY_TOKEN', label: 'Verify Token (ви придумуєте)' },
    ],
  },
  {
    title: 'Google Ads Lead Form',
    vars: [{ key: 'GOOGLE_LEAD_WEBHOOK_KEY', label: 'google_key для webhook' }],
  },
  {
    title: 'Telegram Bot',
    vars: [
      { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token від @BotFather' },
      { key: 'TELEGRAM_WEBHOOK_SECRET', label: 'Секрет у URL webhook (опційно)' },
      { key: 'TELEGRAM_BOT_USERNAME', label: '@username бота' },
    ],
  },
  {
    title: 'Viber Bot',
    vars: [{ key: 'VIBER_BOT_TOKEN', label: 'Viber Bot Token' }],
  },
];

function MarketingIntegrationsTab() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setStatus(await getMarketingIntegrationsStatus());
    } catch (e) {
      console.error(e);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleTelegramSetup = async () => {
    setBusy('telegram');
    try {
      const r = await setupTelegramWebhook();
      alert(`Telegram webhook: ${r.url}`);
      load();
    } catch (e) {
      alert(e.message || 'Помилка');
    } finally {
      setBusy('');
    }
  };

  const handleViberSetup = async () => {
    setBusy('viber');
    try {
      const r = await setupViberWebhook();
      alert(`Viber webhook: ${r.url}`);
      load();
    } catch (e) {
      alert(e.message || 'Помилка');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return <div className="marketing-loading">Завантаження статусу інтеграцій...</div>;
  }

  const webhooks = status?.webhooks || {};
  const flags = status || {};

  return (
    <div>
      <p style={{ margin: '0 0 16px', color: 'rgba(244,244,245,0.7)', lineHeight: 1.6 }}>
        Нативні webhook-и на Render — без Zapier/Make. Після додавання env-змінних налаштуйте URL у Meta / Google / ботах.
      </p>

      <div className="marketing-integrations-grid">
        <div className="marketing-integration-card">
          <h4>Inbound API (сайт)</h4>
          <p>Ручний прийом з landing-сторінок.</p>
          <span className={`marketing-integration-status marketing-integration-status--${flags.inbound ? 'ready' : 'planned'}`}>
            {flags.inbound ? 'Налаштовано' : 'Потрібен ключ'}
          </span>
          <div className="marketing-api-hint" style={{ marginTop: 10, fontSize: 11 }}>{webhooks.inbound}</div>
        </div>
        <div className="marketing-integration-card">
          <h4>Meta Lead Ads</h4>
          <p>Webhook + Graph API для форм лідів.</p>
          <span className={`marketing-integration-status marketing-integration-status--${flags.meta ? 'ready' : 'planned'}`}>
            {flags.meta ? 'Готово до прийому' : 'Додайте env Meta'}
          </span>
          <div className="marketing-api-hint" style={{ marginTop: 10, fontSize: 11 }}>{webhooks.meta}</div>
        </div>
        <div className="marketing-integration-card">
          <h4>Google Lead Form</h4>
          <p>Webhook з google_key у Google Ads.</p>
          <span className={`marketing-integration-status marketing-integration-status--${flags.google ? 'ready' : 'planned'}`}>
            {flags.google ? 'Готово до прийому' : 'Додайте GOOGLE_LEAD_WEBHOOK_KEY'}
          </span>
          <div className="marketing-api-hint" style={{ marginTop: 10, fontSize: 11 }}>{webhooks.google}</div>
        </div>
        <div className="marketing-integration-card">
          <h4>Telegram Bot</h4>
          <p>Діалог: ім’я → телефон → місто → продукт.</p>
          <span className={`marketing-integration-status marketing-integration-status--${flags.telegram ? 'ready' : 'planned'}`}>
            {flags.telegram ? 'Token OK' : 'Додайте TELEGRAM_BOT_TOKEN'}
          </span>
          <button
            type="button"
            className="marketing-btn marketing-btn-secondary"
            style={{ marginTop: 10 }}
            disabled={!flags.telegram || busy === 'telegram'}
            onClick={handleTelegramSetup}
          >
            Підключити webhook
          </button>
        </div>
        <div className="marketing-integration-card">
          <h4>Viber Bot</h4>
          <p>Аналогічний сценарій заявки.</p>
          <span className={`marketing-integration-status marketing-integration-status--${flags.viber ? 'ready' : 'planned'}`}>
            {flags.viber ? 'Token OK' : 'Додайте VIBER_BOT_TOKEN'}
          </span>
          <button
            type="button"
            className="marketing-btn marketing-btn-secondary"
            style={{ marginTop: 10 }}
            disabled={!flags.viber || busy === 'viber'}
            onClick={handleViberSetup}
          >
            Підключити webhook
          </button>
        </div>
        <div className="marketing-integration-card">
          <h4>Дедуплікація</h4>
          <p>
            Режим: <strong>{flags.dedup?.mode || 'warn'}</strong>, період:{' '}
            <strong>{flags.dedup?.days || 30}</strong> дн.
          </p>
          <span className="marketing-integration-status marketing-integration-status--ready">Активна</span>
        </div>
      </div>

      <h4 style={{ color: '#f5ecd6', margin: '24px 0 12px' }}>Env-змінні Render</h4>
      {ENV_GROUPS.map((group) => (
        <div key={group.title} style={{ marginBottom: 16 }}>
          <div style={{ color: 'rgba(245,236,214,0.85)', marginBottom: 6, fontSize: 13 }}>{group.title}</div>
          <ul className="marketing-roadmap-list" style={{ marginTop: 0 }}>
            {group.vars.map((v) => (
              <li key={v.key}>
                <code>{v.key}</code> — {v.label}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h4 style={{ color: '#f5ecd6', margin: '16px 0 12px' }}>Meta: кроки в Ads Manager</h4>
      <ul className="marketing-roadmap-list">
        <li>Meta App → Webhooks → Page → subscribe <code>leadgen</code></li>
        <li>Callback URL: <code>{webhooks.meta}</code></li>
        <li>Verify Token = значення <code>META_VERIFY_TOKEN</code></li>
        <li>Page Access Token з правами <code>leads_retrieval</code></li>
      </ul>

      <h4 style={{ color: '#f5ecd6', margin: '16px 0 12px' }}>Google Ads</h4>
      <ul className="marketing-roadmap-list">
        <li>Lead Form Extension → Webhook URL: <code>{webhooks.google}</code></li>
        <li>Key = значення <code>GOOGLE_LEAD_WEBHOOK_KEY</code></li>
      </ul>
    </div>
  );
}

export default MarketingIntegrationsTab;
