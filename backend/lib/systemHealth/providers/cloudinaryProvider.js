/**
 * Cloudinary — використання кредитів, сховища, трафіку та трансформацій.
 *
 * Ключі беремо з тих самих CLOUDINARY_* змінних, що вже використовує завантаження файлів.
 * Рахунків Cloudinary через API не віддає — суми беруться з журналу оплат.
 */
const cloudinary = require('cloudinary').v2;
const { cached } = require('../cache');

const TTL_MS = Number(process.env.SYSTEM_HEALTH_CLOUDINARY_TTL_MS || 300_000);

/** Довідник тарифів Cloudinary: місячні кредити та ціна. */
const CLOUDINARY_PLANS = {
  free: { label: 'Free', credits: 25, usd: 0 },
  plus: { label: 'Plus', credits: 225, usd: 99 },
  advanced: { label: 'Advanced', credits: 600, usd: 249 },
};

function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET,
  );
}

function planInfo(planName) {
  const key = String(planName || '').toLowerCase().split(' ')[0];
  return CLOUDINARY_PLANS[key] || { label: planName || 'невідомо', credits: null, usd: null };
}

function pct(usage) {
  if (!usage) return null;
  if (typeof usage.used_percent === 'number') return usage.used_percent;
  if (usage.limit) return (Number(usage.usage || 0) / Number(usage.limit)) * 100;
  return null;
}

/** Скільки днів лишилось до кінця розрахункового місяця — потрібно для прогнозу вичерпання кредитів. */
function billingCycleInfo(lastUpdated) {
  const now = lastUpdated ? new Date(lastUpdated) : new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const totalDays = (endOfMonth - startOfMonth) / 86_400_000;
  const elapsedDays = Math.max(0.5, (now - startOfMonth) / 86_400_000);
  return {
    totalDays,
    elapsedDays: Number(elapsedDays.toFixed(2)),
    remainingDays: Number((totalDays - elapsedDays).toFixed(2)),
    resetsAt: endOfMonth.toISOString(),
  };
}

async function fetchCloudinaryState({ force = false } = {}) {
  return cached(
    'cloudinary:usage',
    TTL_MS,
    async () => {
      if (!isConfigured()) {
        return {
          configured: false,
          message: 'Додайте CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET, щоб бачити ліміти Cloudinary.',
        };
      }

      const usage = await cloudinary.api.usage();
      const plan = planInfo(usage.plan);
      const cycle = billingCycleInfo(usage.last_updated);

      const creditsUsed = Number(usage.credits?.usage ?? 0);
      const creditsLimit = Number(usage.credits?.limit ?? plan.credits ?? 0);
      const creditsPercent = creditsLimit ? (creditsUsed / creditsLimit) * 100 : null;
      const burnPerDay = cycle.elapsedDays ? creditsUsed / cycle.elapsedDays : 0;
      const projectedCredits = burnPerDay * cycle.totalDays;

      return {
        configured: true,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        plan: { name: usage.plan, ...plan },
        lastUpdated: usage.last_updated || null,
        cycle,
        credits: {
          used: creditsUsed,
          limit: creditsLimit,
          percent: creditsPercent,
          burnPerDay: Number(burnPerDay.toFixed(2)),
          projected: Number(projectedCredits.toFixed(1)),
          projectedPercent: creditsLimit ? (projectedCredits / creditsLimit) * 100 : null,
          daysToExhaust: burnPerDay > 0 && creditsLimit ? Math.max(0, (creditsLimit - creditsUsed) / burnPerDay) : null,
        },
        storage: {
          usedBytes: Number(usage.storage?.usage ?? 0),
          limitBytes: Number(usage.storage?.limit ?? 0) || null,
          percent: pct(usage.storage),
          creditsUsage: usage.storage?.credits_usage ?? null,
        },
        bandwidth: {
          usedBytes: Number(usage.bandwidth?.usage ?? 0),
          limitBytes: Number(usage.bandwidth?.limit ?? 0) || null,
          percent: pct(usage.bandwidth),
          creditsUsage: usage.bandwidth?.credits_usage ?? null,
        },
        transformations: {
          used: Number(usage.transformations?.usage ?? 0),
          limit: Number(usage.transformations?.limit ?? 0) || null,
          percent: pct(usage.transformations),
          creditsUsage: usage.transformations?.credits_usage ?? null,
        },
        objects: { used: Number(usage.objects?.usage ?? 0), limit: Number(usage.objects?.limit ?? 0) || null },
        requests: Number(usage.requests ?? 0),
        resources: Number(usage.resources ?? 0),
        derivedResources: Number(usage.derived_resources ?? 0),
        mediaLimits: usage.media_limits || null,
        billingUrl: 'https://console.cloudinary.com/settings/billing',
        consoleUrl: `https://console.cloudinary.com/console/${process.env.CLOUDINARY_CLOUD_NAME}/usage`,
      };
    },
    { force },
  );
}

module.exports = { fetchCloudinaryState, isConfigured, CLOUDINARY_PLANS };
