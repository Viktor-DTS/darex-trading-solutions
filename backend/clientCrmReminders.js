/**
 * CRM-нагадування менеджерам:
 *  - щоденно: клієнти, у яких настав або прострочений запланований наступний крок;
 *  - щотижня: дайджест «сплячих» клієнтів (без взаємодій і без відкритих угод).
 */

/** Кожні скільки днів без взаємодій та без відкритих угод клієнт вважається сплячим. */
const SLEEPING_DAYS = 60;
const JOB_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60000;
/** Дайджест сплячих розсилаємо в понеділок; 1 = Monday у Date.getDay(). */
const DIGEST_WEEKDAY = 1;
const SLEEPING_DIGEST_LIMIT = 10;

const deps = {
  Client: null,
  Sale: null,
  Interaction: null,
  createManagerNotificationDeduped: null,
  openDealStatuses: [],
};

let jobRunning = false;

function initClientCrmReminders(initDeps) {
  Object.assign(deps, initDeps);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Локальна дата у форматі YYYY-MM-DD (toISOString дав би зсув на добу через UTC). */
function ymd(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** ISO-тиждень у форматі YYYY-Www — ключ дедуплікації тижневого дайджесту. */
function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const ACTION_LABELS = {
  call: 'Дзвінок',
  meeting: 'Зустріч',
  email: 'Email',
  quote: 'Комерційна пропозиція',
  other: 'Задача',
};

function recipientsFor(client) {
  return [client.assignedManagerLogin, client.assignedManagerLogin2].filter(Boolean);
}

/** Нагадування по клієнтах, у яких наступний крок настав або прострочений. */
async function notifyDueNextActions() {
  const { Client, createManagerNotificationDeduped } = deps;
  const dueBefore = new Date();
  dueBefore.setHours(23, 59, 59, 999);

  const clients = await Client.find({ nextActionAt: { $ne: null, $lte: dueBefore } })
    .select('name nextActionAt nextActionType nextActionNote assignedManagerLogin assignedManagerLogin2')
    .limit(1000)
    .lean();

  const today = startOfToday();
  for (const client of clients) {
    // Порівнюємо саме дні, а не моменти часу — інакше 09:00 три дні тому дає 2
    const overdueDays = Math.round((today - startOfDay(client.nextActionAt)) / 86400000);
    const label = ACTION_LABELS[client.nextActionType] || ACTION_LABELS.other;
    const title = overdueDays > 0 ? 'Прострочений крок по клієнту' : 'Сьогодні запланований крок по клієнту';
    const suffix = overdueDays > 0 ? ` Прострочено на ${overdueDays} дн.` : '';
    const note = client.nextActionNote ? ` — ${client.nextActionNote}` : '';

    for (const login of recipientsFor(client)) {
      await createManagerNotificationDeduped({
        recipientLogin: login,
        kind: 'client_next_action_due',
        clientId: client._id,
        title,
        body: `${label}: ${client.name}${note}.${suffix}`,
        // один запис на клієнта на день — без спаму при щогодинному запуску
        dedupeKey: `client_next_action:${client._id}:${login}:${ymd(today)}`,
        read: false,
      });
    }
  }
  return clients.length;
}

/** Клієнти без взаємодій за SLEEPING_DAYS днів і без жодної відкритої угоди. */
async function findSleepingClients() {
  const { Client, Sale, Interaction, openDealStatuses } = deps;
  const since = new Date(Date.now() - SLEEPING_DAYS * 86400000);
  const [withOpenDeals, recentlyTouched] = await Promise.all([
    Sale.distinct('clientId', { status: { $in: openDealStatuses } }),
    Interaction.distinct('entityId', { entityType: 'client', date: { $gte: since } }),
  ]);
  return Client.find({ _id: { $nin: [...withOpenDeals, ...recentlyTouched] } })
    .select('name assignedManagerLogin assignedManagerLogin2')
    .limit(2000)
    .lean();
}

async function sendSleepingDigest() {
  const { createManagerNotificationDeduped } = deps;
  const sleeping = await findSleepingClients();
  if (sleeping.length === 0) return 0;

  const byManager = new Map();
  sleeping.forEach((client) => {
    recipientsFor(client).forEach((login) => {
      if (!byManager.has(login)) byManager.set(login, []);
      byManager.get(login).push(client.name);
    });
  });

  const week = isoWeekKey();
  for (const [login, names] of byManager) {
    const shown = names.slice(0, SLEEPING_DIGEST_LIMIT).join(', ');
    const rest = names.length > SLEEPING_DIGEST_LIMIT ? ` та ще ${names.length - SLEEPING_DIGEST_LIMIT}` : '';
    await createManagerNotificationDeduped({
      recipientLogin: login,
      kind: 'client_sleeping_digest',
      title: `Втрачаємо контакт: ${names.length} клієнт(ів)`,
      body: `Без взаємодій понад ${SLEEPING_DAYS} днів і без відкритих угод: ${shown}${rest}.`,
      dedupeKey: `client_sleeping:${login}:${week}`,
      read: false,
    });
  }
  return byManager.size;
}

async function runClientCrmRemindersJob() {
  if (jobRunning) return;
  if (!deps.Client || !deps.createManagerNotificationDeduped) return;
  jobRunning = true;
  try {
    const due = await notifyDueNextActions();
    // Дайджест формується лише в понеділок, дедуплікація не дасть надіслати його двічі
    const digests = new Date().getDay() === DIGEST_WEEKDAY ? await sendSleepingDigest() : 0;
    if (due || digests) {
      console.log(`✅ [client-crm-reminders] кроків: ${due}, дайджестів: ${digests}`);
    }
  } catch (e) {
    console.error('[client-crm-reminders]', e);
  } finally {
    jobRunning = false;
  }
}

function scheduleClientCrmRemindersJob() {
  setInterval(() => {
    runClientCrmRemindersJob().catch((e) => console.error('[client-crm-reminders] interval', e));
  }, JOB_INTERVAL_MS);
  setTimeout(() => {
    runClientCrmRemindersJob().catch((e) => console.error('[client-crm-reminders] startup', e));
  }, STARTUP_DELAY_MS);
}

module.exports = {
  initClientCrmReminders,
  runClientCrmRemindersJob,
  scheduleClientCrmRemindersJob,
  findSleepingClients,
  SLEEPING_DAYS,
};
