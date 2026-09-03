/**
 * Журнал рахунків і оплат за зовнішні ресурси.
 *
 * Atlas віддає рахунки через API, а Render і Cloudinary — ні (у них це лише
 * кабінет). Тому журнал єдиний: записи з API підтягуються автоматично, решту
 * адміністратор веде вручну — і в підсумку видно повну картину витрат.
 */
const mongoose = require('mongoose');

const RESOURCES = ['render', 'mongodb', 'cloudinary', 'other'];
const STATUSES = ['paid', 'pending', 'overdue', 'planned'];

const resourcePaymentSchema = new mongoose.Schema(
  {
    resource: { type: String, enum: RESOURCES, required: true, index: true },
    resourceLabel: { type: String, trim: true, default: '' },
    invoiceNumber: { type: String, trim: true, default: '' },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    amount: { type: Number, required: true },
    currency: { type: String, trim: true, default: 'USD' },
    amountUah: { type: Number, default: null },
    status: { type: String, enum: STATUSES, default: 'paid', index: true },
    paidAt: { type: Date, default: null },
    dueAt: { type: Date, default: null },
    plan: { type: String, trim: true, default: '' },
    method: { type: String, trim: true, default: '' },
    comment: { type: String, trim: true, default: '' },
    attachmentUrl: { type: String, trim: true, default: '' },
    source: { type: String, enum: ['manual', 'api'], default: 'manual' },
    externalId: { type: String, trim: true, default: '' },
    createdByLogin: { type: String, trim: true, default: '' },
    createdByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

resourcePaymentSchema.index({ resource: 1, periodStart: -1 });
resourcePaymentSchema.index({ externalId: 1, resource: 1 });

const ResourcePayment =
  mongoose.models.ResourcePayment || mongoose.model('ResourcePayment', resourcePaymentSchema);

function toNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sanitizePayload(body, user) {
  const resource = RESOURCES.includes(body?.resource) ? body.resource : 'other';
  return {
    resource,
    resourceLabel: String(body?.resourceLabel || '').trim(),
    invoiceNumber: String(body?.invoiceNumber || '').trim(),
    periodStart: body?.periodStart ? new Date(body.periodStart) : null,
    periodEnd: body?.periodEnd ? new Date(body.periodEnd) : null,
    amount: toNumber(body?.amount, 0),
    currency: String(body?.currency || 'USD').trim().toUpperCase().slice(0, 5),
    amountUah: toNumber(body?.amountUah, null),
    status: STATUSES.includes(body?.status) ? body.status : 'paid',
    paidAt: body?.paidAt ? new Date(body.paidAt) : null,
    dueAt: body?.dueAt ? new Date(body.dueAt) : null,
    plan: String(body?.plan || '').trim(),
    method: String(body?.method || '').trim(),
    comment: String(body?.comment || '').trim(),
    attachmentUrl: String(body?.attachmentUrl || '').trim(),
    createdByLogin: user?.login || '',
    createdByName: user?.name || '',
  };
}

/** Рахунки Atlas зберігаємо в тому ж журналі, щоб зведення рахувалось за одним джерелом. */
async function syncAtlasInvoices(invoices = []) {
  let created = 0;
  for (const invoice of invoices) {
    if (!invoice?.id) continue;
    const existing = await ResourcePayment.findOne({ resource: 'mongodb', externalId: invoice.id });
    const status = String(invoice.status || '').toUpperCase() === 'PAID' ? 'paid' : 'pending';
    const payload = {
      resource: 'mongodb',
      resourceLabel: 'MongoDB Atlas',
      invoiceNumber: invoice.id,
      periodStart: invoice.startDate ? new Date(invoice.startDate) : null,
      periodEnd: invoice.endDate ? new Date(invoice.endDate) : null,
      amount: Number(invoice.amountUsd || 0),
      currency: 'USD',
      status,
      paidAt: status === 'paid' && invoice.endDate ? new Date(invoice.endDate) : null,
      source: 'api',
      externalId: invoice.id,
    };
    if (existing) {
      // Ручні правки (курс, коментар, файл) не чіпаємо — оновлюємо лише те, що приходить з API.
      Object.assign(existing, payload);
      await existing.save();
    } else {
      await ResourcePayment.create(payload);
      created += 1;
    }
  }
  return created;
}

function summarize(payments) {
  const now = new Date();
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  const byResource = {};
  let totalUsd = 0;
  let last12mUsd = 0;
  let pendingUsd = 0;

  for (const payment of payments) {
    const key = payment.resource;
    if (!byResource[key]) {
      byResource[key] = { resource: key, totalUsd: 0, last12mUsd: 0, pendingUsd: 0, count: 0, lastPaidAt: null };
    }
    const amount = payment.currency === 'USD' ? Number(payment.amount || 0) : 0;
    byResource[key].count += 1;
    byResource[key].totalUsd += amount;
    totalUsd += amount;
    const reference = payment.periodStart || payment.paidAt || payment.createdAt;
    if (reference && new Date(reference) >= yearAgo) {
      byResource[key].last12mUsd += amount;
      last12mUsd += amount;
    }
    if (payment.status === 'pending' || payment.status === 'overdue') {
      byResource[key].pendingUsd += amount;
      pendingUsd += amount;
    }
    if (payment.paidAt && (!byResource[key].lastPaidAt || new Date(payment.paidAt) > new Date(byResource[key].lastPaidAt))) {
      byResource[key].lastPaidAt = payment.paidAt;
    }
  }

  const months = new Map();
  for (const payment of payments) {
    const reference = payment.periodStart || payment.paidAt || payment.createdAt;
    if (!reference) continue;
    const date = new Date(reference);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!months.has(key)) months.set(key, { month: key, render: 0, mongodb: 0, cloudinary: 0, other: 0, total: 0 });
    const row = months.get(key);
    const amount = payment.currency === 'USD' ? Number(payment.amount || 0) : 0;
    row[payment.resource] = (row[payment.resource] || 0) + amount;
    row.total += amount;
  }

  return {
    totalUsd: Number(totalUsd.toFixed(2)),
    last12mUsd: Number(last12mUsd.toFixed(2)),
    pendingUsd: Number(pendingUsd.toFixed(2)),
    avgMonthlyUsd: months.size ? Number((last12mUsd / Math.min(12, months.size)).toFixed(2)) : 0,
    byResource: Object.values(byResource).map((row) => ({
      ...row,
      totalUsd: Number(row.totalUsd.toFixed(2)),
      last12mUsd: Number(row.last12mUsd.toFixed(2)),
      pendingUsd: Number(row.pendingUsd.toFixed(2)),
    })),
    monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-18),
  };
}

module.exports = { ResourcePayment, RESOURCES, STATUSES, sanitizePayload, syncAtlasInvoices, summarize };
