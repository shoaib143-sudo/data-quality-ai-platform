import fs from 'node:fs'

const incident = fs.readFileSync('lib/data-quality/incident-posture.ts', 'utf8')
const postureRoute = fs.readFileSync('app/api/data-quality/incident-posture/route.ts', 'utf8')
const runRoute = fs.readFileSync('app/api/data-quality/run/route.ts', 'utf8')
const remediationRoute = fs.readFileSync('app/api/data-quality/remediation/route.ts', 'utf8')
const dqTruth = fs.readFileSync('supabase/migrations/20260910184500_dq_result_truth_and_sensitive_evidence.sql', 'utf8')
const fixture = JSON.parse(fs.readFileSync('fixtures/reference-estate/customer-orders-payments-v0.json', 'utf8'))

const canonical = ['PASS', 'FAIL', 'NOT_MEASURED', 'UNAVAILABLE', 'ERROR', 'NOT_APPLICABLE', 'WAIVED']
const checks = [
  ['incident posture declares every canonical result state', canonical.every((state) => incident.includes(`'${state}'`))],
  ['database truth migration declares every canonical result state', canonical.every((state) => dqTruth.includes(`'${state}'`))],
  ['quality run is resolved through project-scoped rule definition', /from\('quality_rule_definitions'\)[\s\S]*\.eq\('id', runResult\.data\.rule_definition_id\)[\s\S]*\.eq\('project_id', projectId\)/.test(incident)],
  ['non-canonical result fails closed', incident.includes('Quality rule run has non-canonical result state')],
  ['binary truth only applies to PASS or FAIL', incident.includes("resultState === 'PASS' || resultState === 'FAIL'")],
  ['failed result requires remediation only without valid waiver', incident.includes("resultState === 'FAIL' && validWaivers.length === 0")],
  ['waiver requires approved governed state', incident.includes("['APPROVED', 'WAIVED'].includes") && incident.includes('approved_by') && incident.includes('approved_at')],
  ['expired waiver is rejected', incident.includes('expiry > now')],
  ['unavailable/error states preserve an explicit reason', incident.includes('unavailableReason') && incident.includes('not_measured_reason') && incident.includes('not_applicable_reason')],
  ['incident posture links CDE and authoritative classification impact', incident.includes('cdeMappings') && incident.includes('authoritativeClassifications')],
  ['incident posture links anomalies', incident.includes('anomalyEvidence') && incident.includes("from('profile_anomalies')")],
  ['incident posture links issues and remediation outcomes', incident.includes("from('issues')") && incident.includes("from('data_quality_remediation_outcomes')")],
  ['verified outcome requires VERIFIED plus verified_at', incident.includes("upper(outcome.status) === 'VERIFIED'") && incident.includes('outcome.verified_at')],
  ['incident posture links learning without treating it as result truth', incident.includes("from('data_quality_recommendation_learning')") && incident.includes('quality_rule_run_ids')],
  ['posture API uses API-safe auth', postureRoute.includes('requireApiUser') && !postureRoute.includes('requireUser()')],
  ['posture API authorizes project before loading incident', /authorizeProject\(user\.id, projectId, 'catalog\.read'\)[\s\S]*loadDataQualityIncidentPosture/.test(postureRoute)],
  ['DQ execution API uses API-safe auth', runRoute.includes('requireApiUser') && !runRoute.includes('requireUser()')],
  ['DQ execution preserves quality.execute authorization', runRoute.includes("authorizeDatasetVersion(user.id, datasetVersionId, 'quality.execute')")],
  ['DQ remediation API uses API-safe auth', remediationRoute.includes('requireApiUser') && !remediationRoute.includes('requireUser()')],
  ['DQ remediation requires approved workflow', remediationRoute.includes("instance.status !== 'APPROVED'")],
  ['DQ remediation preserves issues.manage authorization', remediationRoute.includes("authorizeProject(user.id, instance.project_id, 'issues.manage')")],
  ['DQ remediation does not claim production mutation', remediationRoute.includes("productionMutationPerformed: false") && remediationRoute.includes("execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY'")],
  ['reference estate has DQ regression scenario', fixture.scenarios.some((scenario) => scenario.key === 'customer-email-null-regression' && scenario.expectedSignals.includes('DQ_FAIL'))],
  ['reference estate has referential-integrity scenario', fixture.scenarios.some((scenario) => scenario.key === 'orphan-payment' && scenario.expectedSignals.includes('REFERENTIAL_INTEGRITY_FAIL'))],
  ['reference estate has freshness scenario', fixture.scenarios.some((scenario) => scenario.key === 'orders-freshness-breach' && scenario.expectedSignals.includes('FRESHNESS_FAIL'))],
  ['reference estate has expired waiver degraded scenario', fixture.scenarios.some((scenario) => scenario.key === 'expired-waiver' && scenario.expectedSignals.includes('WAIVER_INVALID'))],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`DQ incident journey verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`DQ incident journey verification passed (${checks.length} checks).`)
