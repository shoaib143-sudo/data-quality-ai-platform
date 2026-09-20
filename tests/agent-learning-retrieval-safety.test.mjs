import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

function read(path) {
  return fs.readFileSync(path, 'utf8')
}

test('semantic learning index only publishes verified governed outcomes', () => {
  const source = read('lib/governance/semantic-agent-learning-indexer.ts')
  for (const token of [
    "row.source_kind === 'GOVERNED_ACTION_OUTCOME'",
    "row.decision_status === 'VERIFIED'",
    "row.outcome_status === 'VERIFIED'",
    'hasGovernedOutcomeEvidence(row.evidence)',
    '!hasSyntheticBootstrap(row.evidence)',
    '.filter(indexableLearningCase)',
  ]) assert.ok(source.includes(token), `missing semantic learning safety token: ${token}`)
})

test('legacy durable memory retrieval excludes unvalidated semantic memory', () => {
  const source = read('lib/agents/agent-memory.ts')
  for (const token of [
    'governedDurableMemoryEligible',
    "memoryType !== 'SEMANTIC'",
    'human_validated === true',
    '.filter(governedDurableMemoryEligible)',
  ]) assert.ok(source.includes(token), `missing durable memory safety token: ${token}`)
})

test('database learning search fails closed to verified governed outcomes', () => {
  const source = read('supabase/migrations/20260920045000_agent_learning_retrieval_safety.sql')
  for (const token of [
    "lc.source_kind = 'GOVERNED_ACTION_OUTCOME'",
    'lc.source_agent_run_id is not null',
    "lc.decision_status = 'VERIFIED'",
    "lc.outcome_status = 'VERIFIED'",
    'governed_action_outcome_id',
    'synthetic_bootstrap',
  ]) assert.ok(source.includes(token), `missing database learning safety token: ${token}`)
})
