import fs from 'node:fs'

const gate = fs.readFileSync('supabase/migrations/20260905070248_strengthen_control_intelligence_operability_gate.sql', 'utf8')
const continuous = fs.readFileSync('supabase/migrations/20260905065604_continuous_governance_control_intelligence_reconciliation.sql', 'utf8')
const intelligence = fs.readFileSync('lib/governance/ai-governance-intelligence.ts', 'utf8')
const worker = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const posture = fs.readFileSync('app/api/governance/controls/posture/route.ts', 'utf8')
const vercel = fs.readFileSync('vercel.json', 'utf8')

const checks = [
  ['formal gate requires automated evidence collector', /automated_evidence_collector_present/.test(gate) && /refresh_governance_control_evidence/.test(gate)],
  ['formal gate requires continuous reconciler', /continuous_reconciliation_present/.test(gate) && /refresh_all_governance_control_intelligence/.test(gate)],
  ['formal gate requires native issue projection', /control_issue_projection_present/.test(gate) && /trg_project_control_finding_to_issue/.test(gate)],
  ['formal gate enforces five minute evaluation SLO', /stale_evaluation_gaps/.test(gate) && /interval '5 minutes'/.test(gate) && /reconciliation_slo_minutes',5/.test(gate)],
  ['formal gate evaluates every active scope', /left join governance\.control_scope_bindings/.test(gate) && /e\.scope_binding_id is not distinct from b\.id/.test(gate)],
  ['formal gate allows post-approval reconciliation window', /coalesce\(c\.reviewed_at,c\.updated_at\) < now\(\) - interval '5 minutes'/.test(gate)],
  ['formal gate fails stale control evaluation gaps', /v_control_stale_evaluation_gaps>0/.test(gate) && /v_failure_count := v_failure_count \+ 1/.test(gate)],
  ['all-project reconciler limits work to active approved assertions', /lifecycle_status='ACTIVE'/.test(continuous) && /review_status='APPROVED'/.test(continuous) && /evaluation_method='EVIDENCE_ASSERTION'/.test(continuous)],
  ['all-project reconciler isolates project failures', /exception when others/.test(continuous) && /PARTIAL_FAILURE/.test(continuous)],
  ['all-project reconciler service-role only', /revoke execute on function governance\.refresh_all_governance_control_intelligence\(\) from public, anon, authenticated/.test(continuous) && /grant execute on function governance\.refresh_all_governance_control_intelligence\(\) to service_role/.test(continuous)],
  ['AI governance sweep invokes all-project reconciler', /rpc\('refresh_all_governance_control_intelligence'\)/.test(intelligence)],
  ['AI governance sweep propagates reconciliation failures', /controls\?\.failure_count/.test(intelligence) || /controls\?\.failure_count/.test(intelligence.replaceAll(' ', '')) || /failureCount/.test(intelligence) && /throw new Error\(`Governance control intelligence reconciliation reported/.test(intelligence)],
  ['scheduled worker invokes AI governance sweep', /refreshAllAIGovernanceIntelligence\(\)/.test(worker)],
  ['worker schedule is minutely', /"path"\s*:\s*"\/api\/jobs\/worker"/.test(vercel) && /"schedule"\s*:\s*"\* \* \* \* \*"/.test(vercel)],
  ['read model exposes separate control posture', /controlPosture:\s*ControlPosture/.test(intelligence)],
  ['read model distinguishes proposed and active controls', /proposedControls/.test(intelligence) && /activeControls/.test(intelligence) && /review_status/.test(intelligence) && /authority_class/.test(intelligence)],
  ['read model uses latest evaluation per scope', /latestPerControlScope/.test(intelligence) && /scope_binding_id/.test(intelligence)],
  ['read model exposes unresolved findings', /openFindings/.test(intelligence) && /\['OPEN', 'ACKNOWLEDGED'\]/.test(intelligence)],
  ['read model does not expose raw control evidence', !/from\('control_evidence'\)/.test(intelligence)],
  ['posture API requires catalog read', /authorizeProject\(user\.id, projectId, 'catalog\.read'\)/.test(posture)],
  ['posture API uses governed intelligence read model', /loadProjectAIGovernanceIntelligence/.test(posture) && /intelligence\.controlPosture/.test(posture)],
]

const failures = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Governance control operability verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`Governance control operability verification passed (${checks.length} checks).`)
