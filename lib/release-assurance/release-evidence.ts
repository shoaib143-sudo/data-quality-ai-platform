export type ReleaseClaimLevel = 'IMPLEMENTED' | 'CERTIFIED' | 'PRODUCTION_VERIFIED'
export type EvidenceState = 'PASS' | 'FAIL' | 'NOT_MEASURED' | 'UNAVAILABLE' | 'STALE'
export type AcceptancePath = 'NORMAL' | 'ADVERSARIAL' | 'DEGRADED'
export type BuildArtifactClass = 'REFERENCE_BUILD' | 'PRODUCTION_DEPLOYMENT'

export const FORMAL_PERSONAS = [
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
] as const

export type FormalPersona = (typeof FORMAL_PERSONAS)[number]

type TimedEvidence = {
  state: EvidenceState
  observedAt: string
}

type ResidualRisk = {
  id: string
  riskTier: 'R0' | 'R1' | 'R2' | 'R3'
  status: 'OPEN' | 'ACCEPTED' | 'CLOSED'
  reviewBy: string
}

export type ReleaseAssuranceInput = {
  source: {
    repository: string
    commitSha: string
    protectedBranch: string
  }
  certification: {
    exactHeadSha: string
    contexts: Record<string, EvidenceState>
  }
  build?: {
    builderIdentity: string
    buildId: string
    sourceCommitSha: string
    provenanceRef: string
    artifactDigest: string
    artifactClass: BuildArtifactClass
    provenanceEvidence: TimedEvidence
  }
  deployment?: {
    provider: string
    deploymentId: string
    environment: 'preview' | 'production'
    state: string
    sourceCommitSha: string
    aliases: string[]
    evidence: TimedEvidence
  }
  database?: {
    migrationSetHash: string
    latestMigration: string
    sourceCommitSha: string
    deploymentId: string
    evidence: TimedEvidence
  }
  runtime?: {
    configContractVersion: string
    sourceCommitSha: string
    deploymentId: string
    evidence: TimedEvidence
  }
  journeys?: Array<{
    id: string
    path: AcceptancePath
    authenticated: boolean
    environment: 'preview' | 'production'
    sourceCommitSha: string
    deploymentId: string
    evidence: TimedEvidence
  }>
  personaEvidence?: Array<{
    persona: FormalPersona
    environment: 'preview' | 'production'
    sourceCommitSha: string
    deploymentId: string
    evidence: TimedEvidence
  }>
  recovery?: TimedEvidence & {
    sourceCommitSha: string
    deploymentId: string
    rehearsalId: string
  }
  residualRiskSnapshot?: TimedEvidence & {
    risks: ResidualRisk[]
  }
}

export type ReleaseAssuranceResult = {
  highestClaim: ReleaseClaimLevel
  blockers: string[]
  productionVerified: boolean
  certified: boolean
}

const SHA40 = /^[a-f0-9]{40}$/i
const SHA256 = /^sha256:[a-f0-9]{64}$/i
const REQUIRED_CONTEXTS = ['build', 'analyze', 'revalidate', 'certify'] as const
const REQUIRED_PATHS: AcceptancePath[] = ['NORMAL', 'ADVERSARIAL', 'DEGRADED']
const EXPECTED_REPOSITORY = 'shoaib143-sudo/data-quality-ai-platform'
const EXPECTED_PROTECTED_BRANCH = 'main'
const EXPECTED_DEPLOYMENT_PROVIDER = 'vercel'
const EXPECTED_PRODUCTION_ALIAS = 'data-quality-ai-platform.vercel.app'
const MAX_EVIDENCE_AGE_HOURS = 24

function isFresh(observedAt: string, now: Date) {
  const observed = new Date(observedAt)
  if (Number.isNaN(observed.getTime())) return false
  const ageMs = now.getTime() - observed.getTime()
  return ageMs >= 0 && ageMs <= MAX_EVIDENCE_AGE_HOURS * 60 * 60 * 1000
}

function isPassingFreshEvidence(evidence: TimedEvidence | undefined, now: Date) {
  return Boolean(evidence && evidence.state === 'PASS' && isFresh(evidence.observedAt, now))
}

export function evaluateReleaseAssurance(input: ReleaseAssuranceInput): ReleaseAssuranceResult {
  const blockers: string[] = []
  const sourceSha = input.source.commitSha
  const now = new Date()

  if (input.source.repository !== EXPECTED_REPOSITORY) blockers.push('SOURCE_REPOSITORY_MISMATCH')
  if (input.source.protectedBranch !== EXPECTED_PROTECTED_BRANCH) blockers.push('SOURCE_BRANCH_NOT_PROTECTED_MAIN')
  if (!SHA40.test(sourceSha)) blockers.push('SOURCE_COMMIT_INVALID')
  if (input.certification.exactHeadSha !== sourceSha) blockers.push('CERTIFICATION_HEAD_MISMATCH')
  for (const context of REQUIRED_CONTEXTS) {
    if (input.certification.contexts[context] !== 'PASS') blockers.push(`PROTECTED_CONTEXT_${context.toUpperCase()}_NOT_PASS`)
  }

  const certified = blockers.length === 0
  if (!certified) {
    return { highestClaim: 'IMPLEMENTED', blockers, productionVerified: false, certified: false }
  }

  if (!input.build) blockers.push('BUILD_PROVENANCE_MISSING')
  else {
    if (input.build.sourceCommitSha !== sourceSha) blockers.push('BUILD_SOURCE_MISMATCH')
    if (!input.build.builderIdentity.trim()) blockers.push('BUILDER_IDENTITY_MISSING')
    if (!input.build.buildId.trim()) blockers.push('BUILD_ID_MISSING')
    if (!input.build.provenanceRef.trim()) blockers.push('BUILD_PROVENANCE_REF_MISSING')
    if (!SHA256.test(input.build.artifactDigest)) blockers.push('ARTIFACT_DIGEST_INVALID')
    if (!isPassingFreshEvidence(input.build.provenanceEvidence, now)) blockers.push('BUILD_PROVENANCE_NOT_FRESH_PASS')
    if (input.build.artifactClass !== 'PRODUCTION_DEPLOYMENT') blockers.push('DEPLOYED_ARTIFACT_PROVENANCE_MISSING')
  }

  const deploymentId = input.deployment?.deploymentId ?? ''
  if (!input.deployment) blockers.push('DEPLOYMENT_EVIDENCE_MISSING')
  else {
    if (input.deployment.provider !== EXPECTED_DEPLOYMENT_PROVIDER) blockers.push('DEPLOYMENT_PROVIDER_MISMATCH')
    if (input.deployment.environment !== 'production') blockers.push('DEPLOYMENT_NOT_PRODUCTION')
    if (input.deployment.state !== 'READY') blockers.push('DEPLOYMENT_NOT_READY')
    if (input.deployment.sourceCommitSha !== sourceSha) blockers.push('DEPLOYMENT_SOURCE_MISMATCH')
    if (!input.deployment.deploymentId.trim()) blockers.push('DEPLOYMENT_ID_MISSING')
    if (!input.deployment.aliases.includes(EXPECTED_PRODUCTION_ALIAS)) blockers.push('CANONICAL_PRODUCTION_ALIAS_MISSING')
    if (!isPassingFreshEvidence(input.deployment.evidence, now)) blockers.push('DEPLOYMENT_EVIDENCE_NOT_FRESH_PASS')
  }

  if (!input.database) blockers.push('DATABASE_BINDING_MISSING')
  else {
    if (!SHA256.test(input.database.migrationSetHash)) blockers.push('MIGRATION_SET_HASH_INVALID')
    if (!input.database.latestMigration.trim()) blockers.push('LATEST_MIGRATION_MISSING')
    if (input.database.sourceCommitSha !== sourceSha) blockers.push('DATABASE_SOURCE_MISMATCH')
    if (input.database.deploymentId !== deploymentId) blockers.push('DATABASE_DEPLOYMENT_MISMATCH')
    if (!isPassingFreshEvidence(input.database.evidence, now)) blockers.push('DATABASE_EVIDENCE_NOT_FRESH_PASS')
  }

  if (!input.runtime) blockers.push('RUNTIME_BINDING_MISSING')
  else {
    if (!input.runtime.configContractVersion.trim()) blockers.push('RUNTIME_CONFIG_VERSION_MISSING')
    if (input.runtime.sourceCommitSha !== sourceSha) blockers.push('RUNTIME_SOURCE_MISMATCH')
    if (input.runtime.deploymentId !== deploymentId) blockers.push('RUNTIME_DEPLOYMENT_MISMATCH')
    if (!isPassingFreshEvidence(input.runtime.evidence, now)) blockers.push('RUNTIME_EVIDENCE_NOT_FRESH_PASS')
  }

  const journeys = input.journeys ?? []
  for (const path of REQUIRED_PATHS) {
    const candidates = journeys.filter((journey) => journey.path === path)
    if (!candidates.length) {
      blockers.push(`${path}_JOURNEY_MISSING`)
      continue
    }
    const valid = candidates.some((journey) =>
      journey.authenticated &&
      journey.environment === 'production' &&
      journey.sourceCommitSha === sourceSha &&
      journey.deploymentId === deploymentId &&
      isPassingFreshEvidence(journey.evidence, now)
    )
    if (!valid) blockers.push(`${path}_JOURNEY_NOT_PRODUCTION_PASS`)
  }

  const personaEvidence = input.personaEvidence ?? []
  for (const persona of FORMAL_PERSONAS) {
    const valid = personaEvidence.some((item) =>
      item.persona === persona &&
      item.environment === 'production' &&
      item.sourceCommitSha === sourceSha &&
      item.deploymentId === deploymentId &&
      isPassingFreshEvidence(item.evidence, now)
    )
    if (!valid) blockers.push(`PERSONA_${persona.toUpperCase().replaceAll('-', '_')}_MISSING`)
  }

  if (!input.recovery) blockers.push('RECOVERY_EVIDENCE_MISSING')
  else {
    if (input.recovery.sourceCommitSha !== sourceSha) blockers.push('RECOVERY_SOURCE_MISMATCH')
    if (input.recovery.deploymentId !== deploymentId) blockers.push('RECOVERY_DEPLOYMENT_MISMATCH')
    if (!input.recovery.rehearsalId.trim()) blockers.push('RECOVERY_REHEARSAL_ID_MISSING')
    if (!isPassingFreshEvidence(input.recovery, now)) blockers.push('RECOVERY_EVIDENCE_NOT_FRESH_PASS')
  }

  if (!input.residualRiskSnapshot) blockers.push('RESIDUAL_RISK_SNAPSHOT_MISSING')
  else {
    if (!isPassingFreshEvidence(input.residualRiskSnapshot, now)) blockers.push('RESIDUAL_RISK_SNAPSHOT_NOT_FRESH_PASS')
    for (const risk of input.residualRiskSnapshot.risks) {
      const reviewBy = new Date(risk.reviewBy)
      if (Number.isNaN(reviewBy.getTime()) || reviewBy.getTime() < now.getTime()) {
        blockers.push(`RESIDUAL_RISK_${risk.id}_EXPIRED`)
      }
      if (risk.riskTier === 'R3' && risk.status !== 'CLOSED') {
        blockers.push(`RESIDUAL_RISK_${risk.id}_R3_OPEN`)
      }
    }
  }

  const productionVerified = blockers.length === 0
  return {
    highestClaim: productionVerified ? 'PRODUCTION_VERIFIED' : 'CERTIFIED',
    blockers,
    productionVerified,
    certified: true,
  }
}
