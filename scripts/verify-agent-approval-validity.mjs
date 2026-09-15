import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message)
}

const migration = read('supabase/migrations/20260915090000_agent_approval_validity_expiry.sql')
const executionGuard = read('supabase/migrations/20260915103000_agent_approval_execution_expiry_guard.sql')
const service = read('lib/governance/agent-approval-service.ts')
const dynamicTests = read('scripts/test-agent-approval-validity.sql')

requireText(migration, 'approval_validity_days integer not null default 7', 'Approval validity must default to seven days.')
requireText(migration, 'check (approval_validity_days > 0)', 'Approval validity must reject non-positive configuration.')
requireText(migration, 'approval_expires_at timestamptz', 'Approval requests must persist their approval expiry.')
requireText(migration, 'apply_agent_approval_expiry', 'Approval expiry must be derived server-side when an approval becomes executable.')
requireText(migration, "new.status = 'READY_TO_EXECUTE'", 'Expiry derivation must be tied to READY_TO_EXECUTE approvals.')
requireText(migration, 'new.approved_at + make_interval(days => v_validity_days)', 'Expiry must be based on final approval time plus configured validity.')
requireText(migration, 'set search_path = pg_catalog, governance', 'Approval expiry trigger function must pin its search_path.')
requireText(migration, 'idx_agent_approval_requests_ready_expiry', 'Executable approval expiry must be indexed for operational inspection.')

requireText(executionGuard, 'enforce_agent_approval_execution_validity', 'Database finalization must have an independent approval-validity guard.')
requireText(executionGuard, "new.status = 'EXECUTED'", 'Database guard must protect execution finalization.')
requireText(executionGuard, "old.status <> 'READY_TO_EXECUTE'", 'Human-approved execution must not skip READY_TO_EXECUTE.')
requireText(executionGuard, 'new.approval_expires_at <= statement_timestamp()', 'Database guard must reject expired approval evidence.')
requireText(executionGuard, 'missing approval validity evidence', 'Database guard must reject missing approval evidence.')
requireText(executionGuard, 'set search_path = pg_catalog, governance', 'Database finalization guard must pin its search_path.')
requireText(executionGuard, 'revoke all on function governance.enforce_agent_approval_execution_validity() from public, anon, authenticated', 'Database guard must not be directly callable by end-user roles.')

requireText(service, "request.status === 'READY_TO_EXECUTE' && requiresHumanApproval", 'Expiry invalidation must only mutate executable human-approved requests.')
requireText(service, 'Approval validity evidence is missing for a human-approved execution request.', 'Human-approved requests without expiry evidence must fail closed.')
requireText(service, 'The execution request was invalidated because its approval expired.', 'Expired approval must be rejected before execution.')
requireText(service, "invalidation_reason: 'Approval validity expired before execution.'", 'Expiry invalidation must persist an explicit audit reason.')
requireText(service, 'request.approval_expires_at', 'Execution validation must evaluate the persisted expiry timestamp.')
requireText(service, 'request.execution_fingerprint !== input.currentFingerprint', 'Fingerprint invalidation must remain enforced alongside expiry.')

requireText(dynamicTests, 'expected seven-day approval validity', 'Dynamic tests must verify the default seven-day validity period.')
requireText(dynamicTests, 'expected READY_TO_EXECUTE without approval evidence to fail', 'Dynamic tests must cover missing validity evidence.')
requireText(dynamicTests, 'expected expired human approval execution to fail', 'Dynamic tests must cover expired approval execution.')
requireText(dynamicTests, 'expected direct pending-to-executed transition to fail', 'Dynamic tests must cover illegal execution state transitions.')
requireText(dynamicTests, 'Agent approval validity dynamic and negative tests passed.', 'Dynamic approval validity test suite must expose a success marker.')

console.log('Agent approval validity and expiry contract verified.')
