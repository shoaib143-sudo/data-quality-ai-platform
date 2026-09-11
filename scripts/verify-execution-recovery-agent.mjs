import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260911190000_execution_recovery_agent.sql', 'utf8')
const hardeningMigration = fs.readFileSync('supabase/migrations/20260911191000_execution_recovery_action_hardening.sql', 'utf8')
const worker = fs.readFileSync('lib/orchestration/worker.ts', 'utf8')
const api = fs.readFileSync('app/api/recovery/[caseId]/actions/route.ts', 'utf8')
const page = fs.readFileSync('app/recovery/page.tsx', 'utf8')
const actions = fs.readFileSync('app/recovery/recovery-actions.tsx', 'utf8')
const layout = fs.readFileSync('app/recovery/layout.tsx', 'utf8')
const workspacePolicy = fs.readFileSync('lib/governance/workspace-policy.ts', 'utf8')

function requireText(source, token, label) {
  if (!source.includes(token)) throw new Error(`Missing ${label}: ${token}`)
}

requireText(migration, 'create table if not exists orchestration.recovery_cases', 'recovery case ledger')
requireText(migration, 'constraint recovery_cases_durable_job_key unique (durable_job_id)', 'canonical terminal-job case identity')
requireText(migration, 'create table if not exists orchestration.recovery_actions', 'append-only recovery action ledger')
requireText(migration, "new.status <> 'DEAD'", 'terminal-failure-only recovery capture')
requireText(migration, 'execution_recovery_classification', 'deterministic root-cause classification')
requireText(migration, "'TRANSIENT_EXTERNAL'", 'transient external classification')
requireText(migration, "'DEPLOYMENT_SCHEMA'", 'deployment/schema classification')
requireText(migration, "'DATA_CONTRACT'", 'data contract classification')
requireText(migration, 'consent_requirement', 'operator consent boundary')
requireText(migration, "v_case.recommended_action <> 'RETRY'", 'retry policy enforcement')
requireText(migration, 'max_attempts = greatest(max_attempts, attempts + 1)', 'single additional durable retry budget')
requireText(migration, "'execution', 'NOT_AUTOMATED'", 'non-automated rollback boundary')
requireText(migration, "where q.status = 'DEAD'", 'real terminal-job backfill scope')
requireText(migration, 'trg_enforce_profiling_job_success_integrity', 'profiling durable success evidence guard')
requireText(migration, "a.artifact_type = 'AGENT_RUN_RESULT'", 'profiling canonical artifact requirement')
requireText(migration, 'app_private.is_project_member(project_id)', 'project-scoped recovery reads')

requireText(hardeningMigration, 'request_execution_recovery_action_admin', 'project-admin recovery action boundary')
requireText(hardeningMigration, 'app_private.is_project_admin(v_project_id)', 'project-admin consent enforcement')
requireText(hardeningMigration, 'revoke execute on function orchestration.request_execution_recovery_action(uuid, text) from authenticated', 'direct member action revocation')
requireText(hardeningMigration, 'trg_resolve_execution_recovery_after_success', 'retry outcome reconciliation')
requireText(hardeningMigration, "status = 'RESOLVED'", 'successful recovery resolution')

requireText(api, 'requireApiUser()', 'authenticated recovery action API')
requireText(api, "authorizeProject(user.id, recoveryCase.project_id, 'agent.execute')", 'execution permission preflight')
requireText(api, "rpc('request_execution_recovery_action_admin'", 'project-admin recovery action RPC')
requireText(api, "'ROLLBACK_REVIEW'", 'rollback review API boundary')

requireText(page, ".from('recovery_cases')", 'recovery case UI')
requireText(page, ".from('recovery_actions')", 'recovery action audit UI')
requireText(page, 'Evidence references', 'evidence-first RCA UI')
requireText(actions, 'Approve one retry', 'operator retry consent')
requireText(actions, 'Request rollback review', 'rollback review control')
requireText(actions, 'it does not mutate source data or schemas', 'rollback safety disclosure')
requireText(workspacePolicy, "['/recovery', 'monitoring']", 'recovery route workspace mapping')
requireText(layout, "requireWorkspaceAccess('monitoring')", 'recovery monitoring workspace guard')

// The pre-existing worker shortcut is guarded in the database until its code path
// is removed; durable profiling success itself must still be impossible without
// canonical result evidence.
requireText(worker, "if (profileRun.status === 'COMPLETED')", 'profiling completion reconciliation path')

console.log('Governed Execution Recovery Agent contract verified.')
