import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migration = fs.readFileSync(
  'supabase/migrations/20260920048000_agent_evidence_retention_cleanup.sql',
  'utf8',
)
const service = fs.readFileSync('lib/agents/evidence-lifecycle.ts', 'utf8')
const worker = fs.readFileSync('lib/orchestration/worker-service.ts', 'utf8')

test('legal-hold placement and cleanup serialize on the same evidence identity', () => {
  for (const token of [
    "hashtextextended(p_evidence_type || ':' || p_evidence_id::text, 0)",
    "hashtextextended('ARTIFACT:' || v_candidate.id::text, 0)",
    "hashtextextended('MESSAGE:' || v_candidate.id::text, 0)",
  ]) assert.ok(migration.includes(token), `missing evidence lock: ${token}`)
})

test('cleanup preserves evidence that cannot be safely deleted', () => {
  for (const token of [
    'h.active = true',
    'governance.ai_governance_suggestions',
    "disposition := 'GOVERNANCE_REFERENCE'",
    "disposition := 'STORAGE_BACKED'",
  ]) assert.ok(migration.includes(token), `missing retention preservation rule: ${token}`)
  assert.equal(migration.includes('delete from governance.audit_events'), false)
})

test('cleanup deletes only expired inline artifacts and expired messages', () => {
  for (const token of [
    'a.retention_until <= now()',
    'm.retention_until <= now()',
    'delete from agent.agent_artifacts',
    'delete from agent.agent_messages',
  ]) assert.ok(migration.includes(token), `missing retention deletion condition: ${token}`)
})

test('retention enforcement is service-only and scheduled', () => {
  assert.ok(service.includes("rpc('place_evidence_legal_hold_internal'"))
  assert.ok(service.includes("rpc('cleanup_expired_evidence_internal'"))
  assert.ok(worker.includes('cleanupExpiredAgentEvidence(50)'))
  assert.ok(migration.includes('from public, anon, authenticated'))
  assert.ok(migration.includes('to service_role'))
})
