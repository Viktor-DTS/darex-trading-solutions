/**
 * Реєстр постачальників ВЕД — поступове наповнення таблиці (ручний + щоденний cron о 02:00 Kyiv).
 */
const mongoose = require('mongoose');
const { vedAiEnabled, runVedSupplierResearch } = require('./vedAiResearch');
const {
  EQUIPMENT_TYPES,
  DEFAULT_TECHNICAL_REQUIREMENTS,
  normalizeEquipmentType,
  normalizeEquipmentTypes,
  defaultTechnicalRequirements,
  buildDefaultTechnicalRequirementsForTypes,
  equipmentTypeLabel,
  VED_EQUIPMENT_TYPE_LABELS,
  parseStoredEquipmentTypes,
  formatEquipmentTypeLabels,
} = require('./vedEquipmentTypes');

const AUTO_SEARCH_PROFILES = EQUIPMENT_TYPES.map((equipmentType) => ({
  equipmentType,
  equipmentName: '',
  technicalRequirements: DEFAULT_TECHNICAL_REQUIREMENTS[equipmentType] || DEFAULT_TECHNICAL_REQUIREMENTS.other,
  extraSearchHint: 'export OEM CE certification',
}));

const vedSupplierRegistrySchema = new mongoose.Schema(
  {
    productName: { type: String, trim: true, default: '' },
    supplierName: { type: String, trim: true, default: '', index: true },
    country: { type: String, trim: true, default: '' },
    priceFrom: { type: Number, default: null },
    priceTo: { type: Number, default: null },
    currency: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    contacts: { type: String, trim: true, default: '' },
    certificates: { type: String, trim: true, default: '' },
    powerLineup: { type: String, trim: true, default: '' },
    riskDescription: { type: String, trim: true, default: '' },
    equipmentType: { type: String, default: 'other', index: true },
    equipmentTypes: { type: [String], default: [] },
    tradeCategories: { type: [String], default: [] },
    dedupKey: { type: String, trim: true, required: true, unique: true, index: true },
    source: { type: String, enum: ['manual', 'scheduled'], default: 'manual', index: true },
    researchSessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    addedByLogin: { type: String, default: '' },
    addedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

vedSupplierRegistrySchema.index({ createdAt: -1 });

const vedRegistryStateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'ved_registry' },
    lastScheduledRunAt: Date,
    lastScheduledEquipmentType: String,
    scheduledRunCount: { type: Number, default: 0 },
    rotationIndex: { type: Number, default: 0 },
    lastScheduledAdded: { type: Number, default: 0 },
    lastScheduledSkipped: { type: Number, default: 0 },
    lastScheduledError: { type: String, default: '' },
  },
  { timestamps: true }
);

let VedSupplierRegistry;
let VedRegistryState;
let VedResearchSession;

try {
  VedSupplierRegistry = mongoose.model('VedSupplierRegistry');
} catch {
  VedSupplierRegistry = mongoose.model('VedSupplierRegistry', vedSupplierRegistrySchema);
}
try {
  VedRegistryState = mongoose.model('VedRegistryState');
} catch {
  VedRegistryState = mongoose.model('VedRegistryState', vedRegistryStateSchema);
}

function normalizeDedupText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .replace(/[^a-z0-9\u0400-\u04FF@.+_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWebsiteHost(website) {
  const raw = String(website || '').trim();
  if (!raw) return '';
  try {
    const url = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`);
    return normalizeDedupText(url.hostname);
  } catch {
    return normalizeDedupText(raw.split('/')[0]);
  }
}

function buildSupplierDedupKey(supplierName, website) {
  const host = extractWebsiteHost(website);
  if (host) return `host:${host}`;
  const name = normalizeDedupText(supplierName);
  if (name) return `name:${name}`;
  return '';
}

function resolveRowEquipmentTypes(candidate, context = {}) {
  const fromCandidate = normalizeEquipmentTypes({
    equipmentTypes: candidate.equipmentTypeHints,
  }).slice(0, 3);
  if (fromCandidate.length && fromCandidate[0] !== 'other') {
    return fromCandidate;
  }
  const contextTypes = normalizeEquipmentTypes({
    equipmentTypes: context.equipmentTypes,
    equipmentType: context.equipmentType,
  });
  return contextTypes.length ? [contextTypes[0]] : ['other'];
}

function resolveTradeCategories(candidate) {
  const fromLlm = Array.isArray(candidate.tradeCategories)
    ? candidate.tradeCategories.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  if (fromLlm.length) return fromLlm;

  const hints = normalizeEquipmentTypes({ equipmentTypes: candidate.equipmentTypeHints }).slice(0, 3);
  if (hints.length && hints[0] !== 'other') {
    return formatEquipmentTypeLabels(hints);
  }

  const summary = String(candidate.productSummary || '').trim();
  if (summary) return [summary.slice(0, 120)];

  const model = String(candidate.productModel || '').trim();
  if (model) return [model.slice(0, 80)];

  return [];
}

function candidateToRegistryRow(candidate, context = {}) {
  const productName = [context.equipmentName, candidate.productModel].filter(Boolean).join(' · ').trim()
    || candidate.productModel
    || context.equipmentLabel
    || '—';

  let priceFrom = candidate.priceFrom;
  let priceTo = candidate.priceTo;
  if (priceFrom == null && priceTo == null && candidate.priceEstimate != null) {
    priceFrom = candidate.priceEstimate;
    priceTo = candidate.priceEstimate;
  }

  const riskParts = [];
  if (candidate.riskDescription) riskParts.push(String(candidate.riskDescription).trim());
  if (Array.isArray(candidate.riskNotes) && candidate.riskNotes.length) {
    riskParts.push(candidate.riskNotes.join('; '));
  }

  const dedupKey = buildSupplierDedupKey(candidate.supplierName, candidate.website);
  if (!dedupKey) return null;

  const equipmentTypes = resolveRowEquipmentTypes(candidate, context);
  const equipmentType = equipmentTypes[0] || 'other';
  const tradeCategories = resolveTradeCategories(candidate);

  return {
    productName: String(productName).slice(0, 400),
    supplierName: String(candidate.supplierName || '').slice(0, 200),
    country: String(candidate.country || '').slice(0, 120),
    priceFrom: Number.isFinite(Number(priceFrom)) ? Number(priceFrom) : null,
    priceTo: Number.isFinite(Number(priceTo)) ? Number(priceTo) : null,
    currency: String(candidate.currency || '').slice(0, 12).toUpperCase(),
    website: String(candidate.website || '').slice(0, 300),
    contacts: String(candidate.contact || candidate.contacts || '').slice(0, 300),
    certificates: String(candidate.certificates || candidate.certificatesHint || '').slice(0, 400),
    powerLineup: String(candidate.powerLineup || candidate.powerLineupHint || '').slice(0, 400),
    riskDescription: riskParts.join('\n').slice(0, 2000),
    equipmentType,
    equipmentTypes,
    tradeCategories,
    dedupKey,
    source: context.source || 'manual',
    researchSessionId: context.researchSessionId || null,
    addedByLogin: context.addedByLogin || '',
    addedByName: context.addedByName || '',
  };
}

async function loadExistingDedupKeys() {
  const rows = await VedSupplierRegistry.find({}).select('dedupKey supplierName website').lean();
  const keys = new Set();
  const labels = [];
  for (const row of rows) {
    if (row.dedupKey) keys.add(row.dedupKey);
    const label = row.supplierName || extractWebsiteHost(row.website);
    if (label) labels.push(String(label).slice(0, 120));
  }
  return { keys, labels: labels.slice(0, 200) };
}

async function mergeCandidatesIntoRegistry(candidates, context = {}) {
  const { keys: existingKeys } = await loadExistingDedupKeys();
  const added = [];
  let skipped = 0;

  for (const candidate of candidates || []) {
    const row = candidateToRegistryRow(candidate, context);
    if (!row) {
      skipped += 1;
      continue;
    }
    if (existingKeys.has(row.dedupKey)) {
      skipped += 1;
      continue;
    }
    try {
      const doc = await VedSupplierRegistry.create(row);
      existingKeys.add(row.dedupKey);
      added.push(doc.toObject());
    } catch (e) {
      if (e && e.code === 11000) skipped += 1;
      else throw e;
    }
  }

  return { added, skipped };
}

function enrichRegistryRow(row) {
  let tradeCategories = Array.isArray(row.tradeCategories)
    ? row.tradeCategories.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  if (!tradeCategories.length) {
    const stored = Array.isArray(row.equipmentTypes) && row.equipmentTypes.length
      ? normalizeEquipmentTypes({ equipmentTypes: row.equipmentTypes })
      : parseStoredEquipmentTypes(row.equipmentType);
    if (stored.length > 0 && stored.length <= 3) {
      tradeCategories = formatEquipmentTypeLabels(stored);
    } else if (row.productName) {
      tradeCategories = [String(row.productName).split('·')[0].trim().slice(0, 100)];
    }
  }

  const equipmentTypes =
    Array.isArray(row.equipmentTypes) && row.equipmentTypes.length
      ? normalizeEquipmentTypes({ equipmentTypes: row.equipmentTypes }).slice(0, 3)
      : parseStoredEquipmentTypes(row.equipmentType).slice(0, 1);

  return {
    ...row,
    tradeCategories,
    equipmentTypes,
    equipmentType: equipmentTypes[0] || row.equipmentType || 'other',
    categoryLabels: tradeCategories,
  };
}

function registryCronHour() {
  const n = parseInt(String(process.env.VED_REGISTRY_CRON_HOUR || '2'), 10);
  return Number.isFinite(n) ? Math.min(23, Math.max(0, n)) : 2;
}

function registryCronTimeZone() {
  return String(process.env.VED_REGISTRY_CRON_TZ || 'Europe/Kyiv').trim() || 'Europe/Kyiv';
}

function getZonedParts(date = new Date(), timeZone = registryCronTimeZone()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return parts;
}

function zonedDayKey(date = new Date()) {
  const p = getZonedParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function shouldRunScheduledRegistry(state) {
  if (String(process.env.VED_REGISTRY_AUTO_ENABLED || '1').trim() === '0') return false;
  if (!vedAiEnabled()) return false;

  const parts = getZonedParts();
  const hour = parseInt(parts.hour, 10);
  if (hour !== registryCronHour()) return false;

  if (!state?.lastScheduledRunAt) return true;
  return zonedDayKey(state.lastScheduledRunAt) !== zonedDayKey();
}

function nextRegistryRunHint() {
  const tz = registryCronTimeZone();
  const hour = registryCronHour();
  return `щодня о ${String(hour).padStart(2, '0')}:00 (${tz})`;
}

async function getRegistryState() {
  let doc = await VedRegistryState.findById('ved_registry');
  if (!doc) {
    doc = await VedRegistryState.create({ _id: 'ved_registry' });
  }
  return doc;
}

async function getRegistryMeta() {
  const [total, state] = await Promise.all([
    VedSupplierRegistry.countDocuments({}),
    getRegistryState(),
  ]);
  const { profile: nextProfile } = pickAutoSearchProfile(state.rotationIndex || 0);
  return {
    total,
    lastScheduledRunAt: state.lastScheduledRunAt || null,
    lastScheduledEquipmentType: state.lastScheduledEquipmentType || '',
    lastScheduledAdded: state.lastScheduledAdded || 0,
    lastScheduledSkipped: state.lastScheduledSkipped || 0,
    lastScheduledError: state.lastScheduledError || '',
    nextRunHint: nextRegistryRunHint(),
    autoEnabled: String(process.env.VED_REGISTRY_AUTO_ENABLED || '1').trim() !== '0',
    autoSearch: {
      schedule: nextRegistryRunHint(),
      mode: 'rotation',
      description:
        'Щоночі о 02:00 (Kyiv) один ШІ-пошук за фіксованим профілем обраного типу обладнання; наступної ночі — наступний тип по колу. Дублікати постачальників пропускаються.',
      nextEquipmentType: equipmentTypeLabel(nextProfile.equipmentType),
      nextEquipmentTypeKey: nextProfile.equipmentType,
      nextTechnicalRequirements: nextProfile.technicalRequirements,
      nextExtraSearchHint: nextProfile.extraSearchHint,
      rotation: AUTO_SEARCH_PROFILES.map((p) => ({
        equipmentType: p.equipmentType,
        label: equipmentTypeLabel(p.equipmentType),
        technicalRequirements: p.technicalRequirements,
        extraSearchHint: p.extraSearchHint,
      })),
    },
  };
}

function pickAutoSearchProfile(rotationIndex) {
  const idx = ((rotationIndex || 0) % AUTO_SEARCH_PROFILES.length + AUTO_SEARCH_PROFILES.length) % AUTO_SEARCH_PROFILES.length;
  return { profile: AUTO_SEARCH_PROFILES[idx], nextIndex: (idx + 1) % AUTO_SEARCH_PROFILES.length };
}

function bindResearchSessionModel(model) {
  VedResearchSession = model;
}

async function runRegistrySearch(params, options = {}) {
  if (!vedAiEnabled()) {
    throw new Error('ШІ-модуль ВЕД не налаштовано (потрібен OPENAI_API_KEY)');
  }

  const equipmentTypes = normalizeEquipmentTypes(params);
  const equipmentType = equipmentTypes[0];
  const equipmentName = String(params?.equipmentName || '').trim();
  let technicalRequirements = String(params?.technicalRequirements || '').trim();
  if (!technicalRequirements) {
    technicalRequirements = buildDefaultTechnicalRequirementsForTypes(equipmentTypes);
  }
  const extraSearchHint = String(params?.extraSearchHint || '').trim().slice(0, 200);
  let quantity = Number(params?.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;

  const virtualDoc = {
    requestNumber: options.source === 'scheduled' ? 'АВТО-РЕЄСТР' : 'РЕЄСТР',
    equipmentType,
    equipmentTypes,
    equipmentName,
    technicalRequirements,
    quantity,
    managerComment: '',
    desiredDeliveryDate: '',
  };

  const { labels: excludeSuppliers } = await loadExistingDedupKeys();

  let session = null;
  if (VedResearchSession) {
    session = await VedResearchSession.create({
      vedImportRequestId: null,
      requestNumber: '',
      mode: 'standalone',
      equipmentType,
      equipmentName,
      technicalRequirements,
      quantity,
      status: 'running',
      extraSearchHint,
      createdByLogin: options.addedByLogin || 'system',
      createdByName: options.addedByName || (options.source === 'scheduled' ? 'Авто-оновлення' : ''),
    });
  }

  try {
    const result = await runVedSupplierResearch(virtualDoc, { extraSearchHint, excludeSuppliers });
    const mergeResult = await mergeCandidatesIntoRegistry(result.candidates, {
      equipmentTypes,
      equipmentType,
      equipmentName,
      source: options.source || 'manual',
      researchSessionId: session?._id || null,
      addedByLogin: options.addedByLogin || '',
      addedByName: options.addedByName || '',
    });

    if (session) {
      session.status = 'completed';
      session.searchQueries = result.searchQueries || [];
      session.webContextPreview = result.webContextPreview || '';
      session.userPromptPreview = result.userPromptPreview || '';
      session.sources = result.sources || [];
      session.summary = result.summary || '';
      session.recommendations = result.recommendations || [];
      session.candidates = result.candidates || [];
      session.llmModel = result.llmModel || '';
      session.disclaimer = result.disclaimer || '';
      session.hasWebSearch = Boolean(result.hasWebSearch);
      await session.save();
    }

    return {
      sessionId: session?._id || null,
      added: mergeResult.added,
      skipped: mergeResult.skipped,
      candidatesFound: (result.candidates || []).length,
      summary: result.summary || '',
      equipmentTypes,
    };
  } catch (runErr) {
    if (session) {
      session.status = 'failed';
      session.error = String(runErr.message || runErr).slice(0, 500);
      await session.save();
    }
    throw runErr;
  }
}

let scheduledJobRunning = false;

async function runScheduledRegistryUpdate() {
  if (scheduledJobRunning) return { skipped: true, reason: 'already_running' };
  scheduledJobRunning = true;

  try {
    const state = await getRegistryState();
    if (!shouldRunScheduledRegistry(state)) {
      return { skipped: true, reason: 'not_due' };
    }

    const { profile, nextIndex } = pickAutoSearchProfile(state.rotationIndex || 0);
    console.log('[ved-registry] scheduled search:', profile.equipmentType);

    const result = await runRegistrySearch(
      {
        equipmentType: profile.equipmentType,
        equipmentName: profile.equipmentName,
        technicalRequirements: profile.technicalRequirements,
        quantity: 1,
        extraSearchHint: profile.extraSearchHint,
      },
      { source: 'scheduled', addedByLogin: 'system', addedByName: 'Авто-оновлення (02:00)' }
    );

    state.lastScheduledRunAt = new Date();
    state.lastScheduledEquipmentType = profile.equipmentType;
    state.scheduledRunCount = (state.scheduledRunCount || 0) + 1;
    state.rotationIndex = nextIndex;
    state.lastScheduledAdded = result.added.length;
    state.lastScheduledSkipped = result.skipped;
    state.lastScheduledError = '';
    await state.save();

    console.log(
      `[ved-registry] scheduled done: +${result.added.length} new, ${result.skipped} skipped (${profile.equipmentType})`
    );
    return { skipped: false, ...result, equipmentType: profile.equipmentType };
  } catch (e) {
    console.error('[ved-registry] scheduled error:', e.message);
    try {
      const state = await getRegistryState();
      state.lastScheduledRunAt = new Date();
      state.lastScheduledError = String(e.message || e).slice(0, 500);
      await state.save();
    } catch {
      /* ignore */
    }
    return { skipped: false, error: e.message };
  } finally {
    scheduledJobRunning = false;
  }
}

function scheduleVedSupplierRegistryJob() {
  const intervalMs = Math.max(5, parseInt(String(process.env.VED_REGISTRY_CHECK_MINUTES || '10'), 10) || 10) * 60 * 1000;

  setInterval(() => {
    runScheduledRegistryUpdate().catch((e) => console.error('[ved-registry] interval', e.message));
  }, intervalMs);

  setTimeout(() => {
    runScheduledRegistryUpdate().catch((e) => console.error('[ved-registry] startup check', e.message));
  }, 60000);

  console.log(`[ved-registry] scheduler active — ${nextRegistryRunHint()}, check every ${intervalMs / 60000} min`);
}

async function deleteRegistryByIds(rawIds) {
  const ids = [
    ...new Set(
      (Array.isArray(rawIds) ? rawIds : [])
        .map((id) => String(id || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    ),
  ];
  if (!ids.length) {
    throw new Error('Не обрано жодного запису для видалення');
  }
  if (ids.length > 200) {
    throw new Error('За один раз можна видалити не більше 200 записів');
  }
  const result = await VedSupplierRegistry.deleteMany({ _id: { $in: ids } });
  return { deleted: result.deletedCount || 0, requested: ids.length };
}

module.exports = {
  enrichRegistryRow,
  VedSupplierRegistry,
  deleteRegistryByIds,
  bindResearchSessionModel,
  buildSupplierDedupKey,
  candidateToRegistryRow,
  mergeCandidatesIntoRegistry,
  runRegistrySearch,
  runScheduledRegistryUpdate,
  scheduleVedSupplierRegistryJob,
  getRegistryMeta,
  getRegistryState,
  EQUIPMENT_TYPES,
};
