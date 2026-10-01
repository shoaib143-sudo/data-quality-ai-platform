import assert from 'node:assert/strict'
import fs from 'node:fs'

const catalog = fs.readFileSync(new URL('../lib/governance/agent-action-catalog.ts', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../supabase/migrations/20261001085000_learning_promotion_approval_authority_action.sql', import.meta.url), 'utf8')

assert.match(catalog, /PROMOTE_LEARNING_CANDIDATE/)
assert.match(catalog, /capability:\s*'agent\.admin'/)
assert.match(catalog, /materialProductionMutation:\s*true/)
assert.match(catalog, /reversibility:\s*'REVERSIBLE'/)
assert.match(migration, /PROMOTE_LEARNING_CANDIDATE/g)
assert.match(migration, /assign_agent_approval_authority/)
assert.doesNotMatch(migration, /insert\s+into\s+governance\.agent_approval_authorities/i)
assert.doesNotMatch(migration, /update\s+governance\.agent_approval_authorities/i)
assert.match(migration, /cannot assign direct approval authority to themselves/i)
assert.match(migration, /same individual cannot hold overlapping Business and Governance authority/i)
console.log('Learning promotion can be explicitly assigned through existing dual-axis governance without auto-granting authority')
