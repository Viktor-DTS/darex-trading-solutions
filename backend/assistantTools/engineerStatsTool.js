/**
 * Tool: статистика заявок по інженеру (engineer1..6).
 */
const mongoose = require('mongoose');
const { TASK_ENGINEER_FIELDS } = require('../lib/taskAggregationExpr');
const { sanitizeClientSearchTerm } = require('../assistantQueryNormalize');

const ENGINEER_FIELDS = TASK_ENGINEER_FIELDS;

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} name */
function engineerSearchPattern(name) {
  const cleaned = sanitizeClientSearchTerm(name);
  const parts = cleaned.split(/\s+/).filter((p) => p.length >= 2);
  if (!parts.length) return null;
  return new RegExp(parts.map(escapeRegex).join('.*'), 'i');
}

/** @param {string} name */
function buildEngineerMatch(name) {
  const re = engineerSearchPattern(name);
  if (!re) return null;
  return { $or: ENGINEER_FIELDS.map((f) => ({ [f]: re })) };
}

/**
 * @param {string} text
 * @returns {{ name: string, focus: 'all'|'completed'|'inWork'|'participations' } | null}
 */
function parseEngineerStatsQuery(text) {
  const s = String(text || '').trim();
  const patterns = [
    /(?:скільк\p{L}*\s+(?:робіт|заяв\p{L}*)\s+(?:виконав|зробив|провів|закрив|виконала|зробила|мав|мала))\s+(.+?)(?:\s+за|\s+у|\s+в|\?|$)/iu,
    /(?:скільк\p{L}*\s+(?:у|в)\s+(?:інженера|користувача|співробітника|оператора))\s+(.+?)(?:\s+викон|\?|$)/iu,
    /(?:скільк\p{L}*\s+(?:заяв\p{L}*|робіт)\s+(?:в|у)\s+робот\p{L}*\s+(?:у|в)\s+(?:інженера\s+)?)(.+?)(?:\s+за|\?|$)/iu,
    /(?:інженер|користувач|співробітник)\s+(.+?)\s+(?:виконав|зробив|провів)/iu,
    /(?:виконав|зробив|провів)\s+(.+?)\s+(?:робіт|заяв\p{L}*)/iu,
    /(?:скільк\p{L}*\s+виконав\s+(?:інженер\s+)?)(.+?)(?:\s+за|\?|$)/iu,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) {
      let name = sanitizeClientSearchTerm(m[1]);
      name = name.replace(/\s+(?:за\s+)?(?:місяць|тиждень|рік|202\d).*$/iu, '').trim();
      if (name.length >= 2) {
        const focus = /в\s+робот\p{L}*/iu.test(s) && !/викон/i.test(s) ? 'inWork' : 'completed';
        return { name, focus };
      }
    }
  }
  if (/скільк\p{L}*\s+(?:я|мої|моїх|мною)\s+(?:виконав|зробив|мав|маю|має)/iu.test(s)) {
    return { name: null, focus: /в\s+робот\p{L}*/iu.test(s) ? 'inWork' : 'completed', self: true };
  }
  if (/скільк\p{L}*\s+(?:я|мої|моїх)\s+(?:робіт|заяв\p{L}*)/iu.test(s)) {
    return { name: null, focus: /в\s+робот\p{L}*/iu.test(s) ? 'inWork' : 'completed', self: true };
  }
  return null;
}

/** @param {string} text */
function isEngineerStatsQuery(text) {
  return Boolean(parseEngineerStatsQuery(text));
}

/**
 * @param {import('mongoose').Model} Task
 * @param {string} engineerName
 * @param {{ focus?: string, region?: string | null }} opts
 */
async function fetchEngineerTaskStats(Task, engineerName, opts = {}) {
  const match = buildEngineerMatch(engineerName);
  if (!match) {
    return { participations: 0, completed: 0, inWork: 0, notInWork: 0, engineerName };
  }
  if (opts.region) match.serviceRegion = opts.region;

  const [participations, completed, inWork, notInWork] = await Promise.all([
    Task.countDocuments(match),
    Task.countDocuments({ ...match, status: 'Виконано' }),
    Task.countDocuments({ ...match, status: 'В роботі' }),
    Task.countDocuments({ ...match, status: 'Заявка' }),
  ]);

  return { participations, completed, inWork, notInWork, engineerName };
}

/** @param {{ participations: number, completed: number, inWork: number, engineerName: string }} stats @param {string} focus */
function formatEngineerStatsReplyUk(stats, focus = 'completed') {
  const name = stats.engineerName;
  if (stats.participations === 0) {
    return (
      `Заявок з інженером **${name}** у полях engineer1–6 не знайдено. ` +
      'Перевірте написання ПІБ (як у таблиці DTS) або спробуйте прізвище.'
    );
  }
  if (focus === 'inWork') {
    return (
      `Інженер **${name}**: **${stats.inWork}** заяв${stats.inWork === 1 ? 'ка' : stats.inWork < 5 ? 'ки' : 'ок'} ` +
      `у статусі «В роботі» (усього участей у заявках: ${stats.participations}).`
    );
  }
  if (focus === 'participations') {
    return (
      `Інженер **${name}** згаданий у **${stats.participations}** заявках ` +
      `(engineer1–6; одна заявка з двома інженерами = +1 кожному).`
    );
  }
  return (
    `Інженер **${name}** **виконав ${stats.completed}** заяв${stats.completed === 1 ? 'ку' : stats.completed < 5 ? 'ки' : 'ок'} ` +
    `(status «Виконано»; участей у заявках загалом: ${stats.participations}, ` +
    `зараз «В роботі»: ${stats.inWork}).`
  );
}

/**
 * @param {{ messageText: string, userJwt: object, dbUserLean: object | null }} ctx
 */
async function runEngineerStatsTool(ctx) {
  const parsed = parseEngineerStatsQuery(ctx.messageText);
  if (!parsed) return { handled: false };

  const Task = mongoose.models.Task;
  if (!Task) {
    return { handled: true, reply: 'Модель Task недоступна для підрахунку по інженеру.' };
  }

  let engineerName = parsed.name;
  if (parsed.self || !engineerName) {
    engineerName =
      String(ctx.dbUserLean?.name || ctx.userJwt?.name || ctx.userJwt?.login || '').trim();
  }
  if (!engineerName) {
    return {
      handled: true,
      reply: 'Вкажіть ПІБ інженера або переконайтеся, що у вашому профілі заповнено поле name.',
    };
  }

  const stats = await fetchEngineerTaskStats(Task, engineerName, { focus: parsed.focus });
  const focus = parsed.focus === 'inWork' ? 'inWork' : 'completed';
  const reply = formatEngineerStatsReplyUk(stats, focus);

  return {
    handled: true,
    reply,
    tool: 'engineer_stats',
    meta: { ...stats, focus, parsedSelf: Boolean(parsed.self) },
    llmBlock:
      `[DTS-tool-engineer_stats]\n` +
      `Інженер: ${engineerName}\n` +
      `- Участей (engineer1..6): ${stats.participations}\n` +
      `- Виконано (status): ${stats.completed}\n` +
      `- В роботі: ${stats.inWork}\n` +
      `- Заявка (не в роботі): ${stats.notInWork}\n` +
      'Цифри з MongoDB; не вигадуй інших значень.',
  };
}

module.exports = {
  parseEngineerStatsQuery,
  isEngineerStatsQuery,
  fetchEngineerTaskStats,
  formatEngineerStatsReplyUk,
  runEngineerStatsTool,
};
