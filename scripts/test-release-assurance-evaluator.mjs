import assert from 'node:assert/strict'

const { evaluateReleaseAssurance, FORMAL_PERSONAS } = await import('../lib/release-assurance/release-evidence.ts')

const SHA = 'a'.repeat(40)
const digest = `sha256:${'b'.repeat(64)}`
const observedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
const staleObservedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
const futureReview = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
const expiredReview = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const DEPLOYMENT_ID = 'dpl_1'

function validInput() {
  return {
    source: { repository: 'shoaib143-sudo/data-quality-ai-platform', commitSha: SHA, protectedBranch: 'main' },
    certification: { exactHeadSha: SHA, contexts: { build: 'PASS', analyze: 'PASS', revalidate: 'PASS', certify: 'PASS' } },
    build: {
      builderIdentity: 'vercel-production-builder',
      buildId: 'build-1',
      sourceCommitSha: SHA,
      provenanceRef: 'attestation:build-1',
      artifactDigest: digest,
      artifactClass: 'PRODUCTION_DEPLOYMENT',
      provenanceEvidence: { state: 'PASS', observedAt },
    },
    deployment: {
      provider: 'vercel',
      deploymentId: DEPLOYMENT_ID,
      environment: 'production',
      state: 'READY',
      sourceCommitSha: SHA,
      aliases: ['data-quality-ai-platform.vercel.app'],
      evidence: { state: 'PASS', observedAt },
    },
    database: {
      migrationSetHash: digest,
      latestMigration: '20260912060000',
      sourceCommitSha: SHA,
      deploymentId: DEPLOYMENT_ID,
      evidence: { state: 'PASS', observedAt },
    },
    runtime: {
      configContractVersion: 'v1',
      sourceCommitSha: SHA,
      deploymentId: DEPLOYMENT_ID,
      evidence: { state: 'PASS', observedAt },
    },
    journeys: ['NORMAL', 'ADVERSARIAL', 'DEGRADED'].map((path) => ({
      id: `journey-${path}`,
      path,
      authenticated: true,
      environment: 'production',
      sourceCommitSha: SHA,
      deploymentId: DEPLOYMENT_ID,
      evidence: { state: 'PASS', observedAt },
    })),
    personaEvidence: FORMAL_PERSONAS.map((persona) => ({
      persona,
      environment: 'production',
      sourceCommitSha: SHA,
      deploymentId: DEPLOYMENT_ID,
      evidence: { state: 'PASS', observedAt },
    })),
    recovery: { state: 'PASS', observedAt, sourceCommitSha: SHA, deploymentId: DEPLOYMENT_ID, rehearsalId: 'recovery-1' },
    residualRiskSnapshot: {
      state: 'PASS',
      observedAt,
      risks: [{ id: 'rr-low', riskTier: 'R2', status: 'ACCEPTED', reviewBy: futureReview }],
    },
  }
}

{
  const result = evaluateReleaseAssurance(validInput())
  assert.equal(result.highestClaim, 'PRODUCTION_VERIFIED')
  assert.equal(result.productionVerified, true)
  assert.deepEqual(result.blockers, [])
}

{
  const input = validInput()
  input.source.repository = 'attacker/repository'
  const result = evaluateReleaseAssurance(input)
  assert.equal(result.highestClaim, 'IMPLEMENTED')
  assert(result.blockers.includes('SOURCE_REPOSITORY_MISMATCH'))
}

{
  const input = validInput()
  input.source.protectedBranch = 'feature/not-main'
  const result = evaluateReleaseAssurance(input)
  assert.equal(result.highestClaim, 'IMPLEMENTED')
  assert(result.blockers.includes('SOURCE_BRANCH_NOT_PROTECTED_MAIN'))
}

{
  const input = validInput()
  input.certification.exactHeadSha = 'c'.repeat(40)
  const result = evaluateReleaseAssurance(input)
  assert.equal(result.highestClaim, 'IMPLEMENTED')
  assert(result.blockers.includes('CERTIFICATION_HEAD_MISMATCH'))
}

{
  const input = validInput()
  input.build.provenanceEvidence.observedAt = staleObservedAt
  const result = evaluateReleaseAssurance(input)
  assert.equal(result.highestClaim, 'CERTIFIED')
  assert(result.blockers.includes('BUILD_PROVENANCE_NOT_FRESH_PASS'))
}

{
  const input = validInput()
  input.build.artifactClass = 'REFERENCE_BUILD'
  const result = evaluateReleaseAssurance(input)
  assert.equal(result.highestClaim, 'CERTIFIED')
  assert(result.blockers.includes('DEPLOYED_ARTIFACT_PROVENANCE_MISSING'))
}

{
  const input = validInput()
  input.deployment.sourceCommitSha = 'c'.repeat(40)
  const result = evaluateReleaseAssurance(input)
  assert.equal(result.highestClaim, 'CERTIFIED')
  assert(result.blockers.includes('DEPLOYMENT_SOURCE_MISMATCH'))
}

{
  const input = validInput()
  input.deployment.environment = 'preview'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('DEPLOYMENT_NOT_PRODUCTION'))
}

{
  const input = validInput()
  input.deployment.provider = 'unknown-provider'
  input.deployment.aliases = ['preview.example.com']
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('DEPLOYMENT_PROVIDER_MISMATCH'))
  assert(result.blockers.includes('CANONICAL_PRODUCTION_ALIAS_MISSING'))
}

{
  const input = validInput()
  input.deployment.evidence.observedAt = staleObservedAt
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('DEPLOYMENT_EVIDENCE_NOT_FRESH_PASS'))
}

{
  const input = validInput()
  input.database.migrationSetHash = 'not-a-digest'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('MIGRATION_SET_HASH_INVALID'))
}

{
  const input = validInput()
  input.database.deploymentId = 'dpl_other'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('DATABASE_DEPLOYMENT_MISMATCH'))
}

{
  const input = validInput()
  input.database.evidence.observedAt = staleObservedAt
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('DATABASE_EVIDENCE_NOT_FRESH_PASS'))
}

{
  const input = validInput()
  input.runtime.deploymentId = 'dpl_other'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('RUNTIME_DEPLOYMENT_MISMATCH'))
}

{
  const input = validInput()
  input.runtime.evidence.state = 'NOT_MEASURED'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('RUNTIME_EVIDENCE_NOT_FRESH_PASS'))
}

{
  const input = validInput()
  input.journeys.find((journey) => journey.path === 'ADVERSARIAL').evidence.state = 'NOT_MEASURED'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('ADVERSARIAL_JOURNEY_NOT_PRODUCTION_PASS'))
}

{
  const input = validInput()
  input.journeys.find((journey) => journey.path === 'NORMAL').deploymentId = 'dpl_old_same_sha'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('NORMAL_JOURNEY_NOT_PRODUCTION_PASS'))
}

{
  const input = validInput()
  input.journeys.find((journey) => journey.path === 'DEGRADED').environment = 'preview'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('DEGRADED_JOURNEY_NOT_PRODUCTION_PASS'))
}

{
  const input = validInput()
  input.personaEvidence = input.personaEvidence.filter((item) => item.persona !== 'privacy-security-officer')
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('PERSONA_PRIVACY_SECURITY_OFFICER_MISSING'))
}

{
  const input = validInput()
  input.personaEvidence[0].deploymentId = 'dpl_old_same_sha'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.some((blocker) => blocker.startsWith('PERSONA_SENIOR_LEADERSHIP_MISSING')))
}

{
  const input = validInput()
  input.personaEvidence = []
  const result = evaluateReleaseAssurance(input)
  assert(FORMAL_PERSONAS.every((persona) => result.blockers.includes(`PERSONA_${persona.toUpperCase().replaceAll('-', '_')}_MISSING`)))
}

{
  const input = validInput()
  input.recovery.observedAt = staleObservedAt
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('RECOVERY_EVIDENCE_NOT_FRESH_PASS'))
}

{
  const input = validInput()
  input.recovery.deploymentId = 'dpl_other'
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('RECOVERY_DEPLOYMENT_MISMATCH'))
}

{
  const input = validInput()
  delete input.residualRiskSnapshot
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('RESIDUAL_RISK_SNAPSHOT_MISSING'))
}

{
  const input = validInput()
  input.residualRiskSnapshot.observedAt = staleObservedAt
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('RESIDUAL_RISK_SNAPSHOT_NOT_FRESH_PASS'))
}

{
  const input = validInput()
  input.residualRiskSnapshot.risks = [{ id: 'critical', riskTier: 'R3', status: 'ACCEPTED', reviewBy: futureReview }]
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('RESIDUAL_RISK_critical_R3_OPEN'))
}

{
  const input = validInput()
  input.residualRiskSnapshot.risks = [{ id: 'expired', riskTier: 'R2', status: 'ACCEPTED', reviewBy: expiredReview }]
  const result = evaluateReleaseAssurance(input)
  assert(result.blockers.includes('RESIDUAL_RISK_expired_EXPIRED'))
}

console.log('Release assurance evaluator unit/adversarial tests passed.')
