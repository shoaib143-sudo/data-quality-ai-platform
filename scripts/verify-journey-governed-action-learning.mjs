import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260910225000_v5_governed_action_outcomes.sql', 'utf8')
const autonomy = fs.readFileSync('lib/governance/governed-autonomy.ts', 'utf8')
const scope = fs.readFileSync('lib/governance/governed-action-scope.ts', 'utf8')
const reprofile = fs.readFileSync('lib/governance/governed-reprofile-action.ts', 'utf8')
const outcomes = fs.readFileSync('lib/governance/governed-action-outcomes.ts', 'utf8')
const route = fs.readFileSync('app/api/governance/autonomy/route.ts', 'utf8')
const memory = fs.readFileSync('lib/ai/governance-memory-provider.ts', 'utf8')

const checks = [
  ['outcome ledger is forward-migration backed', migration.includes('create table if not exists governance.autonomy_action_outcomes')],
  ['execution and verified outcome are separate states', migration.includes("verification_status in ('PENDING','VERIFIED','FAILED','UNKNOWN')") && migration.includes('EXECUTED autonomy action state alone never implies VERIFIED outcome')],
  ['learning link requires verified measurable outcome', migration.includes('autonomy_action_outcomes_learning_verified_ck') && migration.includes("verification_status = 'VERIFIED'") && migration.includes('effectiveness is not null')],
  ['outcome ledger is service-role mutation only', migration.includes('revoke all on table governance.autonomy_action_outcomes from public, anon, authenticated') && migration.includes('to service_role')],
  ['proposal validates source run and target project scope before policy execution', autonomy.includes('assertGovernedActionReferencesInProject') && autonomy.indexOf('assertGovernedActionReferencesInProject') < autonomy.indexOf('const policy = await loadPolicy')],
  ['source agent run is explicitly project scoped', scope.includes("from('agent_runs')") && scope.includes(".eq('project_id', projectId)") && scope.includes('sourceAgentRunId does not belong to the requested project')],
  ['project target cannot point at another project', scope.includes("targetType === 'PROJECT'") && scope.includes('targetId !== projectId')],
  ['dataset target is explicitly project scoped', scope.includes("targetType === 'DATASET'") && scope.includes("from('datasets')") && scope.includes(".eq('project_id', projectId)" )],
  ['dataset-version target resolves through a project-scoped dataset', scope.includes("targetType === 'DATASET_VERSION'") && scope.includes("from('dataset_versions')") && scope.includes('DATASET_VERSION target does not belong to the requested project')],
  ['quality-rule target is explicitly project scoped', scope.includes("targetType === 'QUALITY_RULE'") && scope.includes("from('quality_rule_definitions')") && scope.includes(".eq('project_id', projectId)" )],
  ['unknown governed target types fail closed', scope.includes('Unsupported governed action target type')],
  ['reprofile executor only accepts REQUEST_REPROFILE', reprofile.includes("action_key).toUpperCase() !== 'REQUEST_REPROFILE'")],
  ['reprofile executor requires DATASET_VERSION target', reprofile.includes("target_type).toUpperCase() !== 'DATASET_VERSION'")],
  ['reprofile target is project scoped', reprofile.includes(".eq('project_id', action.project_id)")],
  ['reprofile target must be AVAILABLE', reprofile.includes("String(version.status).toUpperCase() !== 'AVAILABLE'")],
  ['reprofile source must be ACTIVE and pass source validation', reprofile.includes("String(source.status).toUpperCase() !== 'ACTIVE'") && reprofile.includes('validateDataSourceForProfiling')],
  ['reprofile requires active execution source binding', reprofile.includes("from('dataset_execution_sources')") && reprofile.includes(".eq('active', true)")],
  ['reprofile uses production profiling agent only', reprofile.includes("PRODUCTION_AGENT_KEY = 'profiling_agent'") && reprofile.includes("PRODUCTION_AGENT_VERSION = '2.0'")],
  ['reprofile sanitizes profiling input', reprofile.includes('sanitizeProfilingRequestInput')],
  ['reprofile creates canonical agent and profile runs', reprofile.includes("from('agent_runs').insert") && reprofile.includes("from('profile_runs').insert")],
  ['reprofile queues durable profiling work idempotently', reprofile.includes('enqueueDurableJob') && reprofile.includes('`autonomy-reprofile:${action.id}`')],
  ['reprofile declares no production source mutation', reprofile.includes('productionSourceMutation: false') && reprofile.includes('production_source_mutation: false')],
  ['reprofile queue failure marks created runs failed', reprofile.includes('GOVERNED_REPROFILE_QUEUE_FAILED')],
  ['autonomy executor supports reprofile without broadening unsupported actions', autonomy.includes("claimed.action_key === 'REQUEST_REPROFILE'") && autonomy.includes('Autonomous execution is not implemented for ${claimed.action_key}')],
  ['executed actions explicitly require outcome verification', autonomy.includes('outcome_verification_required: true')],
  ['outcome verifier requires EXECUTED action', outcomes.includes("action.status !== 'EXECUTED'")],
  ['rolled-back actions cannot produce reusable outcomes', outcomes.includes('Rolled-back autonomy actions cannot produce reusable verified outcomes')],
  ['reprofile outcome uses persisted profile status', outcomes.includes("const status = text(profileRun.status).toUpperCase()")],
  ['failed profile maps to failed outcome', outcomes.includes("status === 'FAILED'") && outcomes.includes("verificationStatus: 'FAILED'")],
  ['partial profile does not become verified', outcomes.includes("status === 'PARTIAL'") && outcomes.includes("verificationStatus: 'UNKNOWN'")],
  ['non-terminal profile remains pending', outcomes.includes("status !== 'COMPLETED'") && outcomes.includes("verificationStatus: 'PENDING'")],
  ['completed reprofile requires linked quality score', outcomes.includes("from('data_quality_scores')") && outcomes.includes('QUALITY_SCORE_MISSING')],
  ['verified reprofile records before and after evidence', outcomes.includes('priorCompletedProfile') && outcomes.includes('beforeState: baseline') && outcomes.includes('afterState: { profileRun, qualityScore: score }')],
  ['verification does not claim quality improvement', outcomes.includes('quality_improvement_claimed: false')],
  ['operational learning projection requires verified outcome', outcomes.includes("outcome.verification_status !== 'VERIFIED'")],
  ['operational learning projection requires source agent provenance', outcomes.includes("reason: 'SOURCE_AGENT_RUN_REQUIRED'")],
  ['learning case key is action-idempotent', outcomes.includes('const caseKey = `autonomy-action:${action.id}`') && outcomes.includes("onConflict: 'project_id,case_key'" )],
  ['operational learning case is verified context only', outcomes.includes("source_kind: 'AUTONOMY_ACTION_OUTCOME'") && outcomes.includes("decision_status: 'VERIFIED'") && outcomes.includes("outcome_status: 'VERIFIED'") && outcomes.includes("authority: 'VERIFIED_OUTCOME_CONTEXT_ONLY'")],
  ['later reuse requires fresh policy decision', outcomes.includes('policy_re_evaluation_required: true') && outcomes.includes('Reuse requires a fresh policy decision for the current case')],
  ['canonical memory retrieval still requires verified active episodes', memory.includes(".eq('status', 'ACTIVE')") && memory.includes(".eq('decision_status', 'VERIFIED')") && memory.includes(".eq('outcome_status', 'VERIFIED')" )],
  ['rollback invalidates verified operational outcome', autonomy.includes('invalidateGovernedActionOutcome') && outcomes.includes("verification_status: 'UNKNOWN'")],
  ['rollback revokes promoted operational learning', outcomes.includes("status: 'REVOKED'") && outcomes.includes("outcome_status: 'UNKNOWN'")],
  ['autonomy API uses API-safe auth', route.includes('requireApiUser') && !route.includes('requireUser()')],
  ['autonomy API remains project authorized', route.includes("authorizeProject(user.id, projectId, 'issues.manage')")],
  ['outcome verification is explicit and canonicalized', route.includes("operation === 'VERIFY_OUTCOME'") && route.includes('verifyAndCanonicalizeGovernedActionOutcome')],
  ['autonomy list exposes operational outcome state', autonomy.includes("from('autonomy_action_outcomes')") && autonomy.includes('outcomes: outcomes.data ?? []')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Governed action learning journey verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`Governed action learning journey verification passed (${checks.length} checks).`)
