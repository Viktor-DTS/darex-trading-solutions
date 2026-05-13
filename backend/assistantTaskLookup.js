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

const REQUEST_NUM_PAD_MIN = 3;
const REQUEST_NUM_PAD_MAX = 12;

/**
 * Однакова заявка: KV-997 у чаті vs KV-0000997 у БД — узгодження за числовим значенням суфікса.
 * @param {string} rawToken
 * @returns {string[]}
 */
function expandRequestNumberVariants(rawToken) {
  const trimmed = String(rawToken || '')
    .trim()
    .replace(/\s+/g, '');
  const um = trimmed.match(/^([A-Za-zА-Яа-яІіЇїЄєҐґ]+)-(\d{1,12})$/u);
  if (!um) {
    return [trimmed];
  }
  const prefix = um[1];
  const digitsStr = um[2];
  const normalizedNum = parseInt(digitsStr, 10);
  if (!Number.isFinite(normalizedNum) || normalizedNum < 0) {
    return [trimmed];
  }

  const out = new Set();
  out.add(`${prefix}-${digitsStr}`);
  out.add(`${prefix}-${normalizedNum}`);
  for (let w = REQUEST_NUM_PAD_MIN; w <= REQUEST_NUM_PAD_MAX; w++) {
    out.add(`${prefix}-${String(normalizedNum).padStart(w, '0')}`);
  }
  return [...out];
}

/**
 * Один згаданий номер -> умова Mongo по полю requestNumber ($or декількох точних regex).
 * @param {string} token
 * @returns {Record<string, unknown>}
 */
function tokenToRequestNumberBranch(token) {
  const variants = expandRequestNumberVariants(token);
  const rx = variants.map((v) => ({
    requestNumber: new RegExp(`^\\s*${escapeRegex(v)}\\s*$`, 'i'),
  }));
  return rx.length === 1 ? rx[0] : { $or: rx };
}

/**
 * Кілька номерів з повідомлення — збіг із будь-яким (кожен з варіантами padding).
 * @param {string[]} nums
 * @returns {Record<string, unknown>}
 */
function buildRequestNumbersFilter(nums) {
  const branches = nums.map((n) => tokenToRequestNumberBranch(n));
  if (branches.length === 1) return branches[0];
  return { $or: branches };
}

/**
 * Виділяє номери заявок на кшталт KV-1022, NU - 0045 тощо.
 * @param {string} text
 * @returns {string[]}
 */
function extractRequestNumbers(text) {
  const s = String(text || '');
  const found = new Set();
  const re = /\b([A-Za-zА-Яа-яІіЇїЄєҐґ]{1,12})\s*-\s*(\d{1,12})\b/g;
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

  /** @type {string[]} */
  const extras = [];
  const pt = truncateField(t.paymentType, 100);
  if (pt && pt !== '') extras.push(`Оплата: ${pt}`);
  if (t.internalWork === true || String(t.internalWork).toLowerCase() === 'true') extras.push('Внутрішні роботи: так');

  const inv = truncateField(t.invoice, 80);
  if (inv) extras.push(`Рахунок/invoice: ${inv}`);
  if (t.needInvoice === true || String(t.needInvoice).toLowerCase() === 'true') extras.push('Потрібен рахунок: так');
  if (t.needAct === true || String(t.needAct).toLowerCase() === 'true') extras.push('Потрібен акт: так');
  if (t.warehouseApproved === true || String(t.warehouseApproved).toLowerCase() === 'true') extras.push('Підтверджено завскладом (прапорець): так');

  const st = truncateField(t.serviceTotal, 40);
  if (st) extras.push(`Сума робіт (ориєнтовно): ${st}`);
  if (t.paymentDate) extras.push(`Дата оплати: ${String(t.paymentDate)}`);

  const ser = [truncateField(t.equipmentSerial, 80), truncateField(t.engineSerial, 80), truncateField(t.customerEquipmentNumber, 80)]
    .filter(Boolean)
    .join(', ');
  if (ser) extras.push(`Серійні/номери: ${ser}`);
  const em = truncateField(t.engineModel, 80);
  if (em) extras.push(`Модель двигуна: ${em}`);
  const car = truncateField(t.carNumber, 40);
  if (car) extras.push(`Авто №: ${car}`);

  const comm = truncateField(t.comments, 350);
  if (comm) extras.push(`Коментарі: ${comm}`);
  const whc = truncateField(t.warehouseComment, 200);
  if (whc) extras.push(`Коментар завскладу: ${whc}`);
  const rmc = truncateField(t.regionalManagerComment, 200);
  if (rmc) extras.push(`Коментар регіон. керівника: ${rmc}`);
  const accc = truncateField(t.accountantComment || t.accountantComments, 200);
  if (accc) extras.push(`Бухгалтер: ${accc}`);
  const blk = truncateField(t.blockDetail, 200);
  if (blk) extras.push(`Блок/деталі: ${blk}`);
  const debt = truncateField(t.debtStatus, 80);
  if (debt) extras.push(`Заборгованість (статус): ${debt}`);

  if (extras.length) {
    block += `Додатково: ${extras.join(' · ')}\n`;
  }

  block += `Дата заявки: ${t.requestDate ? String(t.requestDate) : '—'}\n`;
  return maskPhones(block);
}

function isElevatedRole(roleLow) {
  return ['admin', 'administrator', 'mgradm'].includes(String(roleLow || '').toLowerCase());
}

/** Як у фронті Dashboard: лише administrator/admin редагують після підтвердження бухгалтерії. */
function canEditFullyAfterAccountantApproval(roleRaw) {
  const r = String(roleRaw || '').toLowerCase();
  return r === 'admin' || r === 'administrator';
}

/**
 * Той самий глобальний read-only, що режим модалки після кліку по заявці (не режим «лише перегляд» кнопки).
 * @param {{ role?: string } | null | undefined} userJwt
 * @param {{ role?: string } | null | undefined} dbUser
 * @param {Record<string, unknown>} task
 */
function computeAssistantTaskModalReadOnly(userJwt, dbUser, task) {
  const isApprovedByAccountant =
    String(task?.status || '') === 'Виконано' && String(task?.approvedByAccountant || '') === 'Підтверджено';
  const canEdit =
    canEditFullyAfterAccountantApproval(userJwt?.role) || canEditFullyAfterAccountantApproval(dbUser?.role);
  if (isApprovedByAccountant && !canEdit) return true;
  return false;
}

/**
 * Чи користувач просить відкрити картку заявки в інтерфейсі (модальне вікно).
 * @param {string} messageText
 */
function userWantsTaskCardUi(messageText) {
  const raw = String(messageText || '').trim();
  const s = raw.toLowerCase();
  if (!s) return false;
  const hasCode = /\b([A-Za-zА-Яа-яІіЇїЄєҐґ]+)\s*-\s*\d{1,12}\b/.test(raw);
  const mentionsTaskWord = /\b(заявк|картк|ticket|task|request)\b/i.test(s);
  const verbOpen =
    /\b(показати|покажи|покажіть|відкрити|відкрий|відкрийте|переглянути|переглянь|перегляньте|подивитись|подивись|дивись|перегляд|бачити|побачити|розкрити|розкрий|вивести|розгорнути)\b/i.test(
      s,
    );
  const verbDetail =
    /\b(деталі|детально|інформаці|інфо|повністю|розписати|подивитись\s+на)\b/i.test(s);
  const showEn =
    /\b(show|open|view|display)\b/i.test(s) && /\b(task|ticket|request|card)\b/i.test(s);
  const hasVerb = verbOpen || verbDetail || showEn;
  const hasSubject = mentionsTaskWord || hasCode;
  return hasVerb && hasSubject;
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
 * @param {{ priorUserMessages?: string[], priorAssistantMessages?: string[], dbUserLean?: Record<string, unknown> | null }} [opts]
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
  const wantCard = userWantsTaskCardUi(messageText);

  if (!login) {
    return {
      textForLlm: '',
      meta: { requestNumbers: nums, matched: 0, elevated: false, taskModal: null },
    };
  }

  if (nums.length === 0) {
    return {
      textForLlm: '',
      meta: {
        requestNumbers: [],
        matched: 0,
        elevated: false,
        taskModal: wantCard ? { open: false, reason: 'no_request_number_in_thread' } : null,
      },
    };
  }

  const TaskModel = mongoose.models.Task;
  const UserModel = mongoose.models.User;
  if (!TaskModel || !UserModel) {
    return {
      textForLlm: '',
      meta: {
        requestNumbers: nums,
        matched: 0,
        elevated: false,
        taskModal: wantCard ? { open: false, reason: 'task_model_unavailable' } : null,
      },
    };
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

  const numberOr = buildRequestNumbersFilter(nums);

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

  const meta = {
    requestNumbers: nums,
    matched: tasks.length,
    elevated,
    taskModal: null,
  };

  if (tasks.length === 0) {
    const numList = nums.join(', ');
    const hintElevated =
      `[DTS] За номером(ами) «${numList}» (перевірені також еквівалентні формати суфікса з ведучими нулями, як-от KV-0000997 замість KV-997) запису заявки в базі DTS не знайдено. ` +
      'Для облікового запису з правами адміністратора це зазвичай означає відсутність запису серед відомих номерів або зовсім інший текст у полі requestNumber у БД — ' +
      'не пояснюй це як «нема авторизації». Запропонуй глобальний пошук у DTS за повним номером з екрану. Не вигадай поля заявки.';
    const hintScoped =
      `[DTS] У діалозі згадано номер(и) «${numList}» (перевірені варіанти з ведучими нулями в суфіксі); у межах вашого профілю відповідного запису в DTS не видно. ` +
      'Див. [DTS/User]. Відкрийте заявку в системі. Не вигадайте дані заявки.';
    const hint = elevated ? hintElevated : hintScoped;
    if (wantCard) {
      meta.taskModal = {
        open: false,
        reason: elevated ? 'not_in_database' : 'not_visible_under_profile',
      };
    }
    return { textForLlm: hint, meta };
  }

  const parts = tasks.map((t, i) => summarizeOneTask(t, i));
  const header =
    '[DTS] Дані з системи за згаданими номерами (лише для відповіді; не розголошуйте стороннім без потреби):';

  let actionNote = '';
  if (wantCard && tasks.length === 1) {
    const t = tasks[0];
    const readOnly = computeAssistantTaskModalReadOnly(userJwt, dbUser, t);
    meta.taskModal = {
      open: true,
      taskId: String(t._id),
      requestNumber: String(t.requestNumber || ''),
      readOnly,
    };
    actionNote = `\n\n[DTS/UI-action] Клієнт DTS відкриває модальне вікно картки заявки ${t.requestNumber || ''}. ${
      readOnly
        ? 'Режим: лише перегляд (статус «Виконано» і підтверджено бухгалтерією; повне редагування — для адміністратора).'
        : 'Режим: редагування згідно з роллю; окремі поля форми можуть бути заблоковані власними правилами DTS.'
    } Поясни користувачу доступ коротко; не копіюй цей абзац дослівно у відповідь.`;
  } else if (wantCard && tasks.length > 1) {
    meta.taskModal = { open: false, reason: 'multiple_matches', count: tasks.length };
    actionNote = `\n\n[DTS/UI-action] Знайдено кілька заявок (${tasks.length}) — модальне вікно не відкривається автоматично; запропонуй уточнити один номер.`;
  }

  return { textForLlm: `${header}\n\n${parts.join('\n')}${actionNote}`, meta };
}

module.exports = {
  extractRequestNumbers,
  collectRequestNumbers,
  expandRequestNumberVariants,
  buildTaskContextForLlm,
  ASSISTANT_PRIOR_SCAN: {
    maxMessages: MAX_PRIOR_USER_MESSAGES,
    maxAssistantMessages: MAX_PRIOR_ASSISTANT_MESSAGES,
    maxChars: MAX_CHARS_PER_PRIOR_MESSAGE,
  },
};
