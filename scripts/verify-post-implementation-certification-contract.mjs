import fs from 'node:fs'

const contract = JSON.parse(fs.readFileSync('infra/platform-assurance/post-implementation-certification-contract.json', 'utf8'))
const fail = (message) => { throw new Error(message) }
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)

if (contract.schemaVersion !== 1) fail('Post-implementation certification contract schemaVersion must be 1.')
if (!contract.authority || !fs.existsSync(contract.authority)) fail('Certification contract must point to an existing architecture authority.')
if (!contract.implementationMap || !fs.existsSync(contract.implementationMap)) fail('Certification contract must point to the active implementation map.')

const claimLevels = ['IMPLEMENTED', 'CERTIFIED', 'PRODUCTION_VERIFIED']
if (!same(contract.claimLevels, claimLevels)) fail('Certification claim levels must remain ordered IMPLEMENTED -> CERTIFIED -> PRODUCTION_VERIFIED.')

const resultStates = ['PASS', 'FAIL', 'NOT_MEASURED', 'NOT_APPLICABLE', 'WAIVED']
if (!same(contract.resultStates, resultStates)) fail('Certification evidence result states changed unexpectedly.')

const requiredTruthRules = {
  syntheticEvidenceMayProveProduction: false,
  ciSuccessMaySubstituteForProductionEvidence: false,
  staticSourceEvidenceMaySubstituteForRuntimeEvidence: false,
  notMeasuredMaySatisfyRequiredEvidence: false,
  staleEvidenceMaySatisfyRequiredEvidence: false,
  waivedR3AuthorizationOrGovernanceTruthBoundaryAllowed: false,
  certifiedCommitMustEqualProductionSourceCommit: true,
  databaseMigrationHistoryMustBeReconciled: true,
  independentPostImplementationEvidenceRequired: true,
}
for (const [key, expected] of Object.entries(requiredTruthRules)) {
  if (contract.truthRules?.[key] !== expected) fail(`Certification truth rule ${key} must remain ${expected}.`)
}

const requiredRecordFields = [
  'evidenceClass', 'result', 'sourceCommit', 'environment', 'observedAt', 'producer', 'evidenceRef', 'freshnessPolicy',
]
for (const field of requiredRecordFields) {
  if (!contract.requiredEvidenceRecordFields?.includes(field)) fail(`Certification evidence records must require ${field}.`)
}

const requiredScopes = [
  'GOVERNANCE_TRUTH_AND_LIFECYCLE',
  'EVIDENCE_AND_CONTROL_PLANE',
  'DATA_QUALITY_CONTROL_SYSTEM',
  'DATA_ESTATE_KNOWLEDGE_GRAPH',
  'GOVERNED_INVESTIGATION_AND_AGENTS',
  'GOVERNED_ACTION_AND_LEARNING',
  'OPERATIONAL_ASSURANCE',
  'PERSONA_AWARE_PRESENTATION',
]
if (!same(contract.requiredImplementationScopes, requiredScopes)) fail('Master implementation scopes must remain complete and ordered.')
if (!same(contract.requiredAcceptancePaths, ['NORMAL', 'UNAUTHORIZED_ADVERSARIAL', 'DEGRADED_FAILURE'])) fail('Three-path acceptance is mandatory.')

const classes = contract.mandatoryEvidenceClasses ?? []
const classIds = classes.map(item => item.id)
if (new Set(classIds).size !== classIds.length) fail('Mandatory certification evidence class IDs must be unique.')
const requiredClasses = [
  'SOURCE_RELEASE_INTEGRITY',
  'CI_WORKFLOW_SECURITY',
  'DEPENDENCY_AND_CODE_SECURITY',
  'AUTHORIZATION_AND_ISOLATION',
  'DATABASE_AUTHORITY_AND_RLS',
  'MIGRATION_AND_RECONSTRUCTION',
  'BUILD_PROVENANCE',
  'DEPLOYMENT_PROVENANCE',
  'PRODUCTION_RUNTIME_JOURNEY',
  'RECOVERY_ROLLBACK_AND_COMPENSATION',
  'OBSERVABILITY_AND_WORKFLOW_SLO',
  'AI_GOVERNANCE_AND_EVALUATION',
  'PERSONA_TASK_E2E',
  'RESIDUAL_RISK_AND_EXCEPTION_GOVERNANCE',
]
for (const id of requiredClasses) if (!classIds.includes(id)) fail(`Missing mandatory certification evidence class ${id}.`)
for (const item of classes) {
  if (!['R0', 'R1', 'R2', 'R3'].includes(item.riskTier)) fail(`Invalid risk tier for certification evidence class ${item.id}.`)
  if (!Array.isArray(item.requiredFor) || item.requiredFor.length === 0) fail(`Evidence class ${item.id} must declare required claim levels.`)
  for (const level of item.requiredFor) if (!claimLevels.includes(level)) fail(`Evidence class ${item.id} has invalid claim level ${level}.`)
  if (!Array.isArray(item.requirements) || item.requirements.length < 2) fail(`Evidence class ${item.id} must declare concrete verification requirements.`)
}

for (const id of [
  'SOURCE_RELEASE_INTEGRITY',
  'CI_WORKFLOW_SECURITY',
  'AUTHORIZATION_AND_ISOLATION',
  'DATABASE_AUTHORITY_AND_RLS',
  'MIGRATION_AND_RECONSTRUCTION',
  'BUILD_PROVENANCE',
  'DEPLOYMENT_PROVENANCE',
  'PRODUCTION_RUNTIME_JOURNEY',
  'RECOVERY_ROLLBACK_AND_COMPENSATION',
  'AI_GOVERNANCE_AND_EVALUATION',
  'RESIDUAL_RISK_AND_EXCEPTION_GOVERNANCE',
]) {
  if (classes.find(item => item.id === id)?.riskTier !== 'R3') fail(`${id} must remain an R3 certification boundary.`)
}

for (const id of ['BUILD_PROVENANCE', 'DEPLOYMENT_PROVENANCE', 'PRODUCTION_RUNTIME_JOURNEY', 'RECOVERY_ROLLBACK_AND_COMPENSATION', 'PERSONA_TASK_E2E']) {
  if (!classes.find(item => item.id === id)?.requiredFor?.includes('PRODUCTION_VERIFIED')) fail(`${id} must be required for PRODUCTION_VERIFIED.`)
}

const personas = [
  'senior-leadership',
  'business-user',
  'data-owner',
  'data-product-owner',
  'data-steward',
  'data-governance-specialist',
  'compliance-risk-officer',
  'privacy-security-officer',
  'data-governance-admin',
  'data-custodian',
  'source-system-owner',
  'metadata-analyst',
  'data-quality-analyst',
]
if (!same(contract.canonicalPersonas, personas)) fail('Production persona E2E certification must cover all 13 canonical personas.')

for (const key of ['liveProductionEvidenceMustDeclareMaximumAge', 'securityAdvisorEvidenceMustDeclareMaximumAge', 'recoveryEvidenceMustDeclareMaximumAge']) {
  if (contract.freshnessRules?.[key] !== true) fail(`Certification freshness rule ${key} must remain enabled.`)
}
if (contract.freshnessRules?.expiredEvidenceResult !== 'NOT_MEASURED') fail('Expired certification evidence must degrade to NOT_MEASURED.')

for (const field of ['riskId', 'owner', 'rationale', 'compensatingControls', 'acceptedAt', 'reviewDueAt', 'closureCondition']) {
  if (!contract.exceptionRecordRequiredFields?.includes(field)) fail(`Residual risk records must require ${field}.`)
}
for (const binding of ['certifiedSourceCommit', 'buildOrDeploymentProvenance', 'productionDeploymentId', 'productionDomainOrAlias', 'databaseMigrationSet', 'liveRuntimeEvidence']) {
  if (!contract.productionVerificationBindings?.includes(binding)) fail(`Production verification must bind ${binding}.`)
}

if (!contract.completionRule?.CERTIFIED?.includes('NOT_MEASURED')) fail('CERTIFIED completion rule must explicitly reject NOT_MEASURED evidence.')
if (!contract.completionRule?.PRODUCTION_VERIFIED?.includes('exact source/build/deployment/database/runtime binding')) fail('PRODUCTION_VERIFIED must require exact production provenance binding.')

console.log(`Post-implementation certification contract verified: ${classes.length} evidence classes, ${personas.length} personas, ${requiredScopes.length} implementation scopes.`)
