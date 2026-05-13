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


/** На кордон Mongo $or занадто великої кількості гілок. */
const MAX_OR_BRANCHES = 80;

function leafSignature(leaf) {
  const k = Object.keys(leaf)[0];
  const v = leaf[k];
  if (v instanceof RegExp) return `${k}:re:${v.source}:${v.flags}`;
  try {
    return `${k}:${JSON.stringify(v)}`;
  } catch {
    return `${k}:obj`;
  }
}

function dedupeMongoLeaves(leaves) {
  const seen = new Set();
  const out = [];
  for (const leaf of leaves) {
    const sig = leafSignature(leaf);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(leaf);
    if (out.length >= MAX_OR_BRANCHES) break;
  }
  return out;
}

const MAX_TASKS_SEARCH = 20;
const MAX_CLIENTS = 6;
const MAX_DIGIT_RUNS = 4;

/** Як normalizeProcurementEdrpouDigits: лише цифри для порівняння записів із пробілами/роздільниками. */
function normalizeEdrpouDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

/** Телефон у вигляді цифр; країна UA → локальний 0XXXXXXXXX. */
function normalizePhoneDigits(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('380') && d.length >= 12) d = `0${d.slice(3)}`;
  return d;
}

/** Номер/РН для грубого співставлення із запитом. */
function normalizeTokenLoose(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeSerialLoose(v) {
  return String(v || '').replace(/[\s\-_.]/gi, '').toUpperCase();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Співставлення запису ЄДРПОУ з урахуванням нецифрових символів у полі БД (наприклад «UA 22859846»). */
function edrpouDigitFieldsMatch(normalizedStoredDigits, normalizedQueryDigits) {
  const s = normalizedStoredDigits || '';
  const q = normalizedQueryDigits || '';
  if (q.length < 8 || s.length === 0) return false;
  if (s === q || s.includes(q)) return true;
  const flex = [...q].join('\\D*');
  try {
    return new RegExp(flex).test(s);
  } catch {
    return false;
  }
}

/** @returns {{ leaf: Record<string, RegExp>; label: string }[]} */
function buildEdrpouMongoLeaves(digitRun) {
  const d = normalizeEdrpouDigits(digitRun);
  if (d.length < 8 || d.length > 10) return [];
  const esc = escapeRegex(d);
  const flex = [...d].map((ch) => escapeRegex(ch)).join('\\D*');
  return [
    { leaf: { edrpou: new RegExp(`^\\s*${esc}\\s*$`, 'i') }, label: 'ЄДРПОУ (точний вигляд)' },
    { leaf: { edrpou: new RegExp(flex, 'i') }, label: 'ЄДРПОУ з роздільниками між цифрами' },
    { leaf: { edrpou: new RegExp(esc, 'i') }, label: 'ЄДРПОУ (підряд)' },
  ];
}

/** Останній «хвіст» із цифр для узгодження форматів + гнучкі розділювачі між цифрами телефону. */
function buildPhoneMongoLeavesContact(phone0) {
  const d = normalizePhoneDigits(phone0);
  if (d.length < 10) return [];
  const last10 = d.slice(-10);
  const last9 = last10.slice(-9);
  const flex9 = [...last9].map((ch) => escapeRegex(ch)).join('\\D*');
  const flex10 = [...last10].map((ch) => escapeRegex(ch)).join('\\D*');
  return [
    { leaf: { contactPhone: new RegExp(flex9, 'i') }, label: 'телефон (9 останніх цифр)' },
    { leaf: { 'contacts.phone': new RegExp(flex9, 'i') }, label: 'телефон у дод. контактах' },
    { leaf: { contactPhone: new RegExp(flex10, 'i') }, label: 'телефон (10 цифр із 0)' },
    { leaf: { 'contacts.phone': new RegExp(flex10, 'i') }, label: 'телефон CRM (повний із 0)' },
  ];
}

function buildPhoneMongoLeavesTask(phone0) {
  const d = normalizePhoneDigits(phone0);
  if (d.length < 10) return [];
  const last10 = d.slice(-10);
  const last9 = last10.slice(-9);
  const flex9 = [...last9].map((ch) => escapeRegex(ch)).join('\\D*');
  const flex10 = [...last10].map((ch) => escapeRegex(ch)).join('\\D*');
  return [
    { leaf: { contactPhone: new RegExp(flex9, 'i') }, label: 'телефон' },
    { leaf: { contactPhone: new RegExp(flex10, 'i') }, label: 'телефон (10 цифр)' },
  ];
}

/**
 * Поля заявки, по яких шукує discovery.
 * Порядок = пріоритет формулювань під користувацький UI.
 */
const TASK_LITE_MATCH_KEYS = /** @type {const} */ ([
  { key: 'edrpou', label: 'ЄДРПОУ', kind: 'edrpou' },
  { key: 'contactPerson', label: 'контактна особа / ПІБ', kind: 'text' },
  { key: 'contactPhone', label: 'телефон контактної особи', kind: 'phone' },
  { key: 'engineSerial', label: 'заводський/серійний номер (двигун)', kind: 'serial' },
  { key: 'customerEquipmentNumber', label: 'заводський номер обладнання', kind: 'serial' },
  { key: 'equipmentSerial', label: 'серійний номер обладнання', kind: 'serial' },
]);

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

  const edrpouSet = new Set();
  const nameSet = new Set();
  for (const c of rows || []) {
    const e = normalizeEdrpouDigits(c.edrpou).toLowerCase();
    if (e) edrpouSet.add(e);
    const n = String(c.name || '').trim().toLowerCase();
    if (n) nameSet.add(n);
  }
  return { edrpouSet, nameSet };
}

function taskAllowedForManager(task, { edrpouSet, nameSet }) {
  const e = normalizeEdrpouDigits(task.edrpou).toLowerCase();
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

/** Дата лише (ISO / Date) → ДД.ММ.РРРР, як у полі «дата» із картки (UTC-доба). */
function formatDateUkForAssistant(value) {
  if (value == null || value === '') return '';
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${d}.${m}.${y}`;
}

/**
 * «Дата виконання» для переліку: спочатку дата проведення робіт із картки,
 * інакше службова дата переходу в «Виконано», заплановані роботи або явне «не вказано».
 * @param {Record<string, unknown>} task
 */
function taskCompletionLineUk(task) {
  const work = formatDateUkForAssistant(task?.date);
  if (work) return `дата проведення робіт: ${work}`;
  const auto = formatDateUkForAssistant(task?.autoCompletedAt);
  if (auto) return `дата переходу в «Виконано» у системі: ${auto}`;
  const planned = formatDateUkForAssistant(task?.plannedDate);
  if (planned) return `запланована дата робіт: ${planned}`;
  return 'дата виконання не вказана в полях картки';
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

function uniqTasksById(tasks) {
  const seen = new Set();
  return tasks.filter((t) => {
    const id = String(t._id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildFlexiblePairRegex(qNorm) {
  const t = String(qNorm || '').trim();
  if (t.length < 2)
    return { rxTight: null, rxLoose: null };
  const rxTight = new RegExp(escapeRegex(t), 'i');
  const parts = t.split(/\s+/).filter((p) => p.length >= 2);
  const rxLoose =
    parts.length >= 2
      ? new RegExp(parts.map(escapeRegex).join('\\s+'), 'i')
      : rxTight;
  return { rxTight, rxLoose };
}

/** Плоскі гілки $or для пошукового рядка (кілька ключових слів узгоджуються з пробілами в БД). */
function buildClientLiteralLeaves(qNorm) {
  const { rxTight, rxLoose } = buildFlexiblePairRegex(qNorm);
  if (!rxTight) return [];
  const keys = [
    'name',
    'edrpou',
    'contactPerson',
    'contactPhone',
    'address',
    'contacts.person',
    'contacts.phone',
  ];
  const leaves = [];
  for (const k of keys) {
    leaves.push({ [k]: rxTight });
    if (rxLoose && rxLoose.source !== rxTight.source) leaves.push({ [k]: rxLoose });
  }
  const digitsFromQ = normalizeEdrpouDigits(qNorm);
  if (digitsFromQ.length >= 8 && digitsFromQ.length <= 10) {
    for (const { leaf } of buildEdrpouMongoLeaves(digitsFromQ)) {
      leaves.push(leaf);
    }
  }
  const pDigits = normalizePhoneDigits(qNorm);
  if (pDigits.length >= 10) {
    for (const { leaf } of buildPhoneMongoLeavesContact(normalizePhoneDigits(qNorm))) {
      leaves.push(leaf);
    }
  }
  return leaves;
}

function buildTaskLiteralLeaves(qNorm) {
  const { rxTight, rxLoose } = buildFlexiblePairRegex(qNorm);
  if (!rxTight) return [];
  const keys = [
    'edrpou',
    'contactPerson',
    'contactPhone',
    'engineSerial',
    'customerEquipmentNumber',
    'equipmentSerial',
    'client',
    'company',
    'requestDesc',
    'description',
    'equipment',
    'work',
    'requestNumber',
  ];
  const leaves = [];
  for (const k of keys) {
    leaves.push({ [k]: rxTight });
    if (rxLoose && rxLoose.source !== rxTight.source) leaves.push({ [k]: rxLoose });
  }
  const digitsFromQ = normalizeEdrpouDigits(qNorm);
  if (digitsFromQ.length >= 8 && digitsFromQ.length <= 10) {
    for (const { leaf } of buildEdrpouMongoLeaves(digitsFromQ)) {
      leaves.push(leaf);
    }
  }
  if (normalizePhoneDigits(qNorm).length >= 10) {
    for (const { leaf } of buildPhoneMongoLeavesTask(qNorm)) {
      leaves.push(leaf);
    }
  }
  return leaves;
}

/**
 * @param {Record<string, unknown>} task
 * @param {{ digits: string[], phones: string[], textQ: string }} ctx
 */
function discoveryMatchLabelsForTask(task, ctx) {
  const labels = [];
  const seen = new Set();
  /** @param {string} lbl */
  const push = (lbl) => {
    if (!lbl || seen.has(lbl)) return;
    seen.add(lbl);
    labels.push(lbl);
  };

  const tEdrp = normalizeEdrpouDigits(task.edrpou);
  for (const dig of ctx.digits) {
    const q = normalizeEdrpouDigits(dig);
    if (q.length >= 8 && edrpouDigitFieldsMatch(tEdrp, q)) push('ЄДРПОУ');
  }

  const tTel = normalizePhoneDigits(task.contactPhone);
  if (ctx.phones.length && tTel.length >= 9) {
    for (const ph of ctx.phones) {
      const p = normalizePhoneDigits(ph).slice(-9);
      const t = tTel.slice(-9);
      if (p.length === 9 && (t.endsWith(p) || p.endsWith(t) || tTel.includes(p))) {
        push('телефон контактної особи');
        break;
      }
    }
  }

  const txt = String(ctx.textQ || '').trim();
  if (txt.length >= 2) {
    const tnorm = normalizeTokenLoose(txt);
    const tser = normalizeSerialLoose(txt);
    const qPhoneTail = normalizePhoneDigits(txt).slice(-9);

    for (const { key, label, kind } of TASK_LITE_MATCH_KEYS) {
      if (kind === 'edrpou') continue;
      const val = task[key];
      if (val == null || String(val).trim() === '') continue;
      if (kind === 'edrpou') {
        if (edrpouDigitFieldsMatch(normalizeEdrpouDigits(val), normalizeEdrpouDigits(txt)))
          push(label);
      } else if (kind === 'text') {
        if (normalizeTokenLoose(String(val)).includes(tnorm)) push(label);
      } else if (kind === 'phone') {
        const vd = normalizePhoneDigits(val).slice(-9);
        if (qPhoneTail.length === 9 && vd === qPhoneTail) push(label);
      } else if (kind === 'serial' && tser.length >= 3) {
        if (normalizeSerialLoose(String(val)).includes(tser)) push(label);
      }
    }

    for (const [k, labelUk] of /** @type {const} */ ([
      ['client', 'клієнт / об’єкт у заявці'],
      ['company', 'компанія в заявці'],
      ['requestDesc', 'опис заявки'],
      ['description', 'опис'],
      ['equipment', 'обладнання'],
      ['work', 'роботи'],
      ['requestNumber', 'номер заявки'],
    ])) {
      const val = task[k];
      if (val && normalizeTokenLoose(String(val)).includes(tnorm)) push(labelUk);
    }
  }

  if (!labels.length) push('збіг за умовами пошуку (уточніть номер заявки для деталей)');
  return labels;
}

function discoveryAccessNoteUk(elevated, isManagerOnly) {
  if (elevated) {
    return 'Увага доступу [DTS-discovery-access]: перелік сформовано з правами адміністратора; це не гарантує, що в системі немає інших записів з іншими полями чи дублікатами — лише збіги за правилами пошуку.';
  }
  if (isManagerOnly) {
    return 'Увага доступу [DTS-discovery-access]: у переліку лише ваші клієнти з CRM і сервісні заявки, видимі менеджеру в межах регіону й закріплень; інші заявки або клієнти інших менеджерів тут не показуються.';
  }
  return 'Увага доступу [DTS-discovery-access]: доступ не повний — у списку лише заявки, що одночасно відповідають вашому регіону та/або призначенню інженера; збіги «по всій базі» для цього користувача можуть бути ширшими, ніж цей перелік.';
}

function formatMultiTaskDiscoveryOverview(tasks, ctx, accessNote) {
  const lines = tasks.map((t, i) => {
    const num = truncateField(t.requestNumber, 48) || '—';
    const st = truncateField(t.status, 48) || '—';
    const cli = truncateField(t.client || t.company, 80) || '—';
    const exec = taskCompletionLineUk(t);
    const where = discoveryMatchLabelsForTask(t, ctx).join('; ');
    return `${i + 1}) ${num} — статус «${st}»; клієнт/об’єкт: ${cli}; ${exec}\n   Де видно запитані дані: ${where}`;
  });
  return (
    `[DTS-discovery] Знайдено кілька заявок (${tasks.length}) за вашим пошуком. ${accessNote}\n` +
    'Перелік (лише доступні цьому користувачу):\n' +
    `${lines.join('\n')}\n` +
    '\n[DTS/UI-action-discovery] Попросіть користувача вказати **один** номер заявки (наприклад KV-0000997), який цікавить; досі не стверджуйте, що відкрито картку. Після явного номера у наступному повідомленні сервер підставить повні дані заявки з [DTS], якщо номер відомий.'
  );
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

  const curDigits = extractEdrpouDigitRuns(messageText);

  /**
   * Повідомлення лише про номер заявки KV/DP — без клієнтського контексту в цьому рядку.
   */
  const reqFromCurrent = collectRequestNumbers(messageText, [], []);
  if (
    reqFromCurrent.length > 0 &&
    !wantsIntent &&
    !curDigits.length &&
    !extractUaPhoneKeys(messageText).length &&
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
    for (const { leaf } of buildEdrpouMongoLeaves(d)) {
      clientBranches.push(leaf);
      taskBranches.push(leaf);
    }
  }
  for (const ph of phones) {
    for (const { leaf } of buildPhoneMongoLeavesContact(ph)) {
      clientBranches.push(leaf);
    }
    for (const { leaf } of buildPhoneMongoLeavesTask(ph)) {
      taskBranches.push(leaf);
    }
  }
  if (textQ.length >= 3) {
    clientBranches.push(...buildClientLiteralLeaves(textQ));
    taskBranches.push(...buildTaskLiteralLeaves(textQ));
  }

  const dedupClients = dedupeMongoLeaves(clientBranches);
  const dedupTasksLeaves = dedupeMongoLeaves(taskBranches);

  if (!dedupClients.length && !dedupTasksLeaves.length) {
    return { textForLlm: '', meta: {} };
  }

  const clientFilterRaw = dedupClients.length ? { $or: dedupClients } : null;
  const taskFilterLiteral = dedupTasksLeaves.length ? { $or: dedupTasksLeaves } : null;

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
    tasks = await TaskModel.find(taskQuery).sort({ requestDate: -1 }).limit(MAX_TASKS_SEARCH).lean();
    tasks = uniqTasksById(tasks);
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
  const discoveryCtx = { digits, phones, textQ };
  const accessUk = discoveryAccessNoteUk(elevated, isManagerOnly);

  if (clients.length) {
    sections.push(
      `[DTS] Записи з довідника клієнтів (CRM) за пошуком; ЄДРПОУ й телефон узгоджуються з урахуванням пробілів/розрядних символів (не розголошувати зайвого):\n${accessUk}`,
      ...clients.map((c, i) =>
        formatClientBlock(c, i, { restricted: clientAccessRestricted(c, login, elevated) }),
      ),
    );
  }

  if (tasks.length === 1) {
    sections.push(
      `[DTS] Одна сервісна заявка за пошуком (узгодження пробілів/розрядних у ЄДРПОУ, телефону, серіях за даними DTS):\n${accessUk}`,
      summarizeOneTask(tasks[0], 0),
    );
    sections.push(`[DTS-discovery] ${taskCompletionLineUk(tasks[0])}`);
    if (discoveryCtx.digits.length || discoveryCtx.phones.length || discoveryCtx.textQ) {
      const where = discoveryMatchLabelsForTask(tasks[0], discoveryCtx).join('; ');
      sections.push(`[DTS-discovery] Де збігаються шукані дані: ${where}`);
    }
  } else if (tasks.length > 1) {
    sections.push(formatMultiTaskDiscoveryOverview(tasks, discoveryCtx, accessUk));
  }

  let note =
    tasks.length > 1
      ? `\n\n[DTS-hint] Дайте перелік номерів уже з датою проведення робіт або службовою датою «Виконано», спитайте один номер для деталей; не розгортайте повні картки кожної заявки одразу.`
      : `\n\n[DTS-hint] Передай структуровано поля з [DTS]: ЄДРПОУ, контактна особа, телефон стримано, заводський/серійний номер, дата проведення робіт (як у блоці [DTS-discovery]).`;

  return {
    textForLlm: `${sections.join('\n')}${note}`,
    meta: {
      discovery: {
        clients: clients.length,
        tasks: tasks.length,
        multiTaskMatches: tasks.length > 1,
      },
    },
  };
}

module.exports = {
  buildDiscoveryContextForLlm,
};
