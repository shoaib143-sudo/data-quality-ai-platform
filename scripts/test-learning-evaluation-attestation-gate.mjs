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
assert.match(service, /if \(decision\.quality === 'IMPROVED'\)[\s\S]*?server-derived evidence attestation is required/i)

console.log('PASS application and database boundaries fail closed on caller-asserted evidence and unattested IMPROVED results')
console.log('NOTE SQL was statically checked only. No PostgreSQL or Supabase migration was run.')
