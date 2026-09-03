/**
 * Оркестратор tools: planner → execute → direct reply або LLM block.
 */
const { buildKnowledgeLlmBlockUk } = require('./assistantKnowledge');
const { tryTaskStatisticsTurn } = require('./assistantTaskStatistics');
const { runEngineerStatsTool, isEngineerStatsQuery } = require('./assistantTools/engineerStatsTool');
const { buildHelpContextForLlm } = require('./assistantHelpContext');
const { looksLikeNavigationQuestion, softenForMatching } = require('./assistantQueryNormalize');
const { isCounterpartyStatisticsQuery } = require('./assistantTaskStatistics');

/** @type {Array<(ctx: object) => Promise<{ handled: boolean, reply?: string, llmBlock?: string, tool?: string, meta?: object }>>} */
const TOOL_RUNNERS = [
  runEngineerStatsTool,
  async (ctx) => {
    const turn = await tryTaskStatisticsTurn({
      userJwt: ctx.userJwt,
      dbUserLean: ctx.dbUserLean,
      messageText: ctx.messageText,
    });
    if (!turn.handled) return { handled: false };
    return {
      handled: true,
      reply: turn.reply,
      tool: turn.statsMeta?.kind === 'counterparty' ? 'client_stats' : 'regional_stats',
      meta: turn.statsMeta,
      llmBlock: `[DTS-tool-stats]\n${turn.reply}\n(дані з MongoDB через assistantTaskStatistics)`,
    };
  },
];

/**
 * @param {object} ctx
 * @param {string} ctx.messageText
 * @param {object} ctx.userJwt
 * @param {object | null} ctx.dbUserLean
 * @param {string} [ctx.panelId]
 */
async function runAssistantTools(ctx) {
  const results = [];
  for (const runner of TOOL_RUNNERS) {
    try {
      const out = await runner(ctx);
      if (out.handled) {
        results.push(out);
        if (out.reply) {
          return {
            handled: true,
            directReply: out.reply,
            toolResults: results,
            llmBlock: buildToolResultsLlmBlock(results),
          };
        }
      }
    } catch (e) {
      console.error('[assistant-tools]', e?.message || e);
    }
  }

  const help =
    looksLikeNavigationQuestion(ctx.messageText) ?
      buildHelpContextForLlm(ctx.messageText, ctx.panelId || '')
    : { textForLlm: '' };

  return {
    handled: false,
    toolResults: results,
    llmBlock: [buildKnowledgeLlmBlockUk(), help.textForLlm].filter(Boolean).join('\n\n'),
  };
}

/** @param {object[]} results */
function buildToolResultsLlmBlock(results) {
  const parts = results.map((r) => r.llmBlock || '').filter(Boolean);
  parts.unshift(buildKnowledgeLlmBlockUk());
  return parts.join('\n\n');
}

/** Для eval: який tool мав би спрацювати (без Mongo). */
function planToolsForMessage(messageText) {
  const planned = [];
  const raw = String(messageText || '');
  const softened = softenForMatching(raw);

  if (isEngineerStatsQuery(raw) || isEngineerStatsQuery(softened)) planned.push('engineer_stats');

  const isRegionalContext = /регіон\p{L}*|київськ|одеськ|львівськ|дніпров|хмельниц|україн/iu.test(raw);
  const isClientContext = isCounterpartyStatisticsQuery(raw) && !isRegionalContext;

  const hasStatsIntent =
    /скільк\p{L}*|статистик\p{L}*|сума|суми|разом|вартість/iu.test(softened) &&
    /заяв\p{L}*/iu.test(softened);

  if (hasStatsIntent) {
    if (isClientContext && !planned.includes('engineer_stats')) planned.push('client_stats');
    else if (!planned.includes('engineer_stats')) planned.push('regional_stats');
  }

  if (looksLikeNavigationQuestion(raw)) planned.push('navigation_help');
  if (/\b(?:kv|nu|dp)[-\s]?\d/i.test(raw)) planned.push('task_lookup');
  return planned;
}

module.exports = {
  runAssistantTools,
  planToolsForMessage,
  buildToolResultsLlmBlock,
};
