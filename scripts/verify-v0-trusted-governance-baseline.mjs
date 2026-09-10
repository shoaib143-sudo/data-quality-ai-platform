import fs from 'node:fs'
import {
  CONTROL_EFFECTIVENESS_STATES,
  CONTROL_ENFORCEMENT_MODES,
  EVIDENCE_FRESHNESS_STATES,
  GOVERNANCE_TRUTH_CLASSES,
  JOURNEY_ACCEPTANCE_PATHS,
  validateEvidenceReference,
  validateTrustedControlAssessment,
} from '../lib/governance/trusted-operational-capability.ts'

const estatePath = 'fixtures/reference-estate/customer-orders-payments-v0.json'
const estate = JSON.parse(fs.readFileSync(estatePath, 'utf8'))

const checks = []
const check = (name, condition) => checks.push([name, Boolean(condition)])
const unique = (values) => new Set(values).size === values.length
const exists = (path) => fs.existsSync(path)

check('truth taxonomy is canonical', JSON.stringify(GOVERNANCE_TRUTH_CLASSES) === JSON.stringify([
  'AUTHORITATIVE_FACT', 'OBSERVED_EVIDENCE', 'DERIVED_INTELLIGENCE', 'GOVERNED_DECISION',
]))
check('control enforcement modes are canonical', JSON.stringify(CONTROL_ENFORCEMENT_MODES) === JSON.stringify(['OBSERVE', 'ADVISE', 'ENFORCE']))
check('control effectiveness states are canonical', JSON.stringify(CONTROL_EFFECTIVENESS_STATES) === JSON.stringify(['EFFECTIVE', 'PARTIAL', 'INEFFECTIVE', 'NOT_ASSESSED']))
check('evidence freshness states are canonical', JSON.stringify(EVIDENCE_FRESHNESS_STATES) === JSON.stringify(['CURRENT', 'STALE', 'EXPIRED', 'UNKNOWN']))
check('journey acceptance paths are canonical', JSON.stringify(JOURNEY_ACCEPTANCE_PATHS) === JSON.stringify(['NORMAL', 'UNAUTHORIZED', 'DEGRADED']))

validateEvidenceReference({
  truthClass: 'OBSERVED_EVIDENCE',
  objectType: 'PROFILE_RUN',
  objectId: 'fixture-profile-run',
  observedAt: '2026-09-10T00:00:00Z',
})
validateTrustedControlAssessment({
  controlKey: 'V0_FIXTURE_CONTROL',
  enforcementMode: 'OBSERVE',
  designEffectiveness: 'NOT_ASSESSED',
  operatingEffectiveness: 'NOT_ASSESSED',
  evidenceFreshness: 'UNKNOWN',
  evidence: [],
})
check('runtime evidence validators accept valid contracts', true)

check('reference estate version is v0', estate.version === 'v0')
check('reference estate identity is stable', estate.estateKey === 'customer-orders-payments')
check('reference estate has four business domains', Array.isArray(estate.domains) && estate.domains.length >= 4)
check('reference estate has multiple source systems', Array.isArray(estate.sources) && estate.sources.length >= 4)
check('reference estate has non-trivial dataset coverage', Array.isArray(estate.datasets) && estate.datasets.length >= 8)
check('reference estate has multiple CDEs', Array.isArray(estate.criticalDataElements) && estate.criticalDataElements.length >= 4)
check('reference estate has multiple controls', Array.isArray(estate.controls) && estate.controls.length >= 5)
check('reference estate has business impact objects', Array.isArray(estate.businessContext) && estate.businessContext.length >= 3)
check('reference estate has field lineage', Array.isArray(estate.lineage) && estate.lineage.length >= 5)

check('source ids are unique', unique(estate.sources.map((x) => x.id)))
check('dataset ids are unique', unique(estate.datasets.map((x) => x.id)))
check('CDE keys are unique', unique(estate.criticalDataElements.map((x) => x.key)))
check('control keys are unique', unique(estate.controls.map((x) => x.key)))
check('scenario keys are unique', unique(estate.scenarios.map((x) => x.key)))

const sourceIds = new Set(estate.sources.map((x) => x.id))
check('every dataset resolves to a declared source', estate.datasets.every((x) => sourceIds.has(x.sourceId)))
const datasetIds = estate.datasets.map((x) => x.id)
const fieldBelongsToDataset = (field) => datasetIds.some((datasetId) => field.startsWith(`${datasetId}.`))
check('every CDE mapping targets a declared dataset field', estate.criticalDataElements.every((cde) => cde.fields.length > 0 && cde.fields.every(fieldBelongsToDataset)))
check('every lineage endpoint targets a declared dataset field', estate.lineage.every((edge) => fieldBelongsToDataset(edge.from) && fieldBelongsToDataset(edge.to)))
check('every control has explicit enforcement mode', estate.controls.every((control) => CONTROL_ENFORCEMENT_MODES.includes(control.enforcementMode)))

const scenarioModes = new Set(estate.scenarios.map((x) => x.mode))
for (const mode of ['NORMAL', 'MUTATION', 'DEGRADED', 'ADVERSARIAL']) {
  check(`reference estate includes ${mode.toLowerCase()} scenario`, scenarioModes.has(mode))
}
check('reference estate has holdout scenarios', estate.scenarios.filter((x) => x.holdout === true).length >= 2)
check('every scenario declares expected signals', estate.scenarios.every((x) => Array.isArray(x.expectedSignals) && x.expectedSignals.length > 0))

const requiredScenarios = [
  'clean-baseline',
  'customer-email-null-regression',
  'duplicate-customer-id',
  'orphan-payment',
  'orders-freshness-breach',
  'customer-id-type-change',
  'new-sensitive-field',
  'expired-waiver',
  'missing-steward',
  'contract-breach',
  'malicious-governance-document',
  'provider-timeout',
  'partial-profile',
]
const scenarioKeys = new Set(estate.scenarios.map((x) => x.key))
check('required mutation/adversarial scenarios are present', requiredScenarios.every((key) => scenarioKeys.has(key)))

const requiredSubstrate = [
  'lib/profiling',
  'lib/data-quality',
  'lib/governance',
  'lib/agents',
  'lib/ai',
  'lib/orchestration',
  'app/datasets',
  'app/data-quality',
  'app/classification',
  'app/contracts',
  'scripts/verify-p0-p4-revalidation.mjs',
  'scripts/verify-profiling-lifecycle-contracts.mjs',
  'scripts/verify-governance-control-intelligence.mjs',
  'scripts/verify-worker-runtime.mjs',
  'supabase/migrations/20260910184500_dq_result_truth_and_sensitive_evidence.sql',
  'Architecture/2026-09-10-ADR-007-trusted-operational-governance-capability-model.md',
  'Architecture/2026-09-10-trusted-operational-governance-implementation-map.md',
  'Major discussion/2026-09-10-optimized-trusted-governance-implementation-plan.md',
]
for (const path of requiredSubstrate) check(`required substrate exists: ${path}`, exists(path))

const dqMigration = fs.readFileSync('supabase/migrations/20260910184500_dq_result_truth_and_sensitive_evidence.sql', 'utf8')
for (const state of ['PASS', 'FAIL', 'NOT_MEASURED', 'UNAVAILABLE', 'ERROR', 'NOT_APPLICABLE', 'WAIVED']) {
  check(`canonical DQ state preserved: ${state}`, dqMigration.includes(`'${state}'`))
}
check('sensitive DQ evidence is redacted at database boundary', dqMigration.includes('redact_governed_sensitive_sample'))

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`V0 trusted governance baseline failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`V0 trusted governance baseline passed (${checks.length} checks).`)
