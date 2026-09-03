/**
 * Агрегована статистика заявок для GPT-асистента (як GET /api/tasks/statistics).
 */
const mongoose = require('mongoose');
const {
  normalizeQueryText,
  softenForMatching,
  extractClientNameCandidate,
} = require('./assistantQueryNormalize');

const DEFAULT_REGIONS = ['Київський', 'Одеський', 'Львівський', 'Дніпровський', 'Хмельницький', 'Україна'];

const STAT_LABELS = {
  notInWork: 'Не взято в роботу (статус «Заявка»)',
  inWork: 'В роботі',
  pendingWarehouse: 'Виконано, не підтверджено завскладом',
  pendingAccountant: 'Виконано, не підтверджено бухгалтером',
  pendingInvoiceRequests: 'Заявки на рахунки (pending/processing)',
};

const SUM_FIELD_NOTE =
  'Сума по полях serviceTotal (пріоритет) або workPrice, як у таблицях DTS; порожні значення = 0.';

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} text */
function parseCounterpartyFromQuery(text) {
  const fromHelper = extractClientNameCandidate(text);
  if (fromHelper) return fromHelper;

  const s = normalizeQueryText(text);
  const patterns = [
    /(?:контрагент\w*|клієнт\w*|компан\w*)\s+["«]?([^"»?\n.]{2,80})/iu,
    /(?:у|в)\s+(?:клієнта|контрагента)\s+["«]?([^"»?\n.]{2,80})/iu,
    /по\s+контрагент\w*\s+["«]?([^"»?\n.]{2,80})/iu,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m?.[1]) continue;
    const name = m[1].trim().replace(/[,.?]$/, '');
    if (name.length < 2) continue;
    if (/регіон|києв|львів|одес|дніпр|хмельниц|україн/i.test(name)) continue;
    return name;
  }
  return null;
}

/** @param {string} text */
function isCounterpartyStatisticsQuery(text) {
  const s = softenForMatching(text);
  if (!/(?:скільк\w*|кільк\w*)/iu.test(s)) return false;
  if (!/заяв\w*/iu.test(s)) return false;
  if (/контрагент|клієнт|компан/i.test(s)) return true;
  return Boolean(parseCounterpartyFromQuery(text));
}

/** @param {string} text */
function isTaskStatisticsQuery(text) {
  const s = softenForMatching(text);
  if (s.length < 6) return false;
  const hasCountIntent =
    /скільк\w*|кільк\w*|число|статистик\w*|підрахун\w*|count|how\s+many/i.test(s);
  const hasSumIntent = /сума|суми|загальн\w*\s+сума|разом|вартість|гривн|₴|uah/i.test(s);
  const aboutTasks = /заяв\w*|задач\w*|task|робіт\w*|робот\w*/i.test(s);
  if (hasCountIntent && /заяв\w*|задач\w*|task/i.test(s)) return true;
  if (hasSumIntent && aboutTasks) return true;
  return false;
}

/** @param {string} text @returns {'count'|'sum'} */
function detectStatisticsKind(text) {
  if (/сума|суми|загальн\w*\s+сума|разом|вартість|гривн|₴|uah/i.test(String(text || ''))) return 'sum';
  return 'count';
}

/** @param {number} amount */
function formatUah(amount) {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  return `${new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} грн`;
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

/** @param {import('mongoose').Model} Task @param {string} clientName @param {string | null} region */
function buildCounterpartyMatch(clientName, region) {
  const esc = escapeRegex(clientName.trim());
  if (!esc) return null;
  const clientFilter = {
    $or: [{ client: new RegExp(esc, 'i') }, { clientName: new RegExp(esc, 'i') }],
  };
  return { ...clientFilter, ...regionMongoFilter(region) };
}

/**
 * @param {import('mongoose').Model} Task
 * @param {string} clientName
 * @param {string | null} region
 */
async function fetchCounterpartyTaskStats(Task, clientName, region) {
  const match = buildCounterpartyMatch(clientName, region);
  if (!match) {
    return { total: 0, inWork: 0, notInWork: 0, done: 0, clientName };
  }

  const [total, inWork, notInWork, done] = await Promise.all([
    Task.countDocuments(match),
    Task.countDocuments({ ...match, status: 'В роботі' }),
    Task.countDocuments({ ...match, status: 'Заявка' }),
    Task.countDocuments({ ...match, status: 'Виконано' }),
  ]);

  return { total, inWork, notInWork, done, clientName };
}

/** @param {string} regionLabel @param {{ total: number, inWork: number, notInWork: number, done: number, clientName: string }} stats */
function formatCounterpartyStatsReplyUk(regionLabel, stats) {
  const regionNote =
    regionLabel === 'усі регіони'
      ? ''
      : ` (регіон **${regionLabel.replace(/ський$/i, 'ський')}**)`;
  if (stats.total === 0) {
    return (
      `Заявок для контрагента **${stats.clientName}**${regionNote} не знайдено. ` +
      'Перевірте написання назви або спробуйте ЄДРПОУ в discovery-пошуку.'
    );
  }
  const lines = [
    `У контрагента **${stats.clientName}**${regionNote}: **${stats.total}** заявок.`,
    `• «Заявка» (не в роботі): **${stats.notInWork}**`,
    `• «В роботі»: **${stats.inWork}**`,
    `• «Виконано»: **${stats.done}**`,
  ];
  return lines.join('\n');
}

/** @param {'inWork'|'notInWork'|'pendingWarehouse'|'pendingAccountant'} focus @param {string | null} region */
function buildFocusMatch(focus, region) {
  const regionFilter = regionMongoFilter(region);
  switch (focus) {
    case 'notInWork':
      return { ...regionFilter, status: 'Заявка' };
    case 'inWork':
      return { ...regionFilter, status: 'В роботі' };
    case 'pendingWarehouse':
      return {
        ...regionFilter,
        status: 'Виконано',
        approvedByWarehouse: { $nin: ['Підтверджено', true] },
      };
    case 'pendingAccountant':
      return {
        ...regionFilter,
        status: 'Виконано',
        $or: [{ approvedByWarehouse: 'Підтверджено' }, { approvedByWarehouse: true }],
        approvedByAccountant: { $nin: ['Підтверджено', true] },
      };
    default:
      return regionFilter;
  }
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
      Task.countDocuments(buildFocusMatch('notInWork', region)),
      Task.countDocuments(buildFocusMatch('inWork', region)),
      Task.countDocuments(buildFocusMatch('pendingWarehouse', region)),
      Task.countDocuments(buildFocusMatch('pendingAccountant', region)),
      InvoiceRequest
        ? InvoiceRequest.countDocuments({ status: { $in: ['pending', 'processing'] } })
        : Promise.resolve(0),
    ]);

  return { notInWork, inWork, pendingWarehouse, pendingAccountant, pendingInvoiceRequests };
}

/**
 * @param {import('mongoose').Model} Task
 * @param {'inWork'|'notInWork'|'pendingWarehouse'|'pendingAccountant'} focus
 * @param {string | null} region
 */
async function fetchWorkSumForFocus(Task, focus, region) {
  const match = buildFocusMatch(focus, region);
  const rows = await Task.aggregate([
    { $match: match },
    {
      $addFields: {
        _st: {
          $convert: { input: { $ifNull: ['$serviceTotal', 0] }, to: 'double', onError: 0, onNull: 0 },
        },
        _wp: {
          $convert: { input: { $ifNull: ['$workPrice', 0] }, to: 'double', onError: 0, onNull: 0 },
        },
      },
    },
    {
      $addFields: {
        _amount: {
          $cond: [{ $gt: ['$_st', 0] }, '$_st', '$_wp'],
        },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalAmount: { $sum: '$_amount' },
        withAmount: { $sum: { $cond: [{ $gt: ['$_amount', 0] }, 1, 0] } },
      },
    },
  ]);

  const row = rows[0] || { count: 0, totalAmount: 0, withAmount: 0 };
  return {
    count: row.count || 0,
    totalAmount: row.totalAmount || 0,
    withAmount: row.withAmount || 0,
    focus,
  };
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

/** @param {string} regionLabel */
function regionPhraseUk(regionLabel) {
  if (regionLabel === 'усі регіони') return '**усіх регіонах**';
  return `**${regionLabel.replace(/ський$/i, 'ському')}** регіоні`;
}

/**
 * @param {string} regionLabel
 * @param {{ count: number, totalAmount: number, withAmount: number, focus: string }} sumRow
 */
function formatWorkSumReplyUk(regionLabel, sumRow) {
  const region = regionPhraseUk(regionLabel);
  const label = STAT_LABELS[sumRow.focus] || sumRow.focus;
  const { count, totalAmount, withAmount } = sumRow;

  if (count === 0) {
    return `У ${region} зараз немає заявок у категорії «${label}».`;
  }

  if (totalAmount <= 0) {
    return (
      `У ${region} **${count}** заявок у категорії «${label}», ` +
      `але сума робіт (serviceTotal/workPrice) у них не заповнена або дорівнює 0. ` +
      `Перевірте вкладку «Бух на затвердженні» / таблицю заявок у DTS.`
    );
  }

  const filledNote =
    withAmount < count
      ? ` (сума заповнена в ${withAmount} з ${count} заявок; решта без суми врахована як 0)`
      : '';

  return (
    `У ${region} сума робіт по **${count}** заявках («${label}»): **${formatUah(totalAmount)}**${filledNote}.`
  );
}

/** @param {string} regionLabel @param {{ count: number, totalAmount: number, withAmount: number, focus: string }} sumRow */
function buildWorkSumLlmBlock(regionLabel, sumRow) {
  const label = STAT_LABELS[sumRow.focus] || sumRow.focus;
  let block =
    `[DTS-stats-sum] Сума робіт (${regionLabel}), категорія «${label}», дані з бази DTS:\n` +
    `- Кількість заявок: ${sumRow.count}\n` +
    `- Загальна сума: ${formatUah(sumRow.totalAmount)}\n` +
    `- Заповнене поле суми: ${sumRow.withAmount} з ${sumRow.count}\n` +
    `- ${SUM_FIELD_NOTE}\n` +
    'Не вигадуй інших цифр; не кажи 0, якщо тут указана ненульова сума або count > 0.';
  return block.trim();
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
  const counterpartyName = parseCounterpartyFromQuery(messageText);
  const counterpartyQuery = isCounterpartyStatisticsQuery(messageText) && counterpartyName;

  if (!counterpartyQuery && !isTaskStatisticsQuery(messageText)) {
    return { handled: false };
  }

  const Task = mongoose.models.Task;
  if (!Task) {
    return {
      handled: true,
      reply: 'Зараз не вдалося отримати статистику заявок — модель Task недоступна.',
    };
  }

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

  if (counterpartyQuery) {
    const cpStats = await fetchCounterpartyTaskStats(Task, counterpartyName, access.region);
    const reply = formatCounterpartyStatsReplyUk(access.regionLabel, cpStats);
    return {
      handled: true,
      reply,
      statsMeta: {
        region: access.regionLabel,
        kind: 'counterparty',
        client: counterpartyName,
        ...cpStats,
      },
    };
  }

  const focus = detectStatisticsFocus(messageText);
  const kind = detectStatisticsKind(messageText);

  if (kind === 'sum') {
    const sumFocus =
      focus === 'all'
        ? /бухгалтер|затверджен/i.test(messageText)
          ? 'pendingAccountant'
          : /завсклад|склад/i.test(messageText)
            ? 'pendingWarehouse'
            : /в\s+робот/i.test(messageText)
              ? 'inWork'
              : 'pendingAccountant'
        : focus;
    const sumRow = await fetchWorkSumForFocus(Task, sumFocus, access.region);
    const reply = formatWorkSumReplyUk(access.regionLabel, sumRow);
    return {
      handled: true,
      reply,
      statsMeta: { region: access.regionLabel, kind: 'sum', focus: sumFocus, ...sumRow },
    };
  }

  const InvoiceRequest = mongoose.models.InvoiceRequest;
  const stats = await fetchTaskStatisticsCounts(Task, InvoiceRequest, access.region);
  const reply = formatStatisticsReplyUk(access.regionLabel, stats, focus);

  return {
    handled: true,
    reply,
    statsMeta: { region: access.regionLabel, kind: 'count', focus, ...stats },
  };
}

/**
 * Контекст для LLM (якщо не short-circuit).
 * @param {{ login?: string, role?: string }} userJwt
 * @param {string} messageText
 * @param {{ dbUserLean?: object | null }} [opts]
 */
async function buildTaskStatisticsContextForLlm(userJwt, messageText, opts = {}) {
  const counterpartyName = parseCounterpartyFromQuery(messageText);
  const counterpartyQuery = isCounterpartyStatisticsQuery(messageText) && counterpartyName;
  if (!counterpartyQuery && !isTaskStatisticsQuery(messageText)) {
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

  if (counterpartyQuery) {
    const cpStats = await fetchCounterpartyTaskStats(Task, counterpartyName, access.region);
    const block =
      `[DTS-stats-counterparty] Заявки контрагента «${cpStats.clientName}» (${access.regionLabel}), дані з бази DTS:\n` +
      `- Усього: ${cpStats.total}\n` +
      `- «Заявка»: ${cpStats.notInWork}\n` +
      `- «В роботі»: ${cpStats.inWork}\n` +
      `- «Виконано»: ${cpStats.done}\n` +
      'Відповідай цифрами з блоку; не вигадуй.';
    return {
      textForLlm: block.trim(),
      meta: { region: access.regionLabel, kind: 'counterparty', ...cpStats },
    };
  }

  const focus = detectStatisticsFocus(messageText);
  const kind = detectStatisticsKind(messageText);

  if (kind === 'sum') {
    const sumFocus =
      focus === 'all'
        ? /бухгалтер|затверджен/i.test(messageText)
          ? 'pendingAccountant'
          : 'pendingAccountant'
        : focus;
    const sumRow = await fetchWorkSumForFocus(Task, sumFocus, access.region);
    return {
      textForLlm: buildWorkSumLlmBlock(access.regionLabel, sumRow),
      meta: { region: access.regionLabel, kind: 'sum', ...sumRow },
    };
  }

  const InvoiceRequest = mongoose.models.InvoiceRequest;
  const stats = await fetchTaskStatisticsCounts(Task, InvoiceRequest, access.region);
  return {
    textForLlm: buildStatisticsLlmBlock(access.regionLabel, stats),
    meta: { region: access.regionLabel, kind: 'count', ...stats },
  };
}

module.exports = {
  isTaskStatisticsQuery,
  isCounterpartyStatisticsQuery,
  parseCounterpartyFromQuery,
  detectStatisticsKind,
  tryTaskStatisticsTurn,
  buildTaskStatisticsContextForLlm,
  fetchTaskStatisticsCounts,
  fetchCounterpartyTaskStats,
  fetchWorkSumForFocus,
  parseRegionFromStatisticsQuery,
};
