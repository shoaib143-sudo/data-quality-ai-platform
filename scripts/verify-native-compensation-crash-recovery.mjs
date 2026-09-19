import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260919030000_execution_recovery_crash_fencing.sql', 'utf8')
const persistence = fs.readFileSync('lib/orchestration/execution-recovery-persistence.ts', 'utf8')
const runtime = fs.readFileSync('lib/orchestration/execution-recovery-runtime.ts', 'utf8')
const handlers = fs.readFileSync('lib/orchestration/execution-recovery-handlers.ts', 'utf8')
const crashTest = fs.readFileSync('scripts/test-native-compensation-crash-recovery.sql', 'utf8')

function requireText(source, token, label) {
  if (!source.includes(token)) throw new Error(`Missing ${label}: ${token}`)
}
function rejectText(source, token, label) {
  if (source.includes(token)) throw new Error(`Forbidden ${label}: ${token}`)
}

requireText(migration, "'RUNNING'", 'active autonomous recovery state')
requireText(migration, 'execution_token', 'execution fencing token')
requireText(migration, 'execution_lease_expires_at', 'execution lease expiry')
requireText(migration, 'replay_contract_version', 'replay contract version')
requireText(migration, 'replay_safe', 'explicit replay safety')
requireText(migration, "'ATTEMPT_IN_FLIGHT'", 'active worker duplicate-execution rejection')
requireText(migration, "'STALE_ATTEMPT_REPLAY_UNSAFE'", 'unsafe stale replay escalation')
requireText(migration, "'REPLAY_CONTRACT_VERSION_MISMATCH'", 'contract mismatch fail-closed path')
requireText(migration, 'execution_token is distinct from p_execution_token', 'stale worker finalization fence')
requireText(migration, "'REPLAY_METADATA_REQUIRED'", 'legacy unfenced claim fail-closed shim')
requireText(migration, "'EXECUTION_FENCE_TOKEN_REQUIRED'", 'legacy unfenced finalize fail-closed shim')

requireText(runtime, 'replaySafe: boolean', 'runtime replay-safety contract')
requireText(runtime, 'replayContractVersion: number', 'runtime replay-version contract')
requireText(handlers, "key: 'lease-reconciliation'", 'lease specialist')
requireText(handlers, 'replaySafe: true', 'explicit replay-safe specialist')
requireText(handlers, 'replaySafe: false', 'explicit fail-closed specialists')
requireText(persistence, 'p_replay_contract_version', 'persistence replay version claim')
requireText(persistence, 'p_replay_safe', 'persistence replay safety claim')
requireText(persistence, 'p_execution_token', 'fenced finalization')
requireText(persistence, "'ATTEMPT_IN_FLIGHT'", 'in-flight replay state')
rejectText(persistence, "claimReason === 'ATTEMPT_ALREADY_CLAIMED'", 'legacy duplicate claim interpretation')

requireText(crashTest, 'Completed sibling/upstream durable jobs were modified during recovery.', 'sibling preservation assertion')
requireText(crashTest, "v_result->>'restart_scope' <> 'WHOLE_JOB'", 'heavy job whole-job restart assertion')
requireText(crashTest, 'Stale worker unexpectedly finalized a reclaimed action.', 'stale worker fence assertion')
requireText(crashTest, 'Unsafe stale replay did not fail closed', 'unsafe replay negative assertion')
requireText(crashTest, 'Replay contract mismatch did not fail closed', 'replay version negative assertion')

console.log('Native compensation crash recovery fencing contract verified.')
