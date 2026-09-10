import fs from 'node:fs'

const reconciliation = fs.readFileSync('supabase/migrations/20260910233500_v5_reconcile_action_outcome_authority.sql', 'utf8')
const canonical = fs.readFileSync('supabase/migrations/20260910144000_v5_governed_action_outcome_learning.sql', 'utf8')
const scope = fs.readFileSync('lib/governance/governed-action-scope.ts', 'utf8')
const verifier = fs.readFileSync('lib/governance/governed-action-verification.ts', 'utf8')
const outcome = fs.readFileSync('lib/governance/governed-outcome-learning.ts', 'utf8')
const autonomy = fs.readFileSync('lib/governance/governed-autonomy.ts', 'utf8')
const approved = fs.readFileSync('lib/governance/approved-autonomy-execution.ts', 'utf8')
const route = fs.readFileSync('app/api/governance/autonomy/route.ts', 'utf8')

const checks = [
  ['canonical governed outcome authority remains the only repository authority', canonical.includes('governance.governed_action_outcomes') && !verifier.includes('autonomy_action_outcomes')],
  ['superseded live outcome table is removed forward-only', reconciliation.includes('drop table if exists governance.autonomy_action_outcomes')],
  ['database action scope validates source agent project', reconciliation.includes('new.source_agent_run_id is not null') && reconciliation.includes('ar.project_id = new.project_id')],
  ['database scope trigger reacts to source agent changes', reconciliation.includes('source_agent_run_id') && reconciliation.includes('before insert or update of project_id,policy_id,action_key,target_type,target_id,input,source_agent_run_id')],
  ['application validates source agent project before policy decision', autonomy.includes('assertGovernedActionReferencesInProject') && autonomy.indexOf('await assertGovernedActionReferencesInProject') < autonomy.indexOf('const policy = await loadPolicy')],
  ['application target scope covers project dataset version and quality rule', ['PROJECT','DATASET','DATASET_VERSION','QUALITY_RULE'].every((type) => scope.includes(`targetType === '${type}'`))],
  ['unknown action target types fail closed', scope.includes('Unsupported governed action target type')],
  ['approved reprofile reuses existing hardened queue path', approved.includes('queueGovernedReprofile') && !autonomy.includes('executeGovernedReprofileAction')],
  ['autonomy API uses non-redirecting API authentication', route.includes('requireApiUser') && !route.includes('requireUser()')],
  ['autonomy mutation API preserves issues.manage authorization', route.includes("authorizeProject(user.id, projectId, 'issues.manage')")],
  ['outcome verification is explicit and deterministic', route.includes("operation === 'VERIFY_OUTCOME'") && route.includes('verifyExecutedGovernedAction')],
  ['API does not expose caller-driven outcome recording or learning promotion', !route.includes('recordGovernedActionOutcome') && !route.includes('promoteVerifiedGovernedActionOutcome')],
  ['verifier only accepts executed actions', verifier.includes("action.status !== 'EXECUTED'")],
  ['unsupported action verifier fails closed', verifier.includes('No deterministic governed outcome verifier is registered for')],
  ['issue verification resolves persisted project-scoped issue evidence', verifier.includes("from('issues')") && verifier.includes(".eq('project_id', projectId)")],
  ['missing issue produces verified failed objective rather than fabricated success', verifier.includes("outcomeType: 'FAILED'") && verifier.includes('persisted_issue_id: null')],
  ['reprofile verifier resolves action result profile run and governed dataset version', verifier.includes('result.profiling_run_id') && verifier.includes("from('dataset_versions')") && verifier.includes("from('profile_runs')")],
  ['nonterminal or partial reprofile does not become immutable success', verifier.includes("status: profileStatus === 'PARTIAL' ? 'INCONCLUSIVE' : 'PENDING'")],
  ['failed reprofile is evidence-backed failed outcome', verifier.includes("profileStatus === 'FAILED'") && verifier.includes("outcomeType: 'FAILED'") && verifier.includes('effectiveness: 0')],
  ['completed reprofile requires linked quality score', verifier.includes("from('data_quality_scores')") && verifier.includes("reason: 'QUALITY_SCORE_MISSING'")],
  ['completed reprofile records prior and after evidence', verifier.includes('priorCompletedProfile') && verifier.includes('beforeEvidence') && verifier.includes('afterEvidence: { profile_run: profileRun, quality_score: score }')],
  ['reprofile verifier never claims quality improvement', verifier.includes('quality_improvement_claimed: false')],
  ['verified outcome writes through canonical database authority', verifier.includes('recordGovernedActionOutcome') && outcome.includes("rpc('record_governed_action_outcome'"))],
  ['learning promotion uses canonical verified-only RPC', verifier.includes('promoteVerifiedGovernedActionOutcome') && outcome.includes("rpc('promote_verified_governed_action_outcome'"))],
  ['learning requires source-agent provenance', verifier.includes("reason: 'SOURCE_AGENT_RUN_REQUIRED'")],
  ['autonomy posture exposes canonical outcome evidence', autonomy.includes("from('governed_action_outcomes')") && autonomy.includes('outcomes: outcomes.data ?? []')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`V5 operational governed action verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`V5 operational governed action verification passed (${checks.length} checks).`)
