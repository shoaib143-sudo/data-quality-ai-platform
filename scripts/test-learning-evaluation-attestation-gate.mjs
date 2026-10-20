import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20261020063000_block_unattested_learning_improvements.sql', 'utf8')
const service = fs.readFileSync('lib/agents/governed-learning-evaluation-service.ts', 'utf8')

assert.match(migration, /create or replace function agent\.reject_unattested_learning_improvement\(\)/i)
assert.match(migration, /before insert on agent\.learning_evaluation_results[\s\S]*?execute function agent\.reject_unattested_learning_improvement\(\)/i)
assert.match(migration, /if new\.quality = 'IMPROVED'[\s\S]*?raise exception/i)
assert.match(migration, /errcode = '23514'/i)
assert.match(migration, /server-derived evidence attestation is required/i)
assert.match(service, /input\.result\.independentlyVerified[\s\S]*?input\.result\.evidenceComplete[\s\S]*?input\.result\.confirmationWindowPassed[\s\S]*?input\.result\.accountingComplete[\s\S]*?Caller-supplied verification claims are not accepted/i)
const writeStart = service.indexOf('export async function recordLearningEvaluationDecision')
const writeEnd = service.indexOf('\nexport async function loadLearningReleaseAdmission', writeStart)
const writeBody = service.slice(writeStart, writeEnd)
assert.match(writeBody, /result writes are disabled until server-owned evidence attestation is available/i)
assert.ok(!writeBody.includes("rpc('record_learning_evaluation_result'"), 'no caller-aggregated result may reach the legacy RPC')

console.log('PASS application blocks all caller-aggregated results; the DB trigger blocks unattested IMPROVED rows')
console.log('NOTE SQL was statically checked only. No PostgreSQL or Supabase migration was run.')
