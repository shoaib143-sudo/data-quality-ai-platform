import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(new URL('../supabase/migrations/20260919123000_agent_version_lifecycle.sql', import.meta.url), 'utf8')

test('illegal direct lifecycle jumps are absent from the allowlist', () => {
  assert.doesNotMatch(migration, /p_from = 'DRAFT'[^\n]+ACTIVE/)
  assert.doesNotMatch(migration, /p_from = 'VALIDATED'[^\n]+ACTIVE/)
  assert.doesNotMatch(migration, /p_from = 'RETIRED'[^\n]+ACTIVE/)
})

test('promotion is atomic and preserves rollback history', () => {
  assert.match(migration, /for update/)
  assert.match(migration, /set lifecycle_state = 'DEPRECATED'/)
  assert.match(migration, /set enabled = false/)
  assert.match(migration, /set enabled = \(v_target = 'ACTIVE'\)/)
  assert.match(migration, /agent_version_lifecycle_events/)
})

test('execution guard fails closed when lifecycle is missing or non active', () => {
  assert.match(migration, /v_state is distinct from 'ACTIVE'/)
  assert.match(migration, /coalesce\(v_state,'MISSING'\)/)
  assert.match(migration, /using errcode = '55000'/)
})

test('client roles cannot mutate lifecycle or call transition RPC', () => {
  assert.match(migration, /revoke all on agent\.agent_version_lifecycle from public, anon, authenticated/)
  assert.match(migration, /revoke all on function agent\.transition_agent_version_lifecycle\(uuid,text,uuid,text\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function agent\.transition_agent_version_lifecycle\(uuid,text,uuid,text\) to service_role/)
})
