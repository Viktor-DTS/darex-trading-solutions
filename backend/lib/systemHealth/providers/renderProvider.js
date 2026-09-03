/**
 * Render (dashboard.render.com) — стан сервісів, деплої та метрики інстансів.
 *
 * Потрібен RENDER_API_KEY (Account Settings → API Keys). Ціни та ресурси планів
 * Render не віддає через API, тому тримаємо довідкову таблицю нижче — вона
 * використовується лише для оцінки витрат і порад щодо зміни плану.
 */
const { cached } = require('../cache');

const RENDER_API = 'https://api.render.com/v1';
const TTL_MS = Number(process.env.SYSTEM_HEALTH_RENDER_TTL_MS || 120_000);

/** Довідник інстанс-типів Render: ліміти й ціна на місяць (USD). */
const RENDER_PLANS = {
  free: { label: 'Free', memoryMb: 512, cpu: 0.1, usd: 0 },
  starter: { label: 'Starter', memoryMb: 512, cpu: 0.5, usd: 7 },
  standard: { label: 'Standard', memoryMb: 2048, cpu: 1, usd: 25 },
  pro: { label: 'Pro', memoryMb: 4096, cpu: 2, usd: 85 },
  pro_plus: { label: 'Pro Plus', memoryMb: 8192, cpu: 4, usd: 175 },
  pro_max: { label: 'Pro Max', memoryMb: 16384, cpu: 4, usd: 225 },
  pro_ultra: { label: 'Pro Ultra', memoryMb: 32768, cpu: 8, usd: 450 },
};

/** Наступний план для порад «час апгрейдитись». */
const PLAN_UPGRADE_PATH = ['free', 'starter', 'standard', 'pro', 'pro_plus', 'pro_max', 'pro_ultra'];

function planInfo(planKey) {
  const key = String(planKey || '').toLowerCase().replace(/[\s-]+/g, '_');
  return RENDER_PLANS[key] || { label: planKey || 'невідомо', memoryMb: 0, cpu: 0, usd: null };
}

function nextPlan(planKey) {
  const key = String(planKey || '').toLowerCase().replace(/[\s-]+/g, '_');
  const index = PLAN_UPGRADE_PATH.indexOf(key);
  if (index < 0 || index === PLAN_UPGRADE_PATH.length - 1) return null;
  const nextKey = PLAN_UPGRADE_PATH[index + 1];
  return { key: nextKey, ...RENDER_PLANS[nextKey] };
}

function isConfigured() {
  return Boolean(process.env.RENDER_API_KEY);
}

async function renderFetch(path, { signal } = {}) {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) throw new Error('RENDER_API_KEY не встановлено');
  const response = await fetch(`${RENDER_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Render API ${response.status}: ${body.slice(0, 300) || response.statusText}`);
  }
  return response.json();
}

/** Метрики Render повертаються як масив часових рядів; зводимо їх до одного ряду. */
function flattenSeries(payload) {
  if (!Array.isArray(payload)) return [];
  const merged = new Map();
  for (const series of payload) {
    for (const point of series?.values || []) {
      const ts = new Date(point.timestamp).getTime();
      if (!Number.isFinite(ts)) continue;
      merged.set(ts, (merged.get(ts) || 0) + (Number(point.value) || 0));
    }
  }
  return [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([ts, value]) => ({ ts, value }));
}

function seriesStats(series) {
  if (!series.length) return { last: 0, avg: 0, max: 0, min: 0, points: 0 };
  const values = series.map((p) => p.value);
  return {
    last: values[values.length - 1],
    avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
    points: values.length,
  };
}

async function safeMetric(path) {
  try {
    return flattenSeries(await renderFetch(path));
  } catch {
    return [];
  }
}

async function loadServiceMetrics(serviceId, hours) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hours * 3_600_000);
  const range = `startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`;
  const resolution = hours <= 6 ? 60 : 300;
  const base = `resource=${encodeURIComponent(serviceId)}&${range}&resolutionSeconds=${resolution}`;

  const [cpu, cpuLimit, memory, memoryLimit, httpRequests, latencyP95, latencyP99, instances, bandwidth] =
    await Promise.all([
      safeMetric(`/metrics/cpu?${base}&aggregationMethod=AVG`),
      safeMetric(`/metrics/cpu-limit?${base}`),
      safeMetric(`/metrics/memory?${base}&aggregationMethod=AVG`),
      safeMetric(`/metrics/memory-limit?${base}`),
      safeMetric(`/metrics/http-requests?${base}`),
      safeMetric(`/metrics/http-latency?${base}&quantile=0.95`),
      safeMetric(`/metrics/http-latency?${base}&quantile=0.99`),
      safeMetric(`/metrics/instance-count?${base}`),
      safeMetric(`/metrics/bandwidth?startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}&resource=${encodeURIComponent(serviceId)}`),
    ]);

  return {
    cpu: { series: cpu, stats: seriesStats(cpu) },
    cpuLimit: seriesStats(cpuLimit),
    memory: { series: memory, stats: seriesStats(memory) },
    memoryLimit: seriesStats(memoryLimit),
    httpRequests: { series: httpRequests, stats: seriesStats(httpRequests), total: httpRequests.reduce((s, p) => s + p.value, 0) },
    latency: { p95: seriesStats(latencyP95), p99: seriesStats(latencyP99), series: latencyP95 },
    instances: seriesStats(instances),
    bandwidth: { series: bandwidth, totalBytes: bandwidth.reduce((s, p) => s + p.value, 0) },
  };
}

function normalizeService(service, details) {
  const serviceDetails = service?.serviceDetails || {};
  const planKey = serviceDetails.plan || serviceDetails.instanceType || service?.plan || '';
  const plan = planInfo(planKey);
  const metrics = details?.metrics || null;

  const memoryLimitBytes = metrics?.memoryLimit?.last || plan.memoryMb * 1024 * 1024;
  const memoryUsedBytes = metrics?.memory?.stats?.last || 0;
  const cpuLimit = metrics?.cpuLimit?.last || plan.cpu || 0;
  const cpuUsed = metrics?.cpu?.stats?.last || 0;

  return {
    id: service?.id,
    name: service?.name,
    type: service?.type,
    env: service?.env || serviceDetails.env || '',
    region: serviceDetails.region || '',
    branch: service?.branch || '',
    repo: service?.repo || '',
    suspended: service?.suspended || 'not_suspended',
    dashboardUrl: service?.dashboardUrl || `https://dashboard.render.com/web/${service?.id}`,
    url: serviceDetails.url || '',
    autoDeploy: service?.autoDeploy || '',
    createdAt: service?.createdAt || null,
    updatedAt: service?.updatedAt || null,
    plan: { key: String(planKey || '').toLowerCase().replace(/[\s-]+/g, '_'), ...plan },
    nextPlan: nextPlan(planKey),
    numInstances: serviceDetails.numInstances ?? metrics?.instances?.last ?? 1,
    autoscaling: serviceDetails.autoscaling || null,
    lastDeploy: details?.lastDeploy || null,
    failedDeploysRecent: details?.failedDeploysRecent ?? 0,
    metrics,
    usage: {
      memoryPercent: memoryLimitBytes ? (memoryUsedBytes / memoryLimitBytes) * 100 : null,
      memoryUsedMb: Math.round(memoryUsedBytes / 1024 / 1024),
      memoryLimitMb: Math.round(memoryLimitBytes / 1024 / 1024),
      memoryPeakMb: Math.round((metrics?.memory?.stats?.max || 0) / 1024 / 1024),
      cpuPercent: cpuLimit ? (cpuUsed / cpuLimit) * 100 : null,
      cpuUsed: Number(cpuUsed.toFixed(3)),
      cpuLimit: Number(Number(cpuLimit).toFixed(3)),
      cpuPeakPercent: cpuLimit ? ((metrics?.cpu?.stats?.max || 0) / cpuLimit) * 100 : null,
      requestsTotal: Math.round(metrics?.httpRequests?.total || 0),
      latencyP95Ms: Math.round((metrics?.latency?.p95?.avg || 0) * 1000),
      latencyP99Ms: Math.round((metrics?.latency?.p99?.max || 0) * 1000),
      bandwidthGb: Number(((metrics?.bandwidth?.totalBytes || 0) / 1024 ** 3).toFixed(3)),
    },
  };
}

async function fetchRenderState({ hours = 24, force = false } = {}) {
  return cached(
    `render:${hours}`,
    TTL_MS,
    async () => {
      if (!isConfigured()) {
        return {
          configured: false,
          message: 'Додайте RENDER_API_KEY в Environment сервісу, щоб бачити метрики Render.',
          services: [],
        };
      }

      const owners = await renderFetch('/owners?limit=20').catch(() => []);
      const rawServices = await renderFetch('/services?limit=100');
      const services = (Array.isArray(rawServices) ? rawServices : [])
        .map((item) => item?.service || item)
        .filter(Boolean);

      const enriched = await Promise.all(
        services.map(async (service) => {
          const [deploys, metrics] = await Promise.all([
            renderFetch(`/services/${service.id}/deploys?limit=10`).catch(() => []),
            service.type === 'cron_job' || service.type === 'static_site'
              ? Promise.resolve(null)
              : loadServiceMetrics(service.id, hours).catch(() => null),
          ]);
          const deployList = (Array.isArray(deploys) ? deploys : []).map((d) => d?.deploy || d).filter(Boolean);
          const lastDeploy = deployList[0]
            ? {
                id: deployList[0].id,
                status: deployList[0].status,
                createdAt: deployList[0].createdAt,
                finishedAt: deployList[0].finishedAt,
                commitMessage: deployList[0].commit?.message?.split('\n')[0] || '',
                trigger: deployList[0].trigger || '',
              }
            : null;
          const failedDeploysRecent = deployList.filter((d) =>
            ['build_failed', 'update_failed', 'canceled', 'pre_deploy_failed'].includes(d.status),
          ).length;
          return normalizeService(service, { metrics, lastDeploy, failedDeploysRecent });
        }),
      );

      const monthlyUsd = enriched.reduce((sum, service) => {
        const perInstance = service.plan.usd;
        if (perInstance == null) return sum;
        return sum + perInstance * Math.max(1, Number(service.numInstances) || 1);
      }, 0);

      return {
        configured: true,
        hours,
        owners: (Array.isArray(owners) ? owners : []).map((item) => item?.owner || item).filter(Boolean),
        services: enriched,
        estimate: {
          monthlyUsd,
          note: 'Оцінка за довідковими цінами інстанс-типів Render; не враховує диски, бази та трафік понад ліміт.',
        },
        billingUrl: 'https://dashboard.render.com/billing',
      };
    },
    { force },
  );
}

module.exports = { fetchRenderState, isConfigured, planInfo, nextPlan, RENDER_PLANS };
