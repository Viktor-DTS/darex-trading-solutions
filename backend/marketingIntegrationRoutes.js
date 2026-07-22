/**
 * Native marketing webhooks: Meta, Google, Telegram, Viber.
 */

const { canAccessMarketingPanel } = require('./lib/marketingLeads');
const {
  createMarketingLeadFromInbound,
  verifyMetaWebhookSignature,
  processMetaLeadgenWebhook,
  processGoogleLeadWebhook,
  handleTelegramUpdate,
  handleViberWebhook,
  telegramApi,
  viberApi,
  getIntegrationStatus,
} = require('./lib/marketingIntegrations');

function registerMarketingIntegrationRoutes(app, deps) {
  const { MarketingLead, MarketingBotSession, getNextMarketingLeadNumber, authenticateToken } = deps;
  const serviceDeps = { MarketingLead, getNextMarketingLeadNumber };

  app.get('/api/marketing/integrations/status', authenticateToken, async (req, res) => {
    try {
      if (!canAccessMarketingPanel(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      res.json(getIntegrationStatus());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/marketing/integrations/telegram/setup', authenticateToken, async (req, res) => {
    try {
      if (!canAccessMarketingPanel(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const status = getIntegrationStatus();
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
      const url = secret
        ? `${status.webhooks.telegram}?secret=${encodeURIComponent(secret)}`
        : status.webhooks.telegram;
      await telegramApi('setWebhook', { url, allowed_updates: ['message', 'edited_message'] });
      res.json({ ok: true, url });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/marketing/integrations/viber/setup', authenticateToken, async (req, res) => {
    try {
      if (!canAccessMarketingPanel(req.user)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const status = getIntegrationStatus();
      await viberApi('set_webhook', { url: status.webhooks.viber, event_types: ['delivered', 'seen', 'message', 'conversation_started'] });
      res.json({ ok: true, url: status.webhooks.viber });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Meta Lead Ads webhook (GET verify + POST leadgen)
  app.get('/api/marketing/webhooks/meta', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expected = process.env.META_VERIFY_TOKEN || '';
    if (mode === 'subscribe' && token && expected && token === expected) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  });

  app.post('/api/marketing/webhooks/meta', async (req, res) => {
    try {
      if (!verifyMetaWebhookSignature(req)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const body = req.body || {};
      if (body.object !== 'page') {
        return res.json({ ok: true, skipped: true });
      }

      const results = [];
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'leadgen') continue;
          try {
            const result = await processMetaLeadgenWebhook(serviceDeps, change.value || {});
            results.push(result);
          } catch (err) {
            console.error('[META LEAD]', err.message);
            results.push({ error: err.message });
          }
        }
      }

      res.json({ ok: true, results });
    } catch (e) {
      console.error('[META WEBHOOK]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Google Ads Lead Form webhook
  app.get('/api/marketing/webhooks/google', (req, res) => {
    const key = String(req.query.google_key || '').trim();
    const expected = process.env.GOOGLE_LEAD_WEBHOOK_KEY || '';
    if (expected && key === expected) {
      return res.status(200).send('OK');
    }
    return res.status(403).send('Forbidden');
  });

  app.post('/api/marketing/webhooks/google', async (req, res) => {
    try {
      const result = await processGoogleLeadWebhook(serviceDeps, req.body || {});
      res.status(result.ok ? 201 : 200).json(result);
    } catch (e) {
      const code = e.statusCode || 500;
      if (code >= 500) console.error('[GOOGLE LEAD]', e);
      res.status(code).json({ error: e.message });
    }
  });

  // Telegram bot webhook
  app.post('/api/marketing/webhooks/telegram', async (req, res) => {
    try {
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
      if (secret) {
        const q = String(req.query.secret || '');
        if (q !== secret) return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await handleTelegramUpdate(serviceDeps, MarketingBotSession, req.body || {});
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('[TELEGRAM BOT]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Viber bot webhook
  app.post('/api/marketing/webhooks/viber', async (req, res) => {
    try {
      const token = process.env.VIBER_BOT_TOKEN || '';
      const sig = req.get('x-viber-content-signature') || '';
      if (token && sig) {
        const crypto = require('crypto');
        const expected = crypto
          .createHmac('sha256', Buffer.from(token, 'utf8'))
          .update(Buffer.from(JSON.stringify(req.body || {}), 'utf8'))
          .digest('hex');
        if (sig !== expected) {
          return res.status(401).json({ error: 'Invalid Viber signature' });
        }
      }
      const result = await handleViberWebhook(serviceDeps, MarketingBotSession, req.body || {});
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('[VIBER BOT]', e);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { registerMarketingIntegrationRoutes };
