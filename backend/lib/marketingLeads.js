/**
 * Маркетингові ліди / запити з зовнішньої реклами.
 * Підготовка до website, Meta/Facebook, Google Ads та ручного вводу.
 */

const MARKETING_LEAD_SOURCES = [
  'manual',
  'website',
  'facebook',
  'instagram',
  'google',
  'telegram',
  'viber',
  'email',
  'referral',
  'other',
];

const MARKETING_LEAD_STATUSES = [
  'new',
  'in_review',
  'assigned',
  'transmitted',
  'in_progress',
  'converted',
  'rejected',
  'spam',
];

const SOURCE_LABELS = {
  manual: 'Телефон / вручну',
  website: 'Сайт',
  facebook: 'Facebook / Meta',
  instagram: 'Instagram',
  google: 'Google Ads',
  telegram: 'Telegram',
  viber: 'Viber',
  email: 'Email',
  referral: 'Рекомендація',
  other: 'Інше',
};

const STATUS_LABELS = {
  new: 'Новий',
  in_review: 'На розгляді',
  assigned: 'Призначено менеджеру',
  transmitted: 'Передано менеджеру',
  in_progress: 'В роботі',
  converted: 'Конвертовано',
  rejected: 'Відхилено',
  spam: 'Спам',
};

function canAccessMarketingPanel(user) {
  const role = String(user?.role || '').toLowerCase();
  return ['admin', 'administrator', 'marketing', 'mgradm'].includes(role);
}

function canManageAllMarketingLeads(user) {
  const role = String(user?.role || '').toLowerCase();
  return ['admin', 'administrator', 'marketing', 'mgradm'].includes(role);
}

function canViewManagerExternalLeads(user) {
  const role = String(user?.role || '').toLowerCase();
  return ['admin', 'administrator', 'marketing', 'mgradm', 'manager'].includes(role);
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function pushStatusHistory(lead, toStatus, user, note) {
  const entry = {
    from: lead.status,
    to: toStatus,
    date: new Date(),
    userLogin: user?.login || '',
    userName: user?.name || user?.login || '',
    note: note || '',
  };
  lead.statusHistory = [...(lead.statusHistory || []), entry];
  lead.status = toStatus;
}

function sanitizeLeadPayload(body, { isInbound = false } = {}) {
  const src = body || {};
  const pick = (key) => (src[key] != null ? String(src[key]).trim() : '');
  return {
    source: MARKETING_LEAD_SOURCES.includes(src.source) ? src.source : isInbound ? 'website' : 'manual',
    sourceDetail: pick('sourceDetail'),
    clientName: pick('clientName') || pick('name'),
    contactPhone: pick('contactPhone') || pick('phone'),
    contactEmail: pick('contactEmail') || pick('email'),
    city: pick('city'),
    region: pick('region'),
    productInterest: pick('productInterest') || pick('productName'),
    productSlug: pick('productSlug'),
    equipmentType: pick('equipmentType'),
    powerRequired: pick('powerRequired'),
    budget: pick('budget'),
    comment: pick('comment') || pick('message'),
    preferredContact: pick('preferredContact') || 'phone',
    utmSource: pick('utmSource'),
    utmMedium: pick('utmMedium'),
    utmCampaign: pick('utmCampaign'),
    utmContent: pick('utmContent'),
    utmTerm: pick('utmTerm'),
    metaLeadId: pick('metaLeadId'),
    metaFormId: pick('metaFormId'),
    metaAdId: pick('metaAdId'),
    metaAdsetId: pick('metaAdsetId'),
    metaCampaignId: pick('metaCampaignId'),
    landingPage: pick('landingPage'),
    referrer: pick('referrer'),
    priority: ['low', 'normal', 'high', 'urgent'].includes(src.priority) ? src.priority : 'normal',
    marketingNotes: pick('marketingNotes'),
    rawPayload: isInbound ? src : undefined,
  };
}

function buildListQuery(req, user) {
  const q = {};
  const role = String(user?.role || '').toLowerCase();
  const scope = String(req.query.scope || '').trim();

  if (scope === 'manager' || (!canManageAllMarketingLeads(user) && role === 'manager')) {
    q.assignedManagerLogin = user.login;
    q.status = { $in: ['transmitted', 'in_progress', 'converted'] };
  }

  const status = String(req.query.status || '').trim();
  if (status && MARKETING_LEAD_STATUSES.includes(status)) q.status = status;

  const source = String(req.query.source || '').trim();
  if (source && MARKETING_LEAD_SOURCES.includes(source)) q.source = source;

  const managerLogin = String(req.query.managerLogin || '').trim();
  if (managerLogin && canManageAllMarketingLeads(user)) {
    q.assignedManagerLogin = managerLogin;
  }

  const search = String(req.query.search || '').trim();
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [
      { clientName: re },
      { contactPhone: re },
      { contactEmail: re },
      { city: re },
      { productInterest: re },
      { requestNumber: re },
      { comment: re },
    ];
  }

  return q;
}

module.exports = {
  MARKETING_LEAD_SOURCES,
  MARKETING_LEAD_STATUSES,
  SOURCE_LABELS,
  STATUS_LABELS,
  canAccessMarketingPanel,
  canManageAllMarketingLeads,
  canViewManagerExternalLeads,
  normalizePhone,
  pushStatusHistory,
  sanitizeLeadPayload,
  buildListQuery,
};
