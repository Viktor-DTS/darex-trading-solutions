/**
 * Агрегована статистика заявок для GPT-асистента (як GET /api/tasks/statistics).
 */
const mongoose = require('mongoose');

const DEFAULT_REGIONS = ['Київський', 'Одеський', 'Львівський', 'Дніпровський', 'Хмельницький', 'Україна'];

const STAT_LABELS = {
  notInWork: 'Не взято в роботу (статус «Заявка»)',
  inWork: 'В роботі',
  pendingWarehouse: 'Виконано, не підтверджено завскладом',
  pendingAccountant: 'Виконано, не підтверджено бухгалтером',
  pendingInvoiceRequests: 'Заявки на рахунки (pending/processing)',
};

/** @param {string} text */
function isTaskStatisticsQuery(text) {
  const s = String(text || '').trim();
  if (s.length < 8) return false;
  const hasCountIntent =
    /скільк\w*|кількість|число|статистик\w*|підрахун\w*|count|how\s+many/i.test(s);
  if (!hasCountIntent) return false;
  return /заяв\w*|задач\w*|task/i.test(s);
}

/** @param {string} roleLow */
function isElevatedStatsRole(roleLow) {
  const r = String(roleLow || '').toLowerCase();
  return (
    ['admin', 'administrator', 'mgradm'].includes(r) ||
    ['accountant', 'buhgalteria'].includes(r)
  );
}

/** @param {{ region?: string } | null | undefined} dbUser */
function userRegionList(dbUser) {
  const raw = String(dbUser?.region || '').trim();
  if (!raw || raw === 'Україна' || /загальн/i.test(raw)) return null;
  if (raw.includes(',')) {
    return [...new Set(raw.split(',').map((x) => x.trim()).filter(Boolean))];
  }
  return [raw];
}

/** @param {string} text */
function parseRegionFromStatisticsQuery(text) {
  const s = String(text || '').toLowerCase();
  if (/україн/i.test(s) && /регіон|усі|всі|загал/i.test(s)) return 'Україна';
  for (const name of DEFAULT_REGIONS) {
    if (name === 'Україна') continue;
    const stem = name.replace(/ський$/i, '').toLowerCase();
    if (stem.length >= 3 && s.includes(stem)) return name;
    if (s.includes(name.toLowerCase())) return name;
  }
  return null;
}

/** @param {string} text @returns {'inWork'|'notInWork'|'pendingWarehouse'|'pendingAccountant'|'all'} */
function detectStatisticsFocus(text) {
  const s = String(text || '').toLowerCase();
  if (/не\s+підтверд.*бухгалтер|бухгалтер.*не\s+підтверд|на\s+затверджен/i.test(s)) {
    return 'pendingAccountant';
  }
  if (/не\s+підтверд.*завсклад|завсклад.*не\s+підтверд|склад.*не\s+підтверд/i.test(s)) {
    return 'pendingWarehouse';
  }
  if (/не\s+(в\s+)?робот|не\s+взят|статус.*«?\s*заявк/i.test(s)) return 'notInWork';
  if (/\bв\s+робот/i.test(s) && !/не\s+(в\s+)?робот/i.test(s)) return 'inWork';
  return 'all';
}

/**
 * @param {{ login?: string, role?: string }} userJwt
 * @param {{ role?: string, region?: string } | null | undefined} dbUser
 * @param {string | null} requestedRegion
 */
function resolveStatisticsRegion(userJwt, dbUser, requestedRegion) {
  const jwtRole = String(userJwt?.role || '').toLowerCase();
  const dbRole = String(dbUser?.role || '').toLowerCase();
  const role = jwtRole || dbRole;
  const elevated = isElevatedStatsRole(role);
  const userRegions = userRegionList(dbUser);

  if (elevated) {
    return {
      ok: true,
      region: requestedRegion && requestedRegion !== 'Україна' ? requestedRegion : null,
      regionLabel: requestedRegion || 'усі регіони',
    };
  }

  if (!userRegions) {
    return {
      ok: true,
      region: requestedRegion && requestedRegion !== 'Україна' ? requestedRegion : null,
      regionLabel: requestedRegion || 'усі регіони',
    };
  }

  if (!requestedRegion) {
    const r = userRegions.length === 1 ? userRegions[0] : userRegions.join(', ');
    return { ok: true, region: userRegions.length === 1 ? userRegions[0] : null, regionLabel: r };
  }

  if (requestedRegion === 'Україна') {
    return {
      ok: userRegions.length > 1,
      region: userRegions.length > 1 ? null : userRegions[0],
      regionLabel: userRegions.join(', '),
      denied: userRegions.length <= 1,
    };
  }

  if (userRegions.includes(requestedRegion)) {
    return { ok: true, region: requestedRegion, regionLabel: requestedRegion };
  }

  return {
    ok: false,
    region: requestedRegion,
    regionLabel: requestedRegion,
    userRegions,
  };
}

/** @param {string | null} region */
function regionMongoFilter(region) {
  if (!region) return {};
  return { serviceRegion: region };
}

/**
 * @param {import('mongoose').Model} Task
 * @param {import('mongoose').Model | null | undefined} InvoiceRequest
 * @param {string | null} region
 */
async function fetchTaskStatisticsCounts(Task, InvoiceRequest, region) {
  const regionFilter = regionMongoFilter(region);
  const [notInWork, inWork, pendingWarehouse, pendingAccountant, pendingInvoiceRequests] =
    await Promise.all([
      Task.countDocuments({ ...regionFilter, status: 'Заявка' }),
      Task.countDocuments({ ...regionFilter, status: 'В роботі' }),
      Task.countDocuments({
        ...regionFilter,
        status: 'Виконано',
        approvedByWarehouse: { $nin: ['Підтверджено', true] },
      }),
      Task.countDocuments({
        ...regionFilter,
        status: 'Виконано',
        $or: [{ approvedByWarehouse: 'Підтверджено' }, { approvedByWarehouse: true }],
        approvedByAccountant: { $nin: ['Підтверджено', true] },
      }),
      InvoiceRequest
        ? InvoiceRequest.countDocuments({ status: { $in: ['pending', 'processing'] } })
        : Promise.resolve(0),
    ]);

  return { notInWork, inWork, pendingWarehouse, pendingAccountant, pendingInvoiceRequests };
}

/** @param {Record<string, number>} stats @param {'inWork'|'notInWork'|'pendingWarehouse'|'pendingAccountant'|'all'} focus */
function formatStatisticsReplyUk(regionLabel, stats, focus) {
  const regionPhrase =
    regionLabel === 'усі регіони'
      ? '**усіх регіонах**'
      : `**${regionLabel.replace(/ський$/i, 'ському')}** регіоні`;

  if (focus !== 'all' && Object.prototype.hasOwnProperty.call(stats, focus)) {
    const n = stats[focus];
    const label = STAT_LABELS[focus] || focus;
    return `У ${regionPhrase} зараз **${n}** — ${label.toLowerCase()}.`;
  }

  const header =
    regionLabel === 'усі регіони'
      ? 'Статистика заявок (**усі регіони**):'
      : `Статистика заявок (${regionPhrase}):`;
  const lines = [
    header,
    `• ${STAT_LABELS.notInWork}: **${stats.notInWork}**`,
    `• ${STAT_LABELS.inWork}: **${stats.inWork}**`,
    `• ${STAT_LABELS.pendingWarehouse}: **${stats.pendingWarehouse}**`,
    `• ${STAT_LABELS.pendingAccountant}: **${stats.pendingAccountant}**`,
  ];
  if (stats.pendingInvoiceRequests > 0) {
    lines.push(`• ${STAT_LABELS.pendingInvoiceRequests}: **${stats.pendingInvoiceRequests}**`);
  }
  return lines.join('\n');
}

/** @param {string} regionLabel @param {Record<string, number>} stats */
function buildStatisticsLlmBlock(regionLabel, stats) {
  let block = `[DTS-stats] Агрегована статистика заявок (${regionLabel}), дані з бази DTS:\n`;
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    if (Object.prototype.hasOwnProperty.call(stats, key)) {
      block += `- ${label}: ${stats[key]}\n`;
    }
  }
  block +=
    'Це підрахунки по полях status / approvedByWarehouse / approvedByAccountant; не потребують номера однієї заявки. ' +
    'Відповідай коротко цифрами з цього блоку; не проси номер заявки для такого запиту.';
  return block.trim();
}

/**
 * Короткий шлях: одразу відповідь без LLM.
 * @param {{ login?: string, role?: string }} userJwt
 * @param {{ role?: string, region?: string } | null | undefined} dbUserLean
 * @param {string} messageText
 */
async function tryTaskStatisticsTurn({ userJwt, dbUserLean, messageText }) {
  if (!isTaskStatisticsQuery(messageText)) {
    return { handled: false };
  }

  const Task = mongoose.models.Task;
  if (!Task) {
    return {
      handled: true,
      reply: 'Зараз не вдалося отримати статистику заявок — модель Task недоступна.',
    };
  }

  const InvoiceRequest = mongoose.models.InvoiceRequest;
  const requestedRegion = parseRegionFromStatisticsQuery(messageText);
  const access = resolveStatisticsRegion(userJwt, dbUserLean, requestedRegion);

  if (!access.ok) {
    const yours = (access.userRegions || []).join(', ') || 'ваш регіон';
    return {
      handled: true,
      reply:
        `Статистику для регіону **${access.regionLabel}** ваш профіль не показує. ` +
        `Доступні дані: **${yours}**. Уточніть регіон або зверніться до адміністратора.`,
    };
  }

  const focus = detectStatisticsFocus(messageText);
  const stats = await fetchTaskStatisticsCounts(Task, InvoiceRequest, access.region);
  const reply = formatStatisticsReplyUk(access.regionLabel, stats, focus);

  return {
    handled: true,
    reply,
    statsMeta: { region: access.regionLabel, focus, ...stats },
  };
}

/**
 * Контекст для LLM (якщо не short-circuit).
 * @param {{ login?: string, role?: string }} userJwt
 * @param {string} messageText
 * @param {{ dbUserLean?: object | null }} [opts]
 */
async function buildTaskStatisticsContextForLlm(userJwt, messageText, opts = {}) {
  if (!isTaskStatisticsQuery(messageText)) {
    return { textForLlm: '', meta: null };
  }

  const Task = mongoose.models.Task;
  if (!Task) return { textForLlm: '', meta: null };

  const dbUser = opts.dbUserLean;
  const requestedRegion = parseRegionFromStatisticsQuery(messageText);
  const access = resolveStatisticsRegion(userJwt, dbUser, requestedRegion);
  if (!access.ok) {
    return {
      textForLlm:
        `[DTS-stats] Користувач питає про статистику регіону «${access.regionLabel}», але профіль обмежений регіонами: ${(access.userRegions || []).join(', ') || '—'}. Поясни обмеження доступу.`,
      meta: { denied: true, region: access.regionLabel },
    };
  }

  const InvoiceRequest = mongoose.models.InvoiceRequest;
  const stats = await fetchTaskStatisticsCounts(Task, InvoiceRequest, access.region);
  return {
    textForLlm: buildStatisticsLlmBlock(access.regionLabel, stats),
    meta: { region: access.regionLabel, ...stats },
  };
}

module.exports = {
  isTaskStatisticsQuery,
  tryTaskStatisticsTurn,
  buildTaskStatisticsContextForLlm,
  fetchTaskStatisticsCounts,
  parseRegionFromStatisticsQuery,
};
