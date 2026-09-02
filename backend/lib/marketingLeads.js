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

const INTERACTION_TYPE_LABELS = {
  lead_form: 'Lead Form (реклама)',
  direct_message: 'Direct / Messenger',
  comment: 'Коментар',
  manual: 'Вручну',
  inbound: 'Inbound API',
  bot: 'Бот',
};

const STATUS_LABELS = {
  new: 'Новий',
  in_review: 'На розгляді',
  assigned: 'Призначено менеджеру',
  transmitted: 'Передано менеджеру',
  in_progress: 'Взято в роботу',
  converted: 'Конвертовано',
  rejected: 'Відхилено',
  spam: 'Спам',
};

const MANAGER_WORK_STATUS_LABELS = {
  transmitted: 'В очікуванні',
  in_progress: 'Взято в роботу',
  rejected: 'Відхилено',
  converted: 'Конвертовано',
};

function formatUkDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('uk-UA');
}

function getManagerWorkStatusLabel(status) {
  return MANAGER_WORK_STATUS_LABELS[status] || '—';
}

function getManagerWorkComment(lead) {
  if (!lead) return '';
  if (lead.status === 'rejected') {
    const reason = String(lead.rejectionReason || lead.managerWorkComment || '').trim();
    return reason ? `Причина відхилення: ${reason}` : 'Причина відхилення';
  }
  if (lead.managerTakenAt) {
    return `Взято в роботу ${formatUkDateTime(lead.managerTakenAt)}`;
  }
  if (lead.managerWorkComment) return String(lead.managerWorkComment);
  return '';
}

function enrichLeadForResponse(lead) {
  if (!lead || typeof lead !== 'object') return lead;
  return {
    ...lead,
    managerWorkStatusLabel: getManagerWorkStatusLabel(lead.status),
    managerWorkComment: getManagerWorkComment(lead),
  };
}

const MANUAL_ARCHIVE_STATUSES = ['in_progress', 'rejected', 'converted'];
const MARKETING_AUTO_ARCHIVE_STATUSES = ['rejected', 'spam'];

function canManuallyArchiveLead(lead) {
  return lead && MANUAL_ARCHIVE_STATUSES.includes(lead.status) && !lead.archived;
}

function pushLeadTimelineNote(lead, user, note) {
  lead.statusHistory = [...(lead.statusHistory || []), {
    from: lead.status,
    to: lead.status,
    date: new Date(),
    userLogin: user?.login || '',
    userName: user?.name || user?.login || '',
    note: note || '',
  }];
}

function setLeadArchived(lead, user, archived, note = '') {
  const now = new Date();
  lead.archived = !!archived;
  lead.archivedAt = archived ? now : null;
  lead.archivedByLogin = archived ? (user?.login || '') : '';
  lead.archivedByName = archived ? (user?.name || user?.login || '') : '';
  lead.archiveNote = archived ? String(note || '').trim() : '';
  pushLeadTimelineNote(
    lead,
    user,
    archived ? `Перенесено в архів${note ? `: ${note}` : ''}` : 'Повернуто з архіву'
  );
}

function shouldAutoArchiveOnMarketingStatus(status) {
  return MARKETING_AUTO_ARCHIVE_STATUSES.includes(status);
}

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
    metaCampaignName: pick('metaCampaignName'),
    metaAdsetName: pick('metaAdsetName'),
    metaAdName: pick('metaAdName'),
    metaFormName: pick('metaFormName'),
    metaPlatform: pick('metaPlatform'),
    metaPsid: pick('metaPsid'),
    metaIgUsername: pick('metaIgUsername'),
    metaCommentId: pick('metaCommentId'),
    metaPostId: pick('metaPostId'),
    metaMediaId: pick('metaMediaId'),
    interactionType: (() => {
      const v = pick('interactionType');
      const allowed = ['lead_form', 'direct_message', 'comment', 'manual', 'inbound', 'bot'];
      if (allowed.includes(v)) return v;
      return isInbound ? 'inbound' : 'manual';
    })(),
    trafficSource: pick('trafficSource'),
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
  const archivedParam = String(req.query.archived || '').trim();

  const wantArchive = scope === 'archive' || archivedParam === '1' || archivedParam === 'true';
  if (wantArchive) {
    q.archived = true;
  } else if (canManageAllMarketingLeads(user) || canAccessMarketingPanel(user)) {
    q.archived = { $ne: true };
  } else {
    q.archived = { $ne: true };
  }

  if (scope === 'manager' || (!canManageAllMarketingLeads(user) && role === 'manager')) {
    q.assignedManagerLogin = user.login;
    q.status = { $in: ['transmitted', 'in_progress', 'converted', 'rejected'] };
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
  MANAGER_WORK_STATUS_LABELS,
  MANUAL_ARCHIVE_STATUSES,
  INTERACTION_TYPE_LABELS,
  canAccessMarketingPanel,
  canManageAllMarketingLeads,
  canViewManagerExternalLeads,
  canManuallyArchiveLead,
  normalizePhone,
  pushStatusHistory,
  pushLeadTimelineNote,
  setLeadArchived,
  shouldAutoArchiveOnMarketingStatus,
  sanitizeLeadPayload,
  buildListQuery,
  formatUkDateTime,
  getManagerWorkStatusLabel,
  getManagerWorkComment,
  enrichLeadForResponse,
};
