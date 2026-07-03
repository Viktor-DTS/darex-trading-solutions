#!/usr/bin/env node
require('dotenv').config();
const { runLearningCycle } = require('../services/learning');

runLearningCycle({ dryRun: process.argv.includes('--dry-run') })
  .then((r) => {
    console.log(r.report);
    console.log('\n--- JSON ---');
    console.log(JSON.stringify({ metrics: r.metrics, next: r.next, applied: r.applied }, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error('[learn]', e);
    process.exit(1);
  });
