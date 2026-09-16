import fs from 'node:fs'

const route = fs.readFileSync('app/api/agents/governance-orchestrator/route.ts', 'utf8')
const reporting = fs.readFileSync('lib/orchestration/governance-outcome-report-service.ts', 'utf8')
const recovery = fs.readFileSync('lib/orchestration/governance-recovery-service.ts', 'utf8')
const service = fs.readFileSync('lib/orchestration/governance-orchestrator-service-v2.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260916110000_governance_runtime_debugger_evidence.sql', 'utf8')
const policyNamespaceMigration = fs.readFileSync('supabase/migrations/20260916112000_orchestrator_autonomy_policy_namespace.sql', 'utf8')

function requireText(source, token, label) {
  if (!source.includes(token)) throw new Error(`Missing ${label}: ${token}`)
}
function rejectText(source, token, label) {
  if (source.includes(token)) throw new Error(`Forbidden ${label}: ${token}`)
}

requireText(route, 'assembleAndPersistGovernanceOutcomeReport', 'post-execution report assembly')
requireText(route, 'reporting.enabled', 'explicit report opt-in boundary')
requireText(route, "result.status === 'FAILED'", 'failed-run recovery routing')
requireText(route, 'handleGovernanceRuntimeFailure', 'governed recovery dispatcher')

requireText(reporting, "from('ai_capability_e2e_results')", 'canonical capability evidence source')
requireText(reporting, "from('agent_runs')", 'agent task evidence source')
requireText(reporting, "from('governance_recovery_events')", 'recovery evidence source')
requireText(reporting, 'scores: {}', 'unsupported scores remain unmeasured')
requireText(reporting, 'businessImpact: []', 'unsupported business impact omission')
requireText(reporting, "execution === 'EXECUTED' && verification === 'VERIFIED'", 'verified capability completion rule')
rejectText(reporting, 'Math.random(', 'nondeterministic report evidence')

requireText(recovery, "agent_key', 'support_agent'", 'existing governed support agent debugger')
requireText(recovery, "disposition !== 'DEBUGGER_REQUIRED'", 'debugger-only runtime defect routing')
requireText(recovery, 'validateDebuggerInput(debuggerInput)', 'bounded debugger input validation')
requireText(recovery, 'executeGovernanceSpecialistAgent', 'governed read-only debugger execution')
requireText(recovery, "const debuggerOutcome: RuntimeDebuggingOutcome = 'NOT_RECOVERABLE'", 'no false recovery claim')
requireText(recovery, 'originalStepReexecuted: false', 'original step not fabricated as reexecuted')
requireText(recovery, 'originalExitGatePassed: false', 'original exit gate not fabricated as passed')
requireText(recovery, 'Do not mutate runtime, policy, source data, schemas, credentials, or governance truth.', 'debugger mutation prohibition')

requireText(service, "const ORCHESTRATOR_POLICY_TABLE = 'orchestrator_autonomy_policies'", 'dedicated orchestrator policy authority')
requireText(service, 'from(ORCHESTRATOR_POLICY_TABLE)', 'orchestrator policy reads and writes')
rejectText(service, ".from('autonomy_policies')", 'legacy action-level autonomy table binding')
requireText(policyNamespaceMigration, 'CREATE TABLE IF NOT EXISTS governance.orchestrator_autonomy_policies', 'dedicated orchestrator policy table')
requireText(policyNamespaceMigration, 'project_id uuid PRIMARY KEY', 'one orchestrator policy per project')
requireText(policyNamespaceMigration, 'REVOKE ALL ON TABLE governance.orchestrator_autonomy_policies FROM public, anon, authenticated', 'browser DML denial')
requireText(policyNamespaceMigration, 'Distinct from governance.autonomy_policies', 'legacy policy authority separation')

requireText(migration, 'ADD COLUMN IF NOT EXISTS debugger_run_id', 'debugger evidence binding')
requireText(migration, 'REFERENCES agent.agent_runs(id)', 'debugger run foreign key')
requireText(migration, 'This evidence does not prove the failed business step succeeded.', 'debugger evidence truth boundary')

console.log('Governance runtime recovery, policy namespace, and persisted-evidence reporting wiring verified.')
