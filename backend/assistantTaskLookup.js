/**
 * Контекст заявки для чату асистента: пошук Task за номером (KV-1022 тощо)
 * з обмеженням видимості (регіон, закріплені клієнти для менеджера, слоти інженера).
 */
const mongoose = require('mongoose');

const MAX_SUMMARY_CHARS_PER_FIELD = 600;
const MAX_TASKS = 8;
const MAX_DISTINCT_REQUEST_NUMBERS = 12;
const MAX_PRIOR_USER_MESSAGES = 14;
const MAX_PRIOR_ASSISTANT_MESSAGES = 4;
const MAX_CHARS_PER_PRIOR_MESSAGE = 6000;

const ENGINEER_SLOT_KEYS = ['engineer1', 'engineer2', 'engineer3', 'engineer4', 'engineer5', 'engineer6'];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Виділяє номери заявок на кшталт KV-1022, NU - 0045 тощо.
 * @param {string} text
 * @returns {string[]}
 */
function extractRequestNumbers(text) {
  const s = String(text || '');
  const found = new Set();
  const re = /\b([A-Za-zА-Яа-яІіЇїЄєҐґ]{1,12})\s*-\s*(\d{2,10})\b/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const left = String(m[1] || '').replace(/\s+/g, '');
    const num = String(m[2] || '');
    found.add(`${left}-${num}`);
    if (found.size >= MAX_DISTINCT_REQUEST_NUMBERS) break;
  }
  return [...found];
}

/**
 * Збирає унікальні номери з поточного тексту, попередніх реплік користувача
 * та останніх відповідей асистента (коли номер лише там, напр. «за заявкою KV-1022»).
 * @param {string} primary
 * @param {string[] | undefined} priorUserMessages
 * @param {string[] | undefined} priorAssistantMessages
 */
function collectRequestNumbers(primary, priorUserMessages, priorAssistantMessages) {
  const clip = (p) => String(p || '').slice(0, MAX_CHARS_PER_PRIOR_MESSAGE);
  const chunks = [
    primary,
    ...(priorUserMessages || []).map(clip),
    ...(priorAssistantMessages || []).map(clip),
  ];
  const out = new Set();
  for (const ch of chunks) {
    for (const n of extractRequestNumbers(ch)) {
      out.add(n);
      if (out.size >= MAX_DISTINCT_REQUEST_NUMBERS) return [...out];
    }
  }
  return [...out];
}

function normalizeEdrpou(e) {
  return String(e || '').replace(/\s+/g, '').toLowerCase();
}

/** Частково прихований ЄДРПОУ для підказки асистента (не повне значення). */
function maskEdrpouBrief(edrpou) {
  const x = normalizeEdrpou(edrpou);
  if (!x) return '';
  if (x.length <= 4) return '***';
  return `***…${x.slice(-6)}`;
}

function truncateField(val, max = MAX_SUMMARY_CHARS_PER_FIELD) {
  const t = String(val == null ? '' : val).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function maskPhones(s) {
  return String(s)
    .replace(/\b380\d{9}\b/g, '***')
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, (x) => (x.length > 10 ? `${x.slice(0, 4)}…${x.slice(-3)}` : x));
}

/**
 * @param {Record<string, unknown>} t — lean Task
 */
function summarizeOneTask(t, index) {
  const client = truncateField(t.client || t.company || '');
  const addr = truncateField(t.address);
  const desc = truncateField(t.requestDesc);
  const equip = truncateField(t.equipment);
  const work = truncateField(t.work);
  const edrpouBrief = maskEdrpouBrief(t.edrpou);
  const contactPerson = truncateField(t.contactPerson, 120);
  const engParts = [
    truncateField(t.engineer1, 80),
    truncateField(t.engineer2, 80),
    truncateField(t.engineer3, 80),
    truncateField(t.engineer4, 80),
    truncateField(t.engineer5, 80),
    truncateField(t.engineer6, 80),
  ].filter(Boolean);

  const wh = truncateField(t.approvedByWarehouse, 40);
  const acc = truncateField(t.approvedByAccountant, 40);
  const rm = truncateField(t.approvedByRegionalManager, 40);

  let block = `[Заявка ${index + 1}]\n`;
  block += `Номер: ${truncateField(t.requestNumber, 40) || '—'}\n`;
  block += `Статус: ${truncateField(t.status, 120) || '—'}\n`;
  block += `Регіон: ${truncateField(t.serviceRegion, 120) || '—'}\n`;
  if (edrpouBrief) block += `ЄДРПОУ (скорочено): ${edrpouBrief}\n`;
  if (client) block += `Клієнт / об'єкт: ${client}\n`;
  if (contactPerson) block += `Контакт: ${contactPerson}\n`;
  if (addr) block += `Адреса: ${addr}\n`;
  if (desc) block += `Опис: ${desc}\n`;
  if (equip || work) block += `Обладнання / роботи: ${equip}${equip && work ? ' · ' : ''}${work}\n`;
  if (engParts.length) block += `Інженери: ${engParts.join(' · ')}\n`;
  if (wh || acc || rm) {
    const parts = [`завсклад: ${wh || '—'}`, `бухгалтер: ${acc || '—'}`];
    if (rm) parts.push(`регіон. менедж.: ${rm}`);
    block += `Підтвердження: ${parts.join('; ')}\n`;
  }
  block += `Дата заявки: ${t.requestDate ? String(t.requestDate) : '—'}\n`;
  return maskPhones(block);
}

function isElevatedRole(roleLow) {
  return ['admin', 'administrator', 'mgradm'].includes(String(roleLow || '').toLowerCase());
}

/** @returns {Record<string, unknown> | undefined} */
function regionFilterFromUserRegion(regionRaw) {
  const raw = String(regionRaw || '').trim();
  if (!raw || raw === 'Україна' || /загальн/i.test(raw)) return undefined;

  if (/\s*,\s*/.test(raw)) {
    const parts = [...new Set(raw.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean))];
    if (!parts.length) return undefined;
    return { serviceRegion: { $in: parts } };
  }

  return { serviceRegion: raw };
}

/** @returns {Record<string, unknown> | null} */
function engineerNameFilter(displayName) {
  const nm = String(displayName || '').trim();
  if (!nm) return null;
  const rx = new RegExp(`^${escapeRegex(nm)}$`, 'i');
  return { $or: ENGINEER_SLOT_KEYS.map((k) => ({ [k]: rx })) };
}

/**
 * Регіон користувача АБО призначення в слотах інженера (для сервісу/оператора тощо).
 * @param {{ region?: string, name?: string }} profile
 * @returns {Record<string, unknown> | null}
 */
function buildNonManagerAccessFilter(profile) {
  const parts = [];
  const reg = regionFilterFromUserRegion(profile?.region);
  if (reg) parts.push(reg);
  const eng = engineerNameFilter(profile?.name);
  if (eng) parts.push(eng);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return { $or: parts };
}

async function loadManagerClientKeys(login) {
  const Client = mongoose.models.Client;
  if (!Client) return { edrpouSet: new Set(), nameSet: new Set() };
  const rows = await Client.find({
    $or: [{ assignedManagerLogin: login }, { assignedManagerLogin2: login }],
  })
    .select('edrpou name')
    .lean()
    .catch(() => []);

  const edrpouSet = new Set();
  const nameSet = new Set();
  for (const c of rows || []) {
    const e = normalizeEdrpou(c.edrpou);
    if (e) edrpouSet.add(e);
    const n = String(c.name || '').trim().toLowerCase();
    if (n) nameSet.add(n);
  }
  return { edrpouSet, nameSet };
}

function taskAllowedForManager(task, { edrpouSet, nameSet }) {
  const e = normalizeEdrpou(task.edrpou);
  if (e && edrpouSet.has(e)) return true;
  const label = String(task.client || task.company || '').trim().toLowerCase();
  if (label && nameSet.has(label)) return true;
  return false;
}

/**
 * @param {{ login?: string, role?: string, name?: string }} userJwt
 * @param {string} messageText
 * @param {{ priorUserMessages?: string[], priorAssistantMessages?: string[] }} [opts]
 * @returns {Promise<{ textForLlm: string, meta: { requestNumbers: string[], matched: number } }>}
 */
async function buildTaskContextForLlm(userJwt, messageText, opts = {}) {
  const login = String(userJwt?.login || '').trim();
  let priorSlice = opts.priorUserMessages || [];
  if (priorSlice.length > MAX_PRIOR_USER_MESSAGES) {
    priorSlice = priorSlice.slice(-MAX_PRIOR_USER_MESSAGES);
  }
  let priorAssistSlice = opts.priorAssistantMessages || [];
  if (priorAssistSlice.length > MAX_PRIOR_ASSISTANT_MESSAGES) {
    priorAssistSlice = priorAssistSlice.slice(-MAX_PRIOR_ASSISTANT_MESSAGES);
  }

  const nums = collectRequestNumbers(messageText, priorSlice, priorAssistSlice);

  const empty = () => ({
    textForLlm: '',
    meta: { requestNumbers: nums, matched: 0 },
  });

  if (!login || nums.length === 0) return empty();

  const TaskModel = mongoose.models.Task;
  const UserModel = mongoose.models.User;
  if (!TaskModel || !UserModel) return empty();

  const dbUser = await UserModel.findOne({ login }).select('region role name').lean();
  const jwtRole = String(userJwt?.role || '').toLowerCase();
  const dbRole = String(dbUser?.role || '').toLowerCase();
  const elevated = isElevatedRole(jwtRole) || isElevatedRole(dbRole);
  const isManagerOnly = !elevated && (jwtRole === 'manager' || dbRole === 'manager');

  const numberOr = {
    $or: nums.map((n) => ({
      requestNumber: new RegExp(`^${escapeRegex(n)}$`, 'i'),
    })),
  };

  /** @type {Record<string, unknown>} */
  let filter;

  if (elevated) {
    filter = numberOr;
  } else if (isManagerOnly) {
    const reg = regionFilterFromUserRegion(dbUser?.region);
    filter = reg ? { $and: [numberOr, reg] } : numberOr;
  } else {
    const engProfile = {
      region: dbUser?.region,
      name: String(dbUser?.name || userJwt?.name || '').trim(),
    };
    const acc = buildNonManagerAccessFilter(engProfile);
    filter = acc ? { $and: [numberOr, acc] } : numberOr;
  }

  let tasks = await TaskModel.find(filter).sort({ requestDate: -1 }).limit(MAX_TASKS).lean();

  if (isManagerOnly && tasks.length) {
    const keys = await loadManagerClientKeys(login);
    tasks = tasks.filter((t) => taskAllowedForManager(t, keys));
  }

  const meta = { requestNumbers: nums, matched: tasks.length };

  if (tasks.length === 0) {
    const hint =
      '[DTS] У діалозі згадано номер(и) заявки, але запис не знайдено серед доступних цьому користувачу (регіон, закріплені клієнти чи призначення). Не вигадуйте дані заявки.';
    return { textForLlm: hint, meta };
  }

  const parts = tasks.map((t, i) => summarizeOneTask(t, i));
  const header =
    '[DTS] Дані з системи за згаданими номерами (лише для відповіді; не розголошуйте стороннім без потреби):';
  return { textForLlm: `${header}\n\n${parts.join('\n')}`, meta };
}

module.exports = {
  extractRequestNumbers,
  collectRequestNumbers,
  buildTaskContextForLlm,
  ASSISTANT_PRIOR_SCAN: {
    maxMessages: MAX_PRIOR_USER_MESSAGES,
    maxAssistantMessages: MAX_PRIOR_ASSISTANT_MESSAGES,
    maxChars: MAX_CHARS_PER_PRIOR_MESSAGE,
  },
};
