import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message)
}

const migration = read('supabase/migrations/20260915090000_agent_approval_validity_expiry.sql')
const service = read('lib/governance/agent-approval-service.ts')

requireText(migration, 'approval_validity_days integer not null default 7', 'Approval validity must default to seven days.')
requireText(migration, 'check (approval_validity_days > 0)', 'Approval validity must reject non-positive configuration.')
requireText(migration, 'approval_expires_at timestamptz', 'Approval requests must persist their approval expiry.')
requireText(migration, 'apply_agent_approval_expiry', 'Approval expiry must be derived server-side when an approval becomes executable.')
requireText(migration, "new.status = 'READY_TO_EXECUTE'", 'Expiry derivation must be tied to READY_TO_EXECUTE approvals.')
requireText(migration, 'new.approved_at + make_interval(days => v_validity_days)', 'Expiry must be based on final approval time plus configured validity.')
requireText(migration, 'set search_path = pg_catalog, governance', 'Approval expiry trigger function must pin its search_path.')
requireText(migration, 'idx_agent_approval_requests_ready_expiry', 'Executable approval expiry must be indexed for operational inspection.')
requireText(service, "request.status === 'READY_TO_EXECUTE' && requiresHumanApproval", 'Expiry invalidation must only mutate executable human-approved requests.')
requireText(service, 'Approval validity evidence is missing for a human-approved execution request.', 'Human-approved requests without expiry evidence must fail closed.')
requireText(service, 'The execution request was invalidated because its approval expired.', 'Expired approval must be rejected before execution.')
requireText(service, "invalidation_reason: 'Approval validity expired before execution.'", 'Expiry invalidation must persist an explicit audit reason.')
requireText(service, 'request.approval_expires_at', 'Execution validation must evaluate the persisted expiry timestamp.')
requireText(service, 'request.execution_fingerprint !== input.currentFingerprint', 'Fingerprint invalidation must remain enforced alongside expiry.')

console.log('Agent approval validity and expiry contract verified.')
