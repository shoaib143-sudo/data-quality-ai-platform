import assert from 'node:assert/strict'
import fs from 'node:fs'

const guard = fs.readFileSync('supabase/migrations/20260915103000_agent_approval_execution_expiry_guard.sql', 'utf8')
const service = fs.readFileSync('lib/governance/agent-approval-service.ts', 'utf8')
const tests = fs.readFileSync('scripts/test-agent-approval-validity.sql', 'utf8')

const failures = []
function attack(name, fn) {
  try {
    fn()
    console.log(`PASS adversarial: ${name}`)
  } catch (error) {
    failures.push([name, error])
    console.error(`FAIL adversarial: ${name}: ${error instanceof Error ? error.message : error}`)
  }
}

attack('human execution cannot be inserted directly as EXECUTED', () => {
  assert.match(guard, /new\.status = 'EXECUTED'/)
  assert.match(guard, /tg_op <> 'UPDATE'/)
  assert.match(tests, /expected insert-as-executed human approval to fail/)
})

attack('approval-required flags cannot be downgraded after request creation', () => {
  assert.match(guard, /old\.requires_business_approval is distinct from new\.requires_business_approval/)
  assert.match(guard, /old\.requires_governance_approval is distinct from new\.requires_governance_approval/)
  assert.match(guard, /Approval requirement flags are immutable after request creation/)
  assert.match(tests, /expected approval requirement downgrade to fail/)
})

attack('ready approval evidence cannot be extended or substituted', () => {
  assert.match(guard, /old\.status = 'READY_TO_EXECUTE'/)
  assert.match(guard, /Approval validity evidence is immutable once execution is ready/)
  assert.match(guard, /Approval validity evidence cannot change during execution finalization/)
  assert.match(tests, /expected approval expiry extension to fail/)
})

attack('execution uses prior persisted approval evidence rather than replacement values', () => {
  assert.match(guard, /old\.approved_at is null or old\.approval_expires_at is null/)
  assert.match(guard, /old\.approval_expires_at <= statement_timestamp\(\)/)
  assert.doesNotMatch(guard, /if new\.approval_expires_at <= statement_timestamp\(\) then\s+raise exception 'Human-approved execution request expired before execution'/)
})

attack('human execution cannot skip READY_TO_EXECUTE', () => {
  assert.match(guard, /old\.status is distinct from 'READY_TO_EXECUTE'/)
  assert.match(tests, /expected direct pending-to-executed transition to fail/)
})

attack('missing and expired approval evidence fail closed at application and database boundaries', () => {
  assert.match(service, /Approval validity evidence is missing for a human-approved execution request/)
  assert.match(service, /Approval validity expired before execution/)
  assert.match(guard, /missing approval validity evidence/)
  assert.match(guard, /expired before execution/)
  assert.match(tests, /expected READY_TO_EXECUTE without approval evidence to fail/)
  assert.match(tests, /expected expired human approval execution to fail/)
})

attack('fingerprint and runtime authorization remain independent execution gates', () => {
  assert.match(service, /request\.execution_fingerprint !== input\.currentFingerprint/)
  assert.match(service, /canViewDatasetResource\(input\.executorUserId, datasetId\)/)
  assert.match(service, /authorizeDataset\(input\.executorUserId, datasetId, profile\.capability\)/)
})

attack('database guard has pinned search path and no end-user execute grant', () => {
  assert.match(guard, /set search_path = pg_catalog, governance/)
  assert.match(guard, /revoke all on function governance\.enforce_agent_approval_execution_validity\(\) from public, anon, authenticated/)
  assert.match(guard, /grant execute on function governance\.enforce_agent_approval_execution_validity\(\) to service_role/)
})

if (failures.length) process.exit(1)
console.log('PASS independent Agent Approval Validity adversarial audit')
