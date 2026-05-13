/**
 * Контекст для GPT-асистента: пошук клієнтів CRM і заявок за ЄДРПОУ, телефоном,
 * ПІБ/контактом, заводським/серійним номером (поля задач як у таблицях DTS).
 */
const mongoose = require('mongoose');
const {
  collectRequestNumbers,
  summarizeOneTask,
  ASSISTANT_PRIOR_SCAN,
  userMessageIsBareRequestPing,
} = require('./assistantTaskLookup');

const MAX_TASKS = 8;
const MAX_CLIENTS = 6;
const MAX_DIGIT_RUNS = 4;

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isElevatedRole(roleLow) {
  return ['admin', 'administrator', 'mgradm'].includes(String(roleLow || '').toLowerCase());
}

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

const ENGINEER_SLOT_KEYS = ['engineer1', 'engineer2', 'engineer3', 'engineer4', 'engineer5', 'engineer6'];

function buildNonManagerAccessFilter(profile) {
  const parts = [];
  const reg = regionFilterFromUserRegion(profile?.region);
  if (reg) parts.push(reg);
  const nm = String(profile?.name || '').trim();
  if (nm) {
    const rx = new RegExp(`^${escapeRegex(nm)}$`, 'i');
    parts.push({ $or: ENGINEER_SLOT_KEYS.map((k) => ({ [k]: rx })) });
  }
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

  const normalizeEdrpouLocal = (e) => String(e || '').replace(/\s+/g, '').toLowerCase();
  const edrpouSet = new Set();
  const nameSet = new Set();
  for (const c of rows || []) {
    const e = normalizeEdrpouLocal(c.edrpou);
    if (e) edrpouSet.add(e);
    const n = String(c.name || '').trim().toLowerCase();
    if (n) nameSet.add(n);
  }
  return { edrpouSet, nameSet };
}

function taskAllowedForManager(task, { edrpouSet, nameSet }) {
  const normalizeEdrpouLocal = (e) => String(e || '').replace(/\s+/g, '').toLowerCase();
  const e = normalizeEdrpouLocal(task.edrpou);
  if (e && edrpouSet.has(e)) return true;
  const label = String(task.client || task.company || '').trim().toLowerCase();
  if (label && nameSet.has(label)) return true;
  return false;
}

/** 8–10 цифр, не частина довшого числового рядка. */
function extractEdrpouDigitRuns(text) {
  const s = String(text || '');
  const out = new Set();
  const re = /(?:^|[^\d])(\d{8,10})(?!\d)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.add(m[1]);
    if (out.size >= MAX_DIGIT_RUNS) break;
  }
  return [...out];
}

/** Ключ для пошуку: 38… → 0XXXXXXXXX або перші збіги 0\d{9} у суцільній цифровій формі. */
function extractUaPhoneKeys(text) {
  const digits = String(text || '').replace(/\D/g, '');
  const out = new Set();

  let i = 0;
  while (i <= digits.length - 10) {
    const slice10 = digits.slice(i, i + 10);
    if (slice10[0] === '0') {
      out.add(slice10);
      i += 10;
      continue;
    }
    i += 1;
  }

  if (digits.startsWith('380') && digits.length >= 12) {
    out.add(`0${digits.slice(3, 12)}`);
  }

  return [...out].slice(0, 5);
}

function wantsDiscoveryIntent(messageText) {
  const s = String(messageText || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!s) return false;
  const hasVerb =
    /знайди|найди|знайти|найти|шукай|шукати|шукаю|пошук|відшук|покажи|показат|розкаж|де\s|хто\s+(такий|це)|є\s+в\s+баз|інфо\s+про|дані\s+(про|по)|find|lookup|search|who\s+is/.test(
      s,
    );
  const hasTopic =
    /єдрпоу|едрпоу|edrpou|єрдпоу|ідентифікаційний|клієнт|crm|контакт|піб|телефон|тел\.|мобільн|заводськ|заводський|серійн|номер\s+облад|двигун|обладнан|організація|компанія|фірма|іпн/.test(
      s,
    );
  return hasVerb && hasTopic;
}

const MAX_TEXT_Q = 96;

function extractFreeTextSearchQuery(messageText) {
  let s = String(messageText || '').trim();
  s = s.replace(/копіювати/gi, ' ').replace(/\bcopy\b/gi, ' ');
  s = s.replace(/єдрпоу|едрпоу|edrpou/gi, ' ');
  s = s.replace(/\b([A-Za-zА-Яа-яІіЇїЄєҐґ]{1,12})\s*-\s*(\d{1,12})\b/gi, ' ');
  s = s.replace(/\b([A-Za-zА-Яа-яІіЇїЄєҐґ]{1,12})(\d{2,})\b/gi, ' ');
  s = s.replace(/(?:^|[^\d])(\d{8,10})(?!\d)/g, ' ');
  s = s.replace(/(?:\+?38)?0\d{9}/g, ' ');
  s = s.replace(
    /знайди|найди|знайти|найти|шукай|шукати|шукаю|пошук|покажи|мені|дай|дані|ще|раз|скажи|розкажи|будь\s+ласка|переглянути/gi,
    ' ',
  );
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length < 3 || s.length > MAX_TEXT_Q) return '';
  if (/^[\d\s\-+.,;:№"'«»()/]+$/i.test(s)) return '';
  return s;
}

function truncateField(val, max = 600) {
  const t = String(val == null ? '' : val).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function maskPhonesSingle(val) {
  const x = String(val || '').trim();
  if (!x) return '';
  return maskPhones(x);
}

function maskPhones(s) {
  return String(s)
    .replace(/\b380\d{9}\b/g, '***')
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, (frag) =>
      frag.length > 10 ? `${frag.slice(0, 4)}…${frag.slice(-3)}` : frag,
    );
}

function maskEdrpouBrief(edrpou) {
  const x = String(edrpou || '').replace(/\s+/g, '').toLowerCase();
  if (!x) return '';
  if (x.length <= 4) return '***';
  return `***…${x.slice(-6)}`;
}

function formatContactsArray(contacts) {
  if (!Array.isArray(contacts) || !contacts.length) return '';
  const lines = contacts
    .slice(0, 5)
    .map((c) => {
      const p = truncateField(c?.person, 80);
      const ph = c?.phone ? truncateField(maskPhonesSingle(String(c.phone)), 120) : '';
      if (!p && !ph) return '';
      return ph ? `${p || '—'} — ${ph}` : p;
    })
    .filter(Boolean);
  return lines.join('; ');
}

function formatClientBlock(client, index, { restricted }) {
  const n = index + 1;
  if (restricted) {
    return `[Клієнт CRM ${n}] Запис знайдено; деталі обмежені (клієнт закріплений за іншим менеджером).\nНазва: ${truncateField(client.name, 200) || '—'}\n`;
  }
  let block = `[Клієнт CRM ${n}]\n`;
  block += `Назва / об'єкт: ${truncateField(client.name, 280) || '—'}\n`;
  if (client.edrpou) block += `ЄДРПОУ у базі (скорочено): ${maskEdrpouBrief(client.edrpou)}\n`;
  if (client.region) block += `Регіон: ${truncateField(client.region, 80)}\n`;
  const cp = truncateField(client.contactPerson, 120);
  if (cp) block += `Контактна особа: ${cp}\n`;
  const cphone = truncateField(client.contactPhone, 40);
  if (cphone) block += `Тел. контактної особи: ${maskPhonesSingle(cphone)}\n`;
  const extraContacts = formatContactsArray(client.contacts);
  if (extraContacts) block += `Додаткові контакти: ${extraContacts}\n`;
  if (client.address) block += `Адреса: ${truncateField(client.address, 260)}\n`;
  if (client.email) block += `Email: ${truncateField(client.email, 80)}\n`;
  if (client.notes) block += `Нотатки: ${truncateField(client.notes, 200)}\n`;
  return `${block}\n`;
}

function clientAccessRestricted(client, login, elevated) {
  if (elevated) return false;
  const isOwner =
    client?.assignedManagerLogin === login || client?.assignedManagerLogin2 === login;
  return !isOwner;
}

function buildClientOrForLiteral(q) {
  const esc = escapeRegex(q.trim());
  if (esc.length < 2) return null;
  const rx = new RegExp(esc, 'i');
  return {
    $or: [
      { name: rx },
      { edrpou: rx },
      { contactPerson: rx },
      { contactPhone: rx },
      { address: rx },
      { 'contacts.person': rx },
      { 'contacts.phone': rx },
    ],
  };
}

function buildTaskOrForLiteral(q) {
  const esc = escapeRegex(q.trim());
  if (esc.length < 2) return null;
  const rx = new RegExp(esc, 'i');
  return {
    $or: [
      { edrpou: rx },
      { contactPerson: rx },
      { contactPhone: rx },
      { engineSerial: rx },
      { customerEquipmentNumber: rx },
      { equipmentSerial: rx },
      { client: rx },
      { company: rx },
      { requestDesc: rx },
      { description: rx },
      { equipment: rx },
      { work: rx },
      { requestNumber: rx },
    ],
  };
}

function edrpouClientBranch(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 8 || d.length > 10) return null;
  const esc = escapeRegex(d);
  return {
    $or: [
      { edrpou: new RegExp(`^\\s*${esc}\\s*$`, 'i') },
      { edrpou: new RegExp(esc, 'i') },
    ],
  };
}

/** Останні 9 цифр для узгодження з форматом у полі. */
function phoneClientBranch(phone0) {
  const p = String(phone0 || '').replace(/\D/g, '');
  if (p.length < 10) return null;
  const tail = p.slice(-9);
  const esc = escapeRegex(tail);
  return {
    $or: [{ contactPhone: new RegExp(esc, 'i') }, { 'contacts.phone': new RegExp(esc, 'i') }],
  };
}

function phoneTaskMongoBranch(phone0) {
  const p = String(phone0 || '').replace(/\D/g, '');
  if (p.length < 10) return null;
  const tail = p.slice(-9);
  const esc = escapeRegex(tail);
  return { contactPhone: new RegExp(esc, 'i') };
}

/**
 * @param {{ login?: string, role?: string, name?: string }} userJwt
 * @param {string} messageText
 * @param {{ priorUserMessages?: string[], priorAssistantMessages?: string[], dbUserLean?: Record<string, unknown> | null }} [opts]
 */
async function buildDiscoveryContextForLlm(userJwt, messageText, opts = {}) {
  const login = String(userJwt?.login || '').trim();
  if (!login) {
    return { textForLlm: '', meta: {} };
  }

  const TaskModel = mongoose.models.Task;
  const UserModel = mongoose.models.User;
  const ClientModel = mongoose.models.Client;
  if (!TaskModel || !ClientModel) {
    return { textForLlm: '', meta: {} };
  }

  let priorUser = opts.priorUserMessages || [];
  if (priorUser.length > ASSISTANT_PRIOR_SCAN.maxMessages) {
    priorUser = priorUser.slice(-ASSISTANT_PRIOR_SCAN.maxMessages);
  }

  let priorAssist = opts.priorAssistantMessages || [];
  if (priorAssist.length > ASSISTANT_PRIOR_SCAN.maxAssistantMessages) {
    priorAssist = priorAssist.slice(-ASSISTANT_PRIOR_SCAN.maxAssistantMessages);
  }

  const recentSlice = [...priorUser.slice(-4), String(messageText || '')].join('\n');
  const digits = extractEdrpouDigitRuns(recentSlice);
  const phones = [...new Set([...extractUaPhoneKeys(recentSlice), ...extractUaPhoneKeys(messageText)])];

  const wantsIntent = wantsDiscoveryIntent(messageText);
  const textQ = wantsIntent ? extractFreeTextSearchQuery(messageText) : '';

  if (!wantsIntent && userMessageIsBareRequestPing(messageText)) {
    return { textForLlm: '', meta: {} };
  }

  const curPhones = extractUaPhoneKeys(messageText);
  const curDigits = extractEdrpouDigitRuns(messageText);

  /**
   * Повідомлення лише про номер заявки KV/DP — без клієнтського контексту в цьому рядку.
   */
  const reqFromCurrent = collectRequestNumbers(messageText, [], []);
  if (
    reqFromCurrent.length > 0 &&
    !wantsIntent &&
    !curDigits.length &&
    !curPhones.length &&
    !textQ
  ) {
    return { textForLlm: '', meta: {} };
  }

  const hasSignals = digits.length > 0 || phones.length > 0 || textQ.length >= 3;
  if (!hasSignals) {
    return { textForLlm: '', meta: {} };
  }

  /** @type {import('mongoose').LeanDocument<{ region?: string, role?: string, name?: string }> | null | undefined} */
  let dbUser;
  if (Object.prototype.hasOwnProperty.call(opts, 'dbUserLean')) {
    dbUser = opts.dbUserLean === undefined ? null : opts.dbUserLean;
  } else {
    dbUser = await UserModel.findOne({ login }).select('region role name').lean();
  }

  const jwtRole = String(userJwt?.role || '').toLowerCase();
  const dbRole = String(dbUser?.role || '').toLowerCase();
  const elevated = isElevatedRole(jwtRole) || isElevatedRole(dbRole);
  const isManagerOnly = !elevated && (jwtRole === 'manager' || dbRole === 'manager');

  const clientBranches = [];
  const taskBranches = [];
  for (const d of digits) {
    const cb = edrpouClientBranch(d);
    if (cb) {
      clientBranches.push(cb);
      const esc = escapeRegex(String(d).replace(/\D/g, ''));
      taskBranches.push({ edrpou: new RegExp(esc, 'i') });
    }
  }
  for (const ph of phones) {
    const cb = phoneClientBranch(ph);
    const tb = phoneTaskMongoBranch(ph);
    if (cb) clientBranches.push(cb);
    if (tb) taskBranches.push(tb);
  }
  if (textQ.length >= 3) {
    const c = buildClientOrForLiteral(textQ);
    const t = buildTaskOrForLiteral(textQ);
    if (c) clientBranches.push(c);
    if (t) taskBranches.push(t);
  }

  if (!clientBranches.length && !taskBranches.length) {
    return { textForLlm: '', meta: {} };
  }

  const clientFilterRaw = clientBranches.length ? { $or: clientBranches } : null;
  const taskFilterLiteral = taskBranches.length ? { $or: taskBranches } : null;

  /** @type {Record<string, unknown> | null} */
  let taskAccess = null;
  if (elevated) {
    taskAccess = null;
  } else if (isManagerOnly) {
    const reg = regionFilterFromUserRegion(dbUser?.region);
    taskAccess = reg || null;
  } else {
    taskAccess = buildNonManagerAccessFilter({
      region: dbUser?.region,
      name: String(dbUser?.name || userJwt?.name || '').trim(),
    });
  }

  const taskQuery =
    taskFilterLiteral && taskAccess
      ? { $and: [taskFilterLiteral, taskAccess] }
      : taskFilterLiteral || (taskAccess ? { $and: [taskAccess] } : null);

  let clientQuery = clientFilterRaw;
  if (clientQuery && isManagerOnly) {
    clientQuery = {
      $and: [
        clientQuery,
        { $or: [{ assignedManagerLogin: login }, { assignedManagerLogin2: login }] },
      ],
    };
  }

  /** @type {import('mongoose').LeanDocument<Record<string, unknown>>[]} */
  let clients = [];
  if (clientQuery) {
    clients = await ClientModel.find(clientQuery).sort({ updatedAt: -1 }).limit(MAX_CLIENTS).lean();
  }

  /** @type {import('mongoose').LeanDocument<Record<string, unknown>>[]} */
  let tasks = [];
  if (taskQuery) {
    tasks = await TaskModel.find(taskQuery).sort({ requestDate: -1 }).limit(MAX_TASKS).lean();
    if (isManagerOnly && tasks.length) {
      const keys = await loadManagerClientKeys(login);
      tasks = tasks.filter((t) => taskAllowedForManager(t, keys));
    }
  }

  if (!clients.length && !tasks.length) {
    const tried = [
      digits.length ? `ЄДРПОУ / 8–10 цифр: ${digits.join(', ')}` : '',
      phones.length ? `телефони: ${phones.join(', ')}` : '',
      textQ ? `текст: «${textQ}»` : '',
    ]
      .filter(Boolean)
      .join('; ');
    const hint =
      `[DTS] За запитом асистента (${tried || '—'}) записів клієнта CRM або сервісної заявки в базі DTS не знайдено. ` +
      'Можливо, інший формат ЄДРПОУ/телефону в картці, дані лише у вільному тексті без структурних полів, або обмеження доступу за роллю/регіоном. ' +
      'Запропонуй глобальний пошук на панелі «Сервісна служба» та пошук на вкладці «Клієнти». Не вигадуй ПІБ, телефони й ЄДРПОУ.';
    return { textForLlm: hint, meta: { discovery: { clients: 0, tasks: 0 } } };
  }

  const sections = [];
  if (clients.length) {
    sections.push(
      '[DTS] Записи з довідника клієнтів (CRM) за пошуком (не розголошувати зайвого):',
      ...clients.map((c, i) =>
        formatClientBlock(c, i, { restricted: clientAccessRestricted(c, login, elevated) }),
      ),
    );
  }
  if (tasks.length) {
    sections.push(
      '[DTS] Сервісні заявки, де співпало поле (ЄДРПОУ / контактна особа / телефон / серійні чи заводські номери тощо):',
      ...tasks.map((t, i) => summarizeOneTask(t, i)),
    );
  }

  const note =
    '\n\n[DTS-hint] Передай користувачу структуровано: ЄДРПОУ (як у блоці), контактну особу, телефон стримано, заводський/серійний номер з рядка заявки. Якщо є і CRM, і заявки — коротко поясни зв’язок.';

  return {
    textForLlm: `${sections.join('\n')}${note}`,
    meta: { discovery: { clients: clients.length, tasks: tasks.length } },
  };
}

module.exports = {
  buildDiscoveryContextForLlm,
};
