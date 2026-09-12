import fs from 'node:fs'

const contract = JSON.parse(fs.readFileSync('infra/release-assurance/release-assurance-contract.json', 'utf8'))
const migration = fs.readFileSync('supabase/migrations/20260912060000_release_assurance_evidence.sql', 'utf8')
const evaluator = fs.readFileSync('lib/release-assurance/release-evidence.ts', 'utf8')

const fail = (message) => { throw new Error(message) }

if (contract.schemaVersion !== 2) fail('Release assurance contract must remain versioned at schemaVersion 2.')
if (JSON.stringify(contract.claimLevels) !== JSON.stringify(['IMPLEMENTED','CERTIFIED','PRODUCTION_VERIFIED'])) fail('Release claim levels changed unexpectedly.')
for (const context of ['build','analyze','revalidate','certify']) if (!contract.requiredProtectedContexts.includes(context)) fail(`Missing protected context ${context}.`)
for (const path of ['NORMAL','ADVERSARIAL','DEGRADED']) if (!contract.requiredProductionAcceptancePaths.includes(path)) fail(`Missing production acceptance path ${path}.`)
for (const evidenceClass of ['SOURCE_IDENTITY','EXACT_HEAD_CERTIFICATION','DEPLOYED_ARTIFACT_PROVENANCE','DEPLOYMENT_BINDING','DATABASE_MIGRATION_BINDING','RUNTIME_CONFIGURATION_BINDING','AUTHENTICATED_JOURNEY','ADVERSARIAL_JOURNEY','DEGRADED_JOURNEY','PERSONA_PRODUCTION_EVIDENCE','RECOVERY_EVIDENCE','RESIDUAL_RISK_SNAPSHOT']) {
  if (!contract.requiredProductionEvidenceClasses.includes(evidenceClass)) fail(`Missing production evidence class ${evidenceClass}.`)
}
const rules = contract.productionRules
if (rules.expectedRepository !== 'shoaib143-sudo/data-quality-ai-platform') fail('Release assurance must be repository-bound.')
if (rules.expectedProtectedBranch !== 'main') fail('Release assurance must be protected-main-bound.')
if (rules.expectedDeploymentProvider !== 'vercel') fail('Release assurance must bind the production deployment provider.')
if (rules.expectedCanonicalProductionAlias !== 'data-quality-ai-platform.vercel.app') fail('Release assurance must bind the canonical production alias.')
if (rules.evidenceFreshnessHours !== 24) fail('Production evidence freshness must remain fixed at 24 hours.')
if (rules.referenceBuildMaySatisfyDeployedArtifactProvenance !== false) fail('Reference builds must not satisfy deployed-artifact provenance.')
for (const flag of ['deploymentEvidenceMustBeFreshPass','databaseMustBindDeploymentId','databaseEvidenceMustBeFreshPass','runtimeMustBindDeploymentId','runtimeEvidenceMustBeFreshPass','journeyEvidenceMustBindDeploymentId','personaEvidenceMustBindDeploymentId','recoveryEvidenceMustBindDeploymentId']) {
  if (rules[flag] !== true) fail(`${flag} must remain enforced.`)
}
if (rules.previewEvidenceMaySatisfyProduction !== false) fail('Preview evidence must never satisfy production verification.')
if (rules.notMeasuredMaySatisfyRequiredEvidence !== false) fail('NOT_MEASURED must never satisfy production verification.')
if (rules.staleEvidenceMaySatisfyRequiredEvidence !== false) fail('Stale evidence must never satisfy production verification.')
if (rules.residualRiskSnapshotRequired !== true) fail('Residual-risk snapshot must be mandatory.')
if (rules.callerMayOverrideClockOrFreshness !== false) fail('Callers must not control verification time or freshness policy.')
if (rules.ledgerClaimRowsAreGovernanceAuthority !== false || rules.ledgerAuthorityState !== 'EVIDENCE_ONLY') fail('Evidence ledger must remain non-authoritative.')
if (rules.directServiceRoleInsertAllowed !== false) fail('Direct service-role inserts must remain prohibited.')
if (contract.personaPolicy.formalPersonas.length !== 13) fail('All 13 formal personas must remain represented.')
if (contract.personaPolicy.allFormalPersonasRequiredForProductionVerification !== true) fail('All 13 personas must be mandatory for production verification.')
if (contract.recoveryAuthority !== 'infra/recovery/full-platform-recovery-contract.json') fail('Recovery authority must remain canonical.')
if (contract.topologyAuthority !== 'infra/recovery/platform-manifest.json') fail('Topology authority must remain canonical.')

for (const marker of [
  "EXPECTED_REPOSITORY = 'shoaib143-sudo/data-quality-ai-platform'",
  "EXPECTED_PROTECTED_BRANCH = 'main'",
  "EXPECTED_DEPLOYMENT_PROVIDER = 'vercel'",
  "EXPECTED_PRODUCTION_ALIAS = 'data-quality-ai-platform.vercel.app'",
  'MAX_EVIDENCE_AGE_HOURS = 24',
  'SOURCE_REPOSITORY_MISMATCH',
  'SOURCE_BRANCH_NOT_PROTECTED_MAIN',
  'BUILD_PROVENANCE_NOT_FRESH_PASS',
  'DEPLOYED_ARTIFACT_PROVENANCE_MISSING',
  'DEPLOYMENT_EVIDENCE_NOT_FRESH_PASS',
  'DATABASE_DEPLOYMENT_MISMATCH',
  'DATABASE_EVIDENCE_NOT_FRESH_PASS',
  'RUNTIME_DEPLOYMENT_MISMATCH',
  'RUNTIME_EVIDENCE_NOT_FRESH_PASS',
  'CANONICAL_PRODUCTION_ALIAS_MISSING',
  'RESIDUAL_RISK_SNAPSHOT_MISSING',
  'RECOVERY_DEPLOYMENT_MISMATCH',
  'RECOVERY_EVIDENCE_NOT_FRESH_PASS',
  'R3_OPEN'
]) {
  if (!evaluator.includes(marker)) fail(`Evaluator must enforce ${marker}.`)
}
if (evaluator.includes('input.now') || evaluator.includes('input.maxEvidenceAgeHours') || evaluator.includes('affectsSharedPersonaSurface')) {
  fail('Caller-controlled clock, freshness, or persona applicability must not exist in production verification.')
}

for (const marker of [
  'create table if not exists app.release_assurance_evidence',
  'enable row level security',
  'revoke all on table app.release_assurance_evidence from public, anon, authenticated, service_role',
  'grant select on table app.release_assurance_evidence to service_role',
  'create or replace function app.record_release_assurance_evidence',
  'revoke execute on function app.record_release_assurance_evidence',
  'grant execute on function app.record_release_assurance_evidence',
  'release_assurance_evidence_append_only',
  "authority_state text not null default 'EVIDENCE_ONLY'",
  'release_assurance_evidence_hash_matches',
  "p_asserted_claim_level = 'CERTIFIED'",
  "asserted_claim_level = 'IMPLEMENTED'",
  "p_asserted_claim_level = 'PRODUCTION_VERIFIED'",
  "asserted_claim_level = 'CERTIFIED'",
  'CERTIFIED requires a matching IMPLEMENTED assertion for the same release and source commit',
  'PRODUCTION_VERIFIED requires a matching CERTIFIED assertion for the same release and source commit'
]) {
  if (!migration.toLowerCase().includes(marker.toLowerCase())) fail(`Release evidence migration missing marker: ${marker}`)
}
if (migration.toLowerCase().includes('grant select, insert on table app.release_assurance_evidence to service_role')) fail('Direct service-role INSERT must not be granted on the evidence ledger.')
if (!migration.includes("asserted_claim_level in ('IMPLEMENTED','CERTIFIED','PRODUCTION_VERIFIED')")) fail('Database must constrain asserted release claim levels.')
if (!migration.includes("source_commit_sha ~ '^[0-9a-f]{40}$'")) fail('Database must require an exact source commit SHA.')
if (!migration.includes("authority_state = 'EVIDENCE_ONLY'")) fail('Database evidence rows must remain explicitly non-authoritative.')

console.log(`Release assurance v2 verified: ${contract.requiredProductionEvidenceClasses.length} production evidence classes, ${contract.personaPolicy.formalPersonas.length} mandatory personas, governed claim progression.`)
