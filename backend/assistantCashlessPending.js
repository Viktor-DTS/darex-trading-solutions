/**
 * Безготівкові заявки на затвердженні у бухгалтера без рахунку / без заявки на рахунок.
 */
const mongoose = require('mongoose');
const REMIND_BUCKET_DAYS = 3;
const MIN_DAYS_AFTER_WH_APPROVAL = 3;
const REMIND_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** @type {{ Task: import('mongoose').Model | null, InvoiceRequest: import('mongoose').Model | null, User: import('mongoose').Model | null, createManagerNotificationDeduped: ((doc: object) => Promise<void>) | null }} */
const deps = {
  Task: null,
  InvoiceRequest: null,
  User: null,
  createManagerNotificationDeduped: null,
};

let jobRunning = false;

function initAssistantCashlessPending(initDeps) {
  Object.assign(deps, initDeps);
}

function remindBucketKey() {
  return Math.floor(Date.now() / (REMIND_BUCKET_DAYS * 86400000));
}

function taskWarehouseApprovedAt(task) {
  if (task?.autoWarehouseApprovedAt) return new Date(task.autoWarehouseApprovedAt);
  if (task?.warehouseApprovalDate) return new Date(task.warehouseApprovalDate);
  if (task?.autoCompletedAt) return new Date(task.autoCompletedAt);
  if (task?.requestDate) return new Date(task.requestDate);
  return null;
}

function daysSinceDate(d) {
  if (!d || Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function taskHasInvoiceArtifact(task) {
  return Boolean(String(task?.invoiceFile || '').trim() || String(task?.invoice || '').trim());
}

function isCashlessPayment(task) {
  const pt = String(task?.paymentType || '').trim().toLowerCase();
  return pt === 'безготівка' || pt.includes('безгот');
}

function isAccountantPending(task) {
  const st = String(task?.status || '').trim();
  const wh = String(task?.approvedByWarehouse || '').trim();
  const acc = String(task?.approvedByAccountant || '').trim();
  return st === 'Виконано' && wh === 'Підтверджено' && acc !== 'Підтверджено' && acc !== 'Відмова';
}

/**
 * @param {import('mongoose').Model} Task
 * @param {{ regionFilter?: string[] | null, elevated?: boolean }} opts
 */
async function queryCandidateTasks(Task, opts = {}) {
  const base = {
    status: 'Виконано',
    paymentType: { $regex: /безгот/i },
    approvedByWarehouse: 'Підтверджено',
    approvedByAccountant: { $nin: ['Підтверджено', 'Відмова'] },
  };
  if (Array.isArray(opts.regionFilter) && opts.regionFilter.length) {
    base.serviceRegion = { $in: opts.regionFilter };
  }
  const rows = await Task.find(base).sort({ requestDate: -1 }).limit(500).lean();
  return rows.filter((t) => isCashlessPayment(t) && isAccountantPending(t));
}

/**
 * @param {string[]} taskIds
 */
async function loadInvoiceRequestTaskIdSet(InvoiceRequest, taskIds) {
  if (!InvoiceRequest || !taskIds.length) return new Set();
  const irs = await InvoiceRequest.find({
    taskId: { $in: taskIds },
    status: { $in: ['pending', 'processing', 'completed'] },
  })
    .select('taskId')
    .lean();
  return new Set(irs.map((r) => String(r.taskId || '')).filter(Boolean));
}

/**
 * Заявки без рахунку й без активної заявки на рахунок, ≥ MIN_DAYS після підтвердження завскладом.
 * @param {{ regionFilter?: string[] | null }} [opts]
 */
async function findCashlessTasksMissingInvoice(opts = {}) {
  const { Task, InvoiceRequest } = deps;
  if (!Task) return [];

  const candidates = await queryCandidateTasks(Task, opts);
  const needIrCheck = candidates.filter((t) => !taskHasInvoiceArtifact(t));
  const ids = needIrCheck.map((t) => String(t._id));
  const irSet = await loadInvoiceRequestTaskIdSet(InvoiceRequest, ids);

  const out = [];
  for (const t of needIrCheck) {
    if (taskHasInvoiceArtifact(t)) continue;
    if (irSet.has(String(t._id))) continue;
    if (t.invoiceRequestId && String(t.invoiceRequestId).trim()) continue;

    const since = taskWarehouseApprovedAt(t);
    const days = daysSinceDate(since);
    if (days == null || days < MIN_DAYS_AFTER_WH_APPROVAL) continue;

    out.push({
      taskId: String(t._id),
      requestNumber: String(t.requestNumber || '').trim(),
      serviceRegion: String(t.serviceRegion || '').trim(),
      client: String(t.client || t.company || '').trim(),
      daysPending: days,
    });
  }
  return out;
}

async function getRegionalManagerLoginsForRegion(region) {
  const { User } = deps;
  if (!User || !region) return [];
  const rows = await User.find({
    dismissed: { $ne: true },
    region,
    role: { $in: ['regional', 'regkerivn'] },
  })
    .select('login')
    .lean();
  return [...new Set(rows.map((r) => String(r.login || '').trim()).filter(Boolean))];
}

function userRegionList(userLean) {
  const r = String(userLean?.region || '').trim();
  if (!r || r === 'Україна' || /загальн/i.test(r)) return null;
  if (r.includes(',')) {
    return [...new Set(r.split(',').map((x) => x.trim()).filter(Boolean))];
  }
  return [r];
}

function isElevatedRole(roleRaw) {
  return ['admin', 'administrator', 'mgradm'].includes(String(roleRaw || '').toLowerCase());
}

/**
 * Список для асистента / API поточного користувача.
 * @param {string} login
 * @param {{ role?: string, region?: string } | null} dbUser
 */
async function getCashlessPendingAlertsForUser(login, dbUser) {
  const role = String(dbUser?.role || '').toLowerCase();
  const elevated = isElevatedRole(role);
  const isRegional = role === 'regional' || role === 'regkerivn';
  const isService = role === 'service';

  if (!elevated && !isRegional && !isService) {
    return { tasks: [], summaryUk: '' };
  }

  const regions = userRegionList(dbUser);
  const tasks = await findCashlessTasksMissingInvoice({
    regionFilter: elevated && !regions ? null : regions,
  });

  if (!tasks.length) {
    return { tasks: [], summaryUk: '' };
  }

  const numbers = tasks.map((t) => t.requestNumber || t.taskId).filter(Boolean);
  const summaryUk =
    `У вас ${tasks.length} заявок на затвердженні у бухгалтера з безготівковою оплатою, але без рахунку та без заявки на рахунок. ` +
    `Перевірте заявки та запросіть рахунок: ${numbers.join(', ')}.`;

  return {
    tasks: tasks.map((t) => ({
      taskId: t.taskId,
      requestNumber: t.requestNumber,
      serviceRegion: t.serviceRegion,
      client: t.client,
      daysPending: t.daysPending,
    })),
    summaryUk,
  };
}

async function runCashlessPendingMaintenanceJob() {
  const { Task, createManagerNotificationDeduped } = deps;
  if (!Task || !createManagerNotificationDeduped) return;
  if (jobRunning) return;
  jobRunning = true;

  try {
    const tasks = await findCashlessTasksMissingInvoice({});
    const bucket = remindBucketKey();

    for (const t of tasks) {
      const region = t.serviceRegion;
      if (!region) continue;
      const logins = await getRegionalManagerLoginsForRegion(region);
      const title = 'Безготівка без рахунку — потрібна заявка на рахунок';
      const body =
        `Заявка ${t.requestNumber || t.taskId} (${t.client || 'клієнт'}): на затвердженні у бухгалтера, ` +
        `форма оплати безготівкова, рахунку та заявки на рахунок немає (${t.daysPending} дн. після підтвердження завскладом). ` +
        `Перевірте заявку та запросіть рахунок.`;

      for (const login of logins) {
        await createManagerNotificationDeduped({
          recipientLogin: login,
          kind: 'task_cashless_no_invoice_pending',
          taskId: mongoose.Types.ObjectId.isValid(t.taskId) ? new mongoose.Types.ObjectId(t.taskId) : undefined,
          requestNumber: t.requestNumber || '',
          title,
          body,
          dedupeKey: `cashless_no_inv:${t.taskId}:${login}:${bucket}`,
          read: false,
        });
      }
    }

    if (tasks.length) {
      console.log(`✅ [cashless-pending] перевірено, нагадувань для ${tasks.length} заявок (bucket ${bucket})`);
    }
  } catch (e) {
    console.error('[cashless-pending]', e);
  } finally {
    jobRunning = false;
  }
}

function scheduleCashlessPendingJob() {
  setInterval(() => {
    runCashlessPendingMaintenanceJob().catch((e) => console.error('[cashless-pending] interval', e));
  }, REMIND_INTERVAL_MS);
  setTimeout(() => {
    runCashlessPendingMaintenanceJob().catch((e) => console.error('[cashless-pending] startup', e));
  }, 45000);
}

module.exports = {
  initAssistantCashlessPending,
  findCashlessTasksMissingInvoice,
  getCashlessPendingAlertsForUser,
  runCashlessPendingMaintenanceJob,
  scheduleCashlessPendingJob,
  REMIND_BUCKET_DAYS,
  MIN_DAYS_AFTER_WH_APPROVAL,
};
