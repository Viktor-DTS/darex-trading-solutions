/**
 * Історичний імпорт Meta Lead Ads.
 * Webhook доставляє лише нові ліди, тому раніше створені ліди форм
 * довантажуються через Graph API тим самим шляхом, що й webhook.
 */

const { processMetaLeadgenWebhook } = require('./marketingIntegrations');
const { getMetaPageAccessToken, getMetaPageId } = require('./metaEnvProfiles');

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const GRAPH_PAGE_SIZE = 100;
const MAX_GRAPH_PAGES = 50;
const THROTTLE_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(path, params, token) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  return `${GRAPH_BASE}/${path}?${qs.toString()}`;
}

async function graphGet(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Meta Graph API HTTP ${res.status}`);
    err.statusCode = 502;
    throw err;
  }
  return data;
}

async function graphGetSafe(url) {
  try {
    return { ok: true, data: await graphGet(url) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function graphList(url) {
  const out = [];
  let next = url;
  let pages = 0;
  while (next && pages < MAX_GRAPH_PAGES) {
    const data = await graphGet(next);
    out.push(...(data.data || []));
    next = data.paging?.next || '';
    pages += 1;
    if (next) await sleep(THROTTLE_MS);
  }
  return out;
}

/**
 * META_PAGE_ACCESS_TOKEN може бути токеном System User (prod DTS CRM LEADS),
 * а сторінкові edge-и (leadgen_forms, leads) вимагають Page Access Token.
 */
async function resolvePageContext(profile, pageIdHint) {
  const token = getMetaPageAccessToken(profile);
  if (!token) {
    const err = new Error(`META_PAGE_ACCESS_TOKEN${profile === 'star' ? '_STAR' : ''} не задано`);
    err.statusCode = 400;
    throw err;
  }

  const wantedPageId = String(pageIdHint || getMetaPageId(profile) || '').trim();

  const accounts = await graphGetSafe(
    buildUrl('me/accounts', { fields: 'id,name,access_token', limit: GRAPH_PAGE_SIZE }, token)
  );
  const pages = accounts.ok ? (accounts.data.data || []) : [];
  const match = wantedPageId
    ? pages.find((p) => String(p.id) === wantedPageId)
    : pages[0];

  if (match?.access_token) {
    return {
      pageToken: match.access_token,
      pageId: String(match.id),
      pageName: match.name || '',
      tokenKind: 'page_from_system_user',
    };
  }

  const me = await graphGet(buildUrl('me', { fields: 'id,name' }, token));
  return {
    pageToken: token,
    pageId: wantedPageId || String(me.id || ''),
    pageName: me.name || '',
    tokenKind: 'env_token',
  };
}

function normalizeForm(raw) {
  return {
    id: String(raw.id),
    name: raw.name || '',
    status: raw.status || '',
    leadsCount: Number.isFinite(raw.leads_count) ? raw.leads_count : null,
  };
}

async function collectForms(ctx, formIds) {
  if (formIds.length) {
    const out = [];
    for (const id of formIds) {
      const r = await graphGetSafe(
        buildUrl(String(id), { fields: 'id,name,status,leads_count' }, ctx.pageToken)
      );
      out.push(r.ok
        ? normalizeForm(r.data)
        : { id: String(id), name: '', status: '', leadsCount: null, error: r.error });
      await sleep(THROTTLE_MS);
    }
    return out;
  }

  const all = await graphList(buildUrl(
    `${ctx.pageId}/leadgen_forms`,
    { fields: 'id,name,status,leads_count', limit: GRAPH_PAGE_SIZE },
    ctx.pageToken
  ));
  return all.map(normalizeForm);
}

async function listMetaLeadForms(opts = {}) {
  const profile = opts.profile === 'star' ? 'star' : 'prod';
  const ctx = await resolvePageContext(profile, opts.pageId);
  const forms = await collectForms(ctx, []);
  const withLeads = forms.filter((f) => (f.leadsCount || 0) > 0);

  return {
    profile,
    pageId: ctx.pageId,
    pageName: ctx.pageName,
    tokenKind: ctx.tokenKind,
    formsTotal: forms.length,
    leadsTotal: forms.reduce((sum, f) => sum + (f.leadsCount || 0), 0),
    formsWithLeads: withLeads.length,
    forms: forms.sort((a, b) => (b.leadsCount || 0) - (a.leadsCount || 0)),
  };
}

function buildChangeValue(ctx, formId, lead) {
  const createdMs = Date.parse(lead.created_time || '');
  return {
    leadgen_id: String(lead.id),
    page_id: ctx.pageId,
    form_id: String(lead.form_id || formId),
    created_time: Number.isFinite(createdMs) ? Math.floor(createdMs / 1000) : undefined,
    ad_id: lead.ad_id ? String(lead.ad_id) : '',
    adset_id: lead.adset_id ? String(lead.adset_id) : '',
    campaign_id: lead.campaign_id ? String(lead.campaign_id) : '',
    imported: true,
  };
}

/**
 * @param {object} deps — { MarketingLead, getNextMarketingLeadNumber, ... }
 * @param {object} [opts]
 * @param {'prod'|'star'} [opts.profile]
 * @param {string} [opts.pageId]
 * @param {string[]} [opts.formIds] — порожньо = усі форми сторінки
 * @param {string} [opts.since] — ISO дата; старіші ліди пропускаються
 * @param {number} [opts.limit] — скільки нових лідів створити за виклик
 * @param {boolean} [opts.dryRun] — за замовчуванням true
 */
async function importMetaHistoricalLeads(deps, opts = {}) {
  const { MarketingLead } = deps;
  const profile = opts.profile === 'star' ? 'star' : 'prod';
  const dryRun = opts.dryRun !== false;
  const requested = parseInt(opts.limit, 10);
  const limit = Math.min(
    Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const sinceMs = opts.since ? Date.parse(opts.since) : NaN;
  const since = Number.isFinite(sinceMs) ? sinceMs : null;
  const formIds = (Array.isArray(opts.formIds) ? opts.formIds : [])
    .map((v) => String(v).trim())
    .filter(Boolean);

  const ctx = await resolvePageContext(profile, opts.pageId);
  const forms = await collectForms(ctx, formIds);

  const totals = { scanned: 0, alreadyInCrm: 0, created: 0, pending: 0, failed: 0, skippedByDate: 0 };
  const formsReport = [];
  let budget = limit;

  for (const form of forms) {
    if (form.error) {
      formsReport.push({ ...form, state: 'error' });
      continue;
    }
    if (budget <= 0) {
      formsReport.push({ ...form, state: 'not_reached' });
      continue;
    }

    const report = {
      ...form,
      state: 'processed',
      scanned: 0,
      alreadyInCrm: 0,
      created: 0,
      preview: [],
      imported: [],
      failed: [],
    };

    let next = buildUrl(
      `${form.id}/leads`,
      {
        fields: 'id,created_time,form_id,ad_id,adset_id,campaign_id',
        limit: GRAPH_PAGE_SIZE,
      },
      ctx.pageToken
    );
    let pages = 0;
    let stop = false;

    while (next && pages < MAX_GRAPH_PAGES && budget > 0 && !stop) {
      const page = await graphGetSafe(next);
      if (!page.ok) {
        report.state = 'error';
        report.error = page.error;
        break;
      }

      for (const lead of page.data.data || []) {
        if (budget <= 0) break;

        const createdMs = Date.parse(lead.created_time || '');
        if (since && Number.isFinite(createdMs) && createdMs < since) {
          totals.skippedByDate += 1;
          stop = true;
          break;
        }

        report.scanned += 1;
        totals.scanned += 1;

        const exists = await MarketingLead.exists({ metaLeadId: String(lead.id) });
        if (exists) {
          report.alreadyInCrm += 1;
          totals.alreadyInCrm += 1;
          continue;
        }

        budget -= 1;

        if (dryRun) {
          report.preview.push({ leadgenId: String(lead.id), createdTime: lead.created_time || '' });
          totals.pending += 1;
          continue;
        }

        try {
          const result = await processMetaLeadgenWebhook(deps, buildChangeValue(ctx, form.id, lead), {
            metaProfile: profile,
            skipTelegram: true,
            actorName: 'Meta історичний імпорт',
            historyNote: 'Meta Lead Ads — історичний імпорт',
          });
          report.created += 1;
          totals.created += 1;
          report.imported.push({
            leadgenId: String(lead.id),
            createdTime: lead.created_time || '',
            requestNumber: result?.requestNumber || '',
          });
        } catch (e) {
          report.failed.push({ leadgenId: String(lead.id), error: e.message });
          totals.failed += 1;
        }

        await sleep(THROTTLE_MS);
      }

      next = page.data.paging?.next || '';
      pages += 1;
      if (next && budget > 0 && !stop) await sleep(THROTTLE_MS);
    }

    formsReport.push(report);
  }

  const notReached = formsReport.filter((f) => f.state === 'not_reached').length;

  return {
    ok: totals.failed === 0,
    dryRun,
    profile,
    pageId: ctx.pageId,
    pageName: ctx.pageName,
    tokenKind: ctx.tokenKind,
    limit,
    since: since ? new Date(since).toISOString() : null,
    totals,
    budgetExhausted: budget <= 0,
    formsNotReached: notReached,
    hint: dryRun
      ? 'Це попередній прогін. Для реального імпорту надішліть "dryRun": false.'
      : (budget <= 0 || notReached > 0
        ? 'Ліміт вичерпано — повторіть запит, уже імпортовані ліди буде пропущено.'
        : 'Імпорт завершено.'),
    forms: formsReport,
  };
}

module.exports = {
  listMetaLeadForms,
  importMetaHistoricalLeads,
};
