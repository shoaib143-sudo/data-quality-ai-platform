import { validateLearningEvaluationPolicy, type LearningEvaluationPolicy, type LearningEvaluationResult } from './learning-evaluation-policy'

/** An immutable, pre-execution plan. This supports independent bounded paired
 * observations only; repeated datasets or correlated rows are not independent units. */
export type LearningRunnerAnalysisPlan = {
  ref: string
  method: 'PAIRED_BOUNDED_HOEFFDING'
  confidence: number
  confirmationWindowMs: number
  independentCaseUnits: true
}

/** These records must be loaded from server-owned persistence, never request JSON.
 * Digest integrity and reviewer authorization must be verified by the loader. */
export type CanonicalLearningArmScore = {
  experimentId: string
  projectId: string
  policyId: string
  policyRecordId: string
  candidateId: string
  caseKey: string
  arm: 'BASELINE' | 'CANDIDATE'
  version: string
  manifestHash: string
  inputHash: string
  outputHash: string
  attemptId: string
  evidenceId: string
  evidenceHash: string
  evaluatorActorId: string
  rubricRef: string
  calibrationRef: string
  observedAt: string
  score: number
  authorityViolations: number
  safetyFailures: number
  synthetic: boolean
}
export type CanonicalLearningAttemptSettlement = {
  experimentId: string
  projectId: string
  policyId: string
  policyRecordId: string
  candidateId: string
  attemptId: string
  caseKey: string
  arm: 'BASELINE' | 'CANDIDATE'
  version: string
  inputHash: string
  outputHash: string
  synthetic: boolean
  settlementId: string | null
  costEventId: string | null
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED'
  actualCost: number
  actualTokens: number
  latencyMs: number
  startedAt: string
  settledAt: string
  authorityViolations: number
  safetyFailures: number
}

function finite(value: number, label: string, integer = false) {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw new Error(`Invalid ${label}`)
}
function required(value: string, label: string) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`Invalid ${label}`)
}
function time(value: string, label: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}`)
  return parsed
}

/** Derive aggregate claims from complete immutable evidence. All charged attempts,
 * including retries and cancellations, must be supplied by the canonical loader.
 * No write, authentication, promotion, or model invocation occurs here. */
export function aggregateLearningExperimentEvidence(input: {
  policy: LearningEvaluationPolicy
  experimentId: string
  policyRecordId: string
  analysisPlan: LearningRunnerAnalysisPlan
  expectedCaseKeys: readonly string[]
  arms: readonly CanonicalLearningArmScore[]
  settlements: readonly CanonicalLearningAttemptSettlement[]
  now: string
  /** Server loader receipt, issued after digest, authorization and exhaustive attempt checks. */
  independentVerification?: {
    experimentId: string; projectId: string; policyRecordId: string
    evaluatorActorId: string; rubricRef: string; calibrationRef: string
    evidenceHashesVerified: true; evaluatorAuthorized: true; allAttemptsLoaded: true
  }
}) {
  const { policy, analysisPlan: plan } = input
  validateLearningEvaluationPolicy(policy)
  required(input.experimentId, 'experimentId')
  required(input.policyRecordId, 'policyRecordId')
  if (plan.ref !== policy.analysisPlanRef || plan.method !== 'PAIRED_BOUNDED_HOEFFDING' || plan.independentCaseUnits !== true) throw new Error('Unsupported or unbound analysis plan')
  if (!Number.isFinite(plan.confidence) || plan.confidence <= 0 || plan.confidence >= 1) throw new Error('Invalid confidence')
  finite(plan.confirmationWindowMs, 'confirmation window', true)
  const lockedAt = time(policy.lockedAt, 'policy lock')
  const now = time(input.now, 'now')
  if (now < lockedAt) throw new Error('Observation predates policy')
  const expected = new Set(input.expectedCaseKeys)
  if (expected.size !== input.expectedCaseKeys.length || expected.size !== policy.sampleSize || !expected.size) throw new Error('Expected cases must match locked sample size exactly')
  for (const key of expected) if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Case key must be SHA-256')
  const bind = (record: { experimentId: string; projectId: string; policyId: string; policyRecordId: string; candidateId: string }) => {
    if (record.experimentId !== input.experimentId || record.projectId !== policy.projectId || record.policyId !== policy.policyId || record.policyRecordId !== input.policyRecordId || record.candidateId !== policy.candidateId) throw new Error('Canonical evidence binding mismatch')
  }
  const attempts = new Map<string, CanonicalLearningAttemptSettlement>()
  const settlementIds = new Set<string>()
  const costEvents = new Set<string>()
  let totalCost = 0, totalTokens = 0, maxLatencyMs = 0
  let earliestStart = Infinity, latestSettlement = lockedAt
  let authorityViolations = 0, safetyFailures = 0, lastObservation = lockedAt
  for (const item of input.settlements) {
    bind(item)
    required(item.attemptId, 'attemptId')
    if (!expected.has(item.caseKey) || !['BASELINE', 'CANDIDATE'].includes(item.arm) || item.version !== (item.arm === 'BASELINE' ? policy.baselineVersion : policy.candidateVersion)) throw new Error('Settlement case or version mismatch')
    if (![item.inputHash, item.outputHash].every(hash => /^sha256:[a-f0-9]{64}$/.test(hash))) throw new Error('Settlement artifact digest missing')
    if (typeof item.synthetic !== 'boolean') throw new Error('Missing settlement provenance')
    if (item.synthetic) {
      if (item.settlementId !== null || item.costEventId !== null || item.actualCost !== 0) throw new Error('Synthetic settlement cannot contain live accounting')
    } else {
      required(item.settlementId!, 'settlementId'); required(item.costEventId!, 'costEventId')
    }
    if (attempts.has(item.attemptId) || (item.settlementId !== null && settlementIds.has(item.settlementId)) || (item.costEventId !== null && costEvents.has(item.costEventId))) throw new Error('Duplicate canonical accounting evidence')
    if (item.status !== 'COMPLETED') throw new Error('Failed or incomplete experiment is inconclusive')
    finite(item.actualCost, 'actual cost'); finite(item.actualTokens, 'actual tokens', true); finite(item.latencyMs, 'latency', true)
    finite(item.authorityViolations, 'authority violations', true); finite(item.safetyFailures, 'safety failures', true)
    const started = time(item.startedAt, 'startedAt')
    const settled = time(item.settledAt, 'settledAt')
    if (started < lockedAt || settled < started || settled > now) throw new Error('Settlement outside observation window')
    earliestStart = Math.min(earliestStart, started)
    latestSettlement = Math.max(latestSettlement, settled)
    lastObservation = Math.max(lastObservation, settled)
    attempts.set(item.attemptId, item)
    if (item.settlementId !== null) settlementIds.add(item.settlementId)
    if (item.costEventId !== null) costEvents.add(item.costEventId)
    totalCost += item.actualCost; totalTokens += item.actualTokens
    maxLatencyMs = Math.max(maxLatencyMs, item.latencyMs)
    authorityViolations += item.authorityViolations; safetyFailures += item.safetyFailures
  }
  const pairs = new Map<string, Partial<Record<'BASELINE' | 'CANDIDATE', CanonicalLearningArmScore>>>()
  const evidenceIds = new Set<string>(), scoredAttempts = new Set<string>()
  let synthetic: boolean | undefined
  for (const item of input.arms) {
    bind(item)
    if (!expected.has(item.caseKey) || !['BASELINE', 'CANDIDATE'].includes(item.arm)) throw new Error('Unexpected case or arm')
    if (item.version !== (item.arm === 'BASELINE' ? policy.baselineVersion : policy.candidateVersion) || item.manifestHash !== policy.manifestHash) throw new Error('Version or manifest mismatch')
    if (item.evaluatorActorId !== policy.evaluatorActorId || item.evaluatorActorId === policy.proposerActorId || item.rubricRef !== policy.rubricRef || item.calibrationRef !== policy.calibrationRef) throw new Error('Evaluator or rubric binding mismatch')
    required(item.evidenceId, 'evidenceId')
    if (!/^sha256:[a-f0-9]{64}$/.test(item.evidenceHash)) throw new Error('Missing canonical evidence digest')
    if (evidenceIds.has(item.evidenceId) || scoredAttempts.has(item.attemptId)) throw new Error('Reused evidence or attempt')
    const settlement = attempts.get(item.attemptId)
    if (!settlement || settlement.status !== 'COMPLETED') throw new Error('Score lacks completed canonical settlement')
    if ((['caseKey', 'arm', 'version', 'inputHash', 'outputHash', 'synthetic'] as const).some(key => settlement[key] !== item[key])) throw new Error('Score and canonical settlement linkage mismatch')
    if (![item.inputHash, item.outputHash].every(hash => /^sha256:[a-f0-9]{64}$/.test(hash))) throw new Error('Score artifact digest missing')
    finite(item.score, 'score'); if (item.score > 1) throw new Error('Score exceeds bound')
    finite(item.authorityViolations, 'authority violations', true); finite(item.safetyFailures, 'safety failures', true)
    const observed = time(item.observedAt, 'observedAt')
    if (observed < time(settlement.settledAt, 'settledAt') || observed > now) throw new Error('Score outside settled observation window')
    lastObservation = Math.max(lastObservation, observed)
    if (typeof item.synthetic !== 'boolean' || (synthetic !== undefined && synthetic !== item.synthetic)) throw new Error('Mixed synthetic and prospective evidence')
    synthetic = item.synthetic
    const pair = pairs.get(item.caseKey) ?? {}
    if (pair[item.arm]) throw new Error('Duplicate case arm')
    pair[item.arm] = item; pairs.set(item.caseKey, pair)
    evidenceIds.add(item.evidenceId); scoredAttempts.add(item.attemptId)
    authorityViolations += item.authorityViolations; safetyFailures += item.safetyFailures
  }
  if (attempts.size !== scoredAttempts.size) throw new Error('Unscored attempt makes experiment inconclusive')
  if (pairs.size !== expected.size || input.arms.length !== expected.size * 2) throw new Error('Incomplete paired evidence')
  let baselineTotal = 0, candidateTotal = 0
  const independentInputHashes = new Set<string>()
  for (const pair of pairs.values()) {
    if (!pair.BASELINE || !pair.CANDIDATE) throw new Error('Missing paired arm')
    if (pair.BASELINE.inputHash !== pair.CANDIDATE.inputHash) throw new Error('Paired arms used different replay inputs')
    if (independentInputHashes.has(pair.BASELINE.inputHash)) throw new Error('Independent cases reused the same replay input')
    independentInputHashes.add(pair.BASELINE.inputHash)
    baselineTotal += pair.BASELINE.score; candidateTotal += pair.CANDIDATE.score
  }
  if (synthetic === true && totalCost !== 0) throw new Error('Synthetic evidence cannot include paid accounting')
  // The locked latency budget covers the complete paired experiment, including
  // scheduling gaps between arms, rather than only its slowest invocation.
  maxLatencyMs = Math.max(maxLatencyMs, latestSettlement - earliestStart)
  finite(maxLatencyMs, 'experiment latency', true)
  finite(totalCost, 'total cost'); finite(totalTokens, 'total tokens', true)
  finite(authorityViolations, 'authority violations', true); finite(safetyFailures, 'safety failures', true)
  const receipt = input.independentVerification
  const independentlyVerified = synthetic === false && !!receipt
    && receipt.experimentId === input.experimentId && receipt.projectId === policy.projectId
    && receipt.policyRecordId === input.policyRecordId && receipt.evaluatorActorId === policy.evaluatorActorId
    && receipt.rubricRef === policy.rubricRef && receipt.calibrationRef === policy.calibrationRef
    && receipt.evidenceHashesVerified === true && receipt.evaluatorAuthorized === true && receipt.allAttemptsLoaded === true
  const sampleCount = pairs.size
  const baselineScore = baselineTotal / sampleCount, candidateScore = candidateTotal / sampleCount
  // Each paired difference is in [-1, 1], giving range 2 in Hoeffding's bound.
  const gainLowerConfidenceBound = Math.max(-1, candidateScore - baselineScore - Math.sqrt(2 * Math.log(1 / (1 - plan.confidence)) / sampleCount))
  const result: LearningEvaluationResult = {
    policyId: policy.policyId, projectId: policy.projectId, candidateId: policy.candidateId,
    baselineVersion: policy.baselineVersion, candidateVersion: policy.candidateVersion, mode: policy.mode,
    datasetManifestId: policy.datasetManifestId, manifestHash: policy.manifestHash, evaluatorActorId: policy.evaluatorActorId,
    observedAt: new Date(lastObservation).toISOString(), sampleCount, baselineScore, candidateScore, gainLowerConfidenceBound,
    independentlyVerified, evidenceComplete: independentlyVerified,
    // Elapsed time is not a repeated confirmation evaluation. This module cannot attest stability.
    confirmationWindowPassed: false,
    authorityViolations, safetyFailures, accountingComplete: true,
    totalCost, maxRunCost: totalCost, totalTokens, maxRunTokens: totalTokens, maxLatencyMs,
  }
  return { result, synthetic: synthetic === true, prospectiveWriteAllowed: false as const, analysisMethod: plan.method, confidence: plan.confidence, evidenceIds: [...evidenceIds].sort(), settlementIds: [...settlementIds].sort() }
}
