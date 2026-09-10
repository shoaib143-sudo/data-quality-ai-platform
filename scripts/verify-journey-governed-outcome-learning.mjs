import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260910144000_v5_governed_action_outcome_learning.sql', 'utf8')
const outcome = fs.readFileSync('lib/governance/governed-outcome-learning.ts', 'utf8')
const autonomy = fs.readFileSync('lib/governance/governed-autonomy.ts', 'utf8')
const learning = fs.readFileSync('lib/agents/agent-memory-learning.ts', 'utf8')
const memory = fs.readFileSync('lib/ai/governance-memory-provider.ts', 'utf8')

const checks = [
  ['immutable governed action outcome ledger exists', migration.includes('create table if not exists governance.governed_action_outcomes') && migration.includes('Governed action outcomes are immutable evidence')],
  ['outcomes bind exact action policy versions', migration.includes('policy_version_id uuid not null references governance.autonomy_policy_versions') && migration.includes('pv.id = v_action.policy_version_id')],
  ['approval authority is derived from canonical workflow state', migration.includes("v_workflow_status <> 'APPROVED'") && migration.includes("v_decision_state := case when v_action.approval_workflow_instance_id is null then 'NOT_REQUIRED' else 'APPROVED' end")],
  ['terminal action state is required before outcome recording', migration.includes('governed action must reach a terminal execution or decision state before outcome recording')],
  ['verified execution requires before and after evidence', migration.includes('verified executed outcome requires before evidence') && migration.includes('verified executed outcome requires after evidence')],
  ['effectiveness claims require verification', migration.includes('effectiveness claims require verified outcome evidence')],
  ['verification agent provenance is project scoped and successful', migration.includes("ar.project_id = p_project_id and ar.status = 'SUCCEEDED'")],
  ['outcome idempotency cannot rewrite evidence', migration.includes('verification key reuse does not match immutable governed outcome evidence')],
  ['outcome RPC is service-role only', migration.includes('grant execute on function governance.record_governed_action_outcome') && migration.includes('to service_role') && migration.includes('from public, anon, authenticated')],
  ['promotion requires verified outcome', migration.includes("if v_outcome.verification_state <> 'VERIFIED' then raise exception 'only verified governed outcomes may be promoted'" )],
  ['promotion requires source agent provenance', migration.includes("if v_outcome.source_agent_run_id is null then raise exception 'learning promotion requires source agent provenance'" )],
  ['promoted case preserves outcome/action/policy provenance', ['governed_action_outcome_id','autonomy_action_id','policy_id','policy_version_id','verification_agent_run_id','verification_key'].every((token) => migration.includes(`'${token}'`))],
  ['promoted cases are explicitly verified', migration.includes("'VERIFIED','VERIFIED',v_outcome.effectiveness")],
  ['generic learning search excludes unverified cases', migration.includes("lc.decision_status='VERIFIED'") && migration.includes("lc.outcome_status='VERIFIED'") && migration.includes('lc.source_agent_run_id is not null')],
  ['application records through canonical RPC', outcome.includes("rpc('record_governed_action_outcome'")],
  ['application promotes through canonical RPC', outcome.includes("rpc('promote_verified_governed_action_outcome'")],
  ['outcome evaluation is durable and versioned', outcome.includes("evaluator_type: 'GOVERNED_OUTCOME'") && outcome.includes("evaluator_version: '1.0'")],
  ['promotion writes auditable authority evidence', outcome.includes("eventType: 'VERIFIED_GOVERNED_OUTCOME_PROMOTED_TO_LEARNING'") && outcome.includes('future_action_reauthorization_required: true')],
  ['future actions still pass governed policy decision provider', autonomy.includes('createGovernancePolicyDecisionProvider().decide')],
  ['memory cannot authorize future actions', learning.includes('memory_never_authorizes_actions: true') && learning.includes('current_authorization_required_for_every_action: true') && learning.includes('current_policy_decision_required_for_every_action: true')],
  ['learning influence preserves case provenance', learning.includes('influenceEvidence') && learning.includes('evidence_record_id') && learning.includes('evidence_verified')],
  ['canonical episodic provider independently requires verified decision and outcome', memory.includes(".eq('decision_status', 'VERIFIED')") && memory.includes(".eq('outcome_status', 'VERIFIED')")),
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`V5 governed outcome learning verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`V5 governed outcome learning verification passed (${checks.length} checks).`)
