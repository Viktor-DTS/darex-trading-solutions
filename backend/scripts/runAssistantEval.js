#!/usr/bin/env node
/**
 * Eval асистента: planner + парсери (без LLM, без Mongo за замовчуванням).
 * node scripts/runAssistantEval.js
 */
const path = require('path');
const fs = require('fs');

const { planToolsForMessage } = require('../assistantToolRunner');
const { parseEngineerStatsQuery } = require('../assistantTools/engineerStatsTool');
const {
  isCounterpartyStatisticsQuery,
  parseCounterpartyFromQuery,
} = require('../assistantTaskStatistics');

const casesPath = path.join(__dirname, '../assistantEval/cases.json');
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

let passed = 0;
let failed = 0;

function setsEqual(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function clientMatches(got, expected) {
  if (!expected) return true;
  const g = norm(got);
  const e = norm(expected);
  return g.includes(e) || e.includes(g);
}

function fail(id, reason, detail) {
  failed += 1;
  console.log(`  ✗ ${id}: ${reason}`);
  if (detail) console.log(`      ${detail}`);
}

console.log(`\nDTS Assistant Eval — ${cases.cases.length} cases\n`);

for (const c of cases.cases) {
  const planned = planToolsForMessage(c.message);
  const issues = [];

  if (!setsEqual(planned, c.expectedTools)) {
    issues.push(`tools expected [${c.expectedTools.join(', ')}], got [${planned.join(', ')}]`);
  }
  if (Array.isArray(c.mustNotInclude)) {
    for (const t of c.mustNotInclude) {
      if (planned.includes(t)) issues.push(`must not include ${t}`);
    }
  }

  if (c.expectClient) {
    const parsed = parseCounterpartyFromQuery(c.message);
    if (!clientMatches(parsed, c.expectClient)) {
      issues.push(`client expected "${c.expectClient}", got "${parsed || '(null)'}"`);
    }
    if (!isCounterpartyStatisticsQuery(c.message)) {
      issues.push('isCounterpartyStatisticsQuery=false');
    }
  }

  if (c.expectEngineer || c.expectEngineerSelf) {
    const eng = parseEngineerStatsQuery(c.message);
    if (c.expectEngineerSelf) {
      if (!eng?.self) issues.push('expected self engineer query');
    } else if (!eng?.name || !norm(eng.name).includes(norm(c.expectEngineer))) {
      issues.push(`engineer expected "${c.expectEngineer}", got "${eng?.name || '(null)'}"`);
    }
    if (c.expectEngineerFocus && eng?.focus !== c.expectEngineerFocus) {
      issues.push(`engineer focus expected ${c.expectEngineerFocus}, got ${eng?.focus}`);
    }
  }

  if (issues.length === 0) {
    passed += 1;
    console.log(`  ✓ ${c.id}`);
  } else {
    fail(c.id, issues.join('; '));
  }
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
