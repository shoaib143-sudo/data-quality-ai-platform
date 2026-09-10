import fs from 'node:fs'

const service = fs.readFileSync('lib/governance/dataset-governance-posture.ts', 'utf8')
const route = fs.readFileSync('app/api/governance/dataset-posture/route.ts', 'utf8')
const fixture = JSON.parse(fs.readFileSync('fixtures/reference-estate/customer-orders-payments-v0.json', 'utf8'))

const checks = [
  ['API uses non-redirecting authentication', route.includes("requireApiUser") && !route.includes("requireUser()")],
  ['API requires project and dataset identifiers', route.includes("projectId is required") && route.includes("datasetId is required")],
  ['API enforces catalog.read before posture load', /authorizeProject\(user\.id, projectId, 'catalog\.read'\)[\s\S]*loadDatasetGovernancePosture\(projectId, datasetId\)/.test(route)],
  ['dataset lookup is project scoped', /from\('datasets'\)[\s\S]*\.eq\('id', datasetId\)[\s\S]*\.eq\('project_id', projectId\)/.test(service)],
  ['dataset catalog read is project and dataset scoped', /from\('dataset_catalog'\)[\s\S]*\.eq\('project_id', projectId\)\.eq\('dataset_id', datasetId\)/.test(service)],
  ['classification read is current and project scoped', /from\('dataset_classifications'\)[\s\S]*\.eq\('project_id', projectId\)\.eq\('dataset_id', datasetId\)\.eq\('target_state', 'CURRENT'\)/.test(service)],
  ['authoritative classification requires approval and authority', service.includes("upper(row.status) === 'APPROVED'") && service.includes("upper(row.authority_state) === 'AUTHORITATIVE'")],
  ['proposed classification remains separate', service.includes('proposedClassifications') && service.includes('authoritativeClassifications')],
  ['CDE suggestions remain separate from approved mappings', service.includes('approvedCdeMappings') && service.includes('proposedCdeMappings')],
  ['glossary suggestions remain separate from approved mappings', service.includes('approvedGlossaryMappings') && service.includes('proposedGlossaryMappings')],
  ['stewardship requires current active governed state', service.includes("row.active === true") && service.includes("upper(row.status) === 'ACTIVE'") && service.includes("upper(row.target_state) === 'CURRENT'")],
  ['controls distinguish authoritative and proposed state', service.includes('authoritativeControls') && service.includes('proposedControls') && service.includes("upper(control.review_status) === 'APPROVED'")],
  ['control posture carries latest persisted evaluation', service.includes('latestEvaluations') && service.includes('latestEvaluation')],
  ['sensitive lifecycle gaps are explicit', ['RETENTION_UNDEFINED','USAGE_PURPOSE_UNDEFINED','JURISDICTION_UNDEFINED','ACCESS_CONTROL_EVIDENCE_MISSING'].every((code) => service.includes(code))],
  ['governance review gaps are explicit', ['CLASSIFICATION_REVIEW_REQUIRED','CDE_REVIEW_REQUIRED','GLOSSARY_REVIEW_REQUIRED','ACCOUNTABILITY_REQUIRED','CONTROL_EVALUATION_MISSING'].every((code) => service.includes(code))],
  ['missing certification assessment is not fabricated', service.includes('CERTIFICATION_READINESS_NOT_ASSESSED') && service.includes('certificationReadiness: readinessResult.data ?? null')],
  ['read model performs no governance writes', !/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(service)],
  ['reference estate includes sensitive and critical data', fixture.datasets.some((dataset) => dataset.sensitivity === 'HIGH') && fixture.datasets.some((dataset) => dataset.criticality === 'CRITICAL')],
  ['reference estate includes classification review mutation', fixture.scenarios.some((scenario) => scenario.key === 'new-sensitive-field' && scenario.expectedSignals.includes('STEWARD_REVIEW_REQUIRED'))],
  ['reference estate includes missing steward degraded path', fixture.scenarios.some((scenario) => scenario.key === 'missing-steward' && scenario.mode === 'DEGRADED')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Sensitive governance journey verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`Sensitive governance journey verification passed (${checks.length} checks).`)
