import { createHash } from 'node:crypto'
import { validateLearningEvaluationPolicy, type LearningEvaluationPolicy } from './learning-evaluation-policy'

/** Inputs to this verifier must come from the trusted server-side loaders.
 * This module checks evidence integrity and scope; it does not authorize actors,
 * prove a confidence bound, or enable a learning decision. */
export type SealedLearningCase = {
  caseKey: string
  datasetVersionId: string
  inputHash: string
  baselineArtifactHash: string
  candidateArtifactHash: string
}

export type LearningDispatchEvidence = {
  claimId: string
  projectId: string
  policyRecordId: string
  candidateId: string
  runId: string
  executionManifestHash: string
  caseKey: string
  datasetVersionId: string
  arm: 'baseline' | 'candidate'
  attempt: number
  artifactHash: string
  inputHash: string
  status: 'completed' | 'failed' | 'cancelled' | 'unresolved'
  invocationId: string | null
  outputRef: string | null
  outputHash: string | null
  outputBytes: string | null
  reservationId: string | null
  settlementId: string | null
  costEventId: string | null
  tokens: number | null
  costUsd: string | null
  latencyMs: number | null
}

export type LearningScoreEvidence = {
  scoreId: string
  claimId: string
  projectId: string
  policyRecordId: string
  candidateId: string
  runId: string
  evaluatorActorId: string
  assignmentId: string
  acknowledgementId: string
  rubricRef: string
  calibrationRef: string
  outputHash: string
  score: number
  authorityViolation: boolean
  safetyFailure: boolean
  observedAt: string
}

export type LearningSettlementEvidence = {
  id: string
  reservationId: string
  projectId: string
  policyRecordId: string
  candidateId: string
  runId: string
  invocationId: string
  costEventId: string
  status: 'ACCOUNTED' | 'PENDING' | 'FAILED'
  tokens: number
  costUsd: string
}

export type LearningCostEventEvidence = {
  id: string
  projectId: string
  runId: string
  invocationId: string
  accountingStatus: 'PRICED' | 'UNPRICED' | 'PENDING'
  currency: string
  tokens: number
  costUsd: string
}

export type LearningEvidenceReconciliationInput = {
  policy: LearningEvaluationPolicy
  policyRecordId: string
  runId: string
  executionManifestHash: string
  sealedCases: readonly SealedLearningCase[]
  dispatches: readonly LearningDispatchEvidence[]
  scores: readonly LearningScoreEvidence[]
  settlements: readonly LearningSettlementEvidence[]
  costEvents: readonly LearningCostEventEvidence[]
  finalizedAt: string
}

export type LearningEvidenceReconciliation = {
  policyId: string
  policyRecordId: string
  projectId: string
  candidateId: string
  runId: string
  mode: LearningEvaluationPolicy['mode']
  manifestHash: string
  executionManifestHash: string
  finalizedAt: string
  expectedPairs: number
  scoredPairs: number
  baselineMeanScore: number
  candidateMeanScore: number
  authorityViolations: number
  safetyFailures: number
  totalCostUsd: string
  totalTokens: number
  maxRunCostUsd: string
  maxRunTokens: number
  maxLatencyMs: number
  structurallyComplete: true
  evidenceDigest: string
}

const HASH = /^sha256:[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/

function fail(message: string): never { throw new Error(`LEARNING_EVIDENCE_${message}`) }
function digest(value: string): string { return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}` }
function decimalParts(value: string, label: string): { whole: string; fraction: string } {
  if (!DECIMAL.test(value)) fail(`${label}_INVALID`)
  const [whole, fraction = ''] = value.split('.')
  return { whole, fraction }
}
function decimalScale(values: readonly string[]): number { return Math.max(0, ...values.map(value => value.split('.')[1]?.length ?? 0)) }
function scaledDecimal(value: string, scale: number, label: string): string {
  const { whole, fraction } = decimalParts(value, label)
  return `${whole}${fraction.padEnd(scale, '0')}`.replace(/^0+(?=\d)/, '')
}
function addIntegerStrings(left: string, right: string): string {
  let carry = 0, output = ''
  let i = left.length - 1, j = right.length - 1
  while (i >= 0 || j >= 0 || carry) {
    const sum = (i >= 0 ? Number(left[i--]) : 0) + (j >= 0 ? Number(right[j--]) : 0) + carry
    output = String(sum % 10) + output
    carry = Math.floor(sum / 10)
  }
  return output.replace(/^0+(?=\d)/, '')
}
function sumDecimals(values: readonly string[]): string {
  const scale = decimalScale(values)
  const total = values.reduce((sum, value) => addIntegerStrings(sum, scaledDecimal(value, scale, 'COST')), '0')
  if (scale === 0) return total
  const padded = total.padStart(scale + 1, '0')
  const whole = padded.slice(0, -scale)
  const fraction = padded.slice(-scale).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}
function compareDecimals(left: string, right: string): number {
  const scale = Math.max(decimalScale([left]), decimalScale([right]))
  const a = scaledDecimal(left, scale, 'COST'), b = scaledDecimal(right, scale, 'COST')
  return a.length < b.length ? -1 : a.length > b.length ? 1 : a < b ? -1 : a > b ? 1 : 0
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** Reconciles the complete immutable evidence set loaded by trusted server code.
 * Callers must still separately authorize the evaluator, load all pages, derive
 * the locked statistical plan, observe the confirmation window, and persist this
 * digest and its decision atomically. */
export function reconcileLearningEvidence(input: LearningEvidenceReconciliationInput): LearningEvidenceReconciliation {
  const { policy } = input
  validateLearningEvaluationPolicy(policy)
  if (!UUID.test(input.policyRecordId) || !UUID.test(input.runId)) fail('RUN_SCOPE_INVALID')
  if (!HASH.test(input.executionManifestHash) || input.executionManifestHash !== input.executionManifestHash.toLowerCase()) fail('EXECUTION_MANIFEST_HASH_INVALID')
  const finalizedAt = Date.parse(input.finalizedAt)
  if (!Number.isFinite(finalizedAt) || finalizedAt < Date.parse(policy.lockedAt) || finalizedAt > Date.now()) fail('FINALIZATION_TIME_INVALID')
  if (input.sealedCases.length !== policy.sampleSize) fail('SEALED_CASE_COUNT_MISMATCH')

  const expected = new Map<string, SealedLearningCase>()
  for (const item of input.sealedCases) {
    if (!/^[a-f0-9]{64}$/.test(item.caseKey) || !policy.datasetVersionIds.includes(item.datasetVersionId)
      || !HASH.test(item.inputHash) || !HASH.test(item.baselineArtifactHash) || !HASH.test(item.candidateArtifactHash)
      || item.baselineArtifactHash === item.candidateArtifactHash || expected.has(`${item.caseKey}:${item.datasetVersionId}`)) fail('SEALED_CASE_INVALID')
    expected.set(`${item.caseKey}:${item.datasetVersionId}`, item)
  }

  const pairs = new Map<string, { baseline?: LearningDispatchEvidence; candidate?: LearningDispatchEvidence }>()
  const claimIds = new Set<string>()
  for (const dispatch of input.dispatches) {
    if (!UUID.test(dispatch.claimId) || claimIds.has(dispatch.claimId)) fail('CLAIM_DUPLICATE_OR_INVALID')
    claimIds.add(dispatch.claimId)
    if (dispatch.projectId !== policy.projectId || dispatch.policyRecordId !== input.policyRecordId
      || dispatch.candidateId !== policy.candidateId || dispatch.runId !== input.runId
      || dispatch.executionManifestHash !== input.executionManifestHash) fail('DISPATCH_SCOPE_MISMATCH')
    const sealed = expected.get(`${dispatch.caseKey}:${dispatch.datasetVersionId}`)
    if (!sealed || dispatch.datasetVersionId !== sealed.datasetVersionId || dispatch.inputHash !== sealed.inputHash
      || dispatch.attempt !== 1 || dispatch.status !== 'completed') fail('DISPATCH_NOT_COMPLETE_OR_UNSEALED')
    const expectedArtifact = dispatch.arm === 'baseline' ? sealed.baselineArtifactHash
      : dispatch.arm === 'candidate' ? sealed.candidateArtifactHash : null
    if (!expectedArtifact || dispatch.artifactHash !== expectedArtifact) fail('DISPATCH_ARM_OR_ARTIFACT_MISMATCH')
    if (!dispatch.outputRef?.trim() || !dispatch.outputBytes || !HASH.test(dispatch.outputHash ?? '')
      || digest(dispatch.outputBytes) !== dispatch.outputHash) fail('OUTPUT_BYTES_MISMATCH')
    if (!UUID.test(dispatch.invocationId ?? '') || !UUID.test(dispatch.reservationId ?? '')
      || !UUID.test(dispatch.settlementId ?? '') || !UUID.test(dispatch.costEventId ?? '')
      || !Number.isSafeInteger(dispatch.tokens) || dispatch.tokens! < 0
      || !Number.isSafeInteger(dispatch.latencyMs) || dispatch.latencyMs! < 0) fail('DISPATCH_ACCOUNTING_MISSING')
    decimalParts(dispatch.costUsd ?? '', 'COST')
    const key = `${dispatch.caseKey}:${dispatch.datasetVersionId}`
    const pair = pairs.get(key) ?? {}
    if (pair[dispatch.arm]) fail('DISPATCH_ARM_DUPLICATE')
    pair[dispatch.arm] = dispatch
    pairs.set(key, pair)
  }
  if (pairs.size !== expected.size || [...pairs.values()].some(pair => !pair.baseline || !pair.candidate)) fail('EXPECTED_PAIR_COVERAGE_MISMATCH')

  const scoreIds = new Set<string>(), scoredClaims = new Set<string>()
  const scoresByArm: Record<'baseline' | 'candidate', number[]> = { baseline: [], candidate: [] }
  let authorityViolations = 0, safetyFailures = 0
  for (const score of input.scores) {
    if (!UUID.test(score.scoreId) || scoreIds.has(score.scoreId) || scoredClaims.has(score.claimId)) fail('SCORE_DUPLICATE_OR_INVALID')
    scoreIds.add(score.scoreId); scoredClaims.add(score.claimId)
    const dispatch = input.dispatches.find(item => item.claimId === score.claimId)
    if (!dispatch || score.projectId !== policy.projectId || score.policyRecordId !== input.policyRecordId
      || score.candidateId !== policy.candidateId || score.runId !== input.runId
      || score.evaluatorActorId !== policy.evaluatorActorId || score.evaluatorActorId === policy.proposerActorId
      || !UUID.test(score.assignmentId) || !UUID.test(score.acknowledgementId)
      || score.rubricRef !== policy.rubricRef || score.calibrationRef !== policy.calibrationRef
      || score.outputHash !== dispatch.outputHash || !Number.isFinite(score.score) || score.score < 0 || score.score > 1
      || !Number.isFinite(Date.parse(score.observedAt)) || Date.parse(score.observedAt) < Date.parse(policy.lockedAt)
      || Date.parse(score.observedAt) > finalizedAt) fail('SCORE_SCOPE_OR_AUTHENTICITY_MISMATCH')
    scoresByArm[dispatch.arm].push(score.score)
    if (score.authorityViolation) authorityViolations++
    if (score.safetyFailure) safetyFailures++
  }
  if (scoredClaims.size !== claimIds.size || [...claimIds].some(id => !scoredClaims.has(id))) fail('SCORE_COVERAGE_MISMATCH')

  const settlements = new Map<string, LearningSettlementEvidence>()
  for (const item of input.settlements) {
    if (!UUID.test(item.id) || !UUID.test(item.reservationId) || settlements.has(item.reservationId)) fail('SETTLEMENT_DUPLICATE_OR_INVALID')
    if (item.status !== 'ACCOUNTED' || item.projectId !== policy.projectId || item.policyRecordId !== input.policyRecordId
      || item.candidateId !== policy.candidateId || item.runId !== input.runId
      || !UUID.test(item.invocationId) || !UUID.test(item.costEventId)
      || !Number.isSafeInteger(item.tokens) || item.tokens < 0) fail('SETTLEMENT_INCOMPLETE')
    decimalParts(item.costUsd, 'SETTLEMENT_COST')
    settlements.set(item.reservationId, item)
  }
  const costEvents = new Map<string, LearningCostEventEvidence>()
  for (const item of input.costEvents) {
    if (!UUID.test(item.id) || costEvents.has(item.id)) fail('COST_EVENT_DUPLICATE_OR_INVALID')
    if (item.accountingStatus !== 'PRICED' || item.currency !== 'USD' || item.projectId !== policy.projectId
      || item.runId !== input.runId || !UUID.test(item.invocationId) || !Number.isSafeInteger(item.tokens) || item.tokens < 0) fail('COST_EVENT_UNPRICED_OR_MISMATCHED')
    decimalParts(item.costUsd, 'COST_EVENT_COST')
    costEvents.set(item.id, item)
  }

  for (const dispatch of input.dispatches) {
    const settlement = settlements.get(dispatch.reservationId!)
    const event = costEvents.get(dispatch.costEventId!)
    if (!settlement || !event || settlement.id !== dispatch.settlementId || settlement.costEventId !== event.id
      || settlement.invocationId !== dispatch.invocationId || event.invocationId !== dispatch.invocationId
      || settlement.tokens !== dispatch.tokens || event.tokens !== dispatch.tokens
      || compareDecimals(settlement.costUsd, dispatch.costUsd!) !== 0 || compareDecimals(event.costUsd, dispatch.costUsd!) !== 0) fail('CANONICAL_ACCOUNTING_LINK_MISMATCH')
  }
  if (settlements.size !== claimIds.size || costEvents.size !== claimIds.size) fail('ACCOUNTING_COVERAGE_MISMATCH')

  const allCosts = input.dispatches.map(item => item.costUsd!)
  const totalCostUsd = sumDecimals(allCosts)
  const maxRunCostUsd = allCosts.reduce((max, value) => compareDecimals(value, max) > 0 ? value : max, '0')
  const totalTokens = input.dispatches.reduce((sum, item) => sum + item.tokens!, 0)
  const maxRunTokens = Math.max(...input.dispatches.map(item => item.tokens!))
  const maxLatencyMs = Math.max(...input.dispatches.map(item => item.latencyMs!))
  if (!Number.isSafeInteger(totalTokens) || totalCostUsd === '' || compareDecimals(totalCostUsd, String(policy.budget.totalCost)) > 0
    || compareDecimals(maxRunCostUsd, String(policy.budget.perRunCost)) > 0 || totalTokens > policy.budget.totalTokens
    || maxRunTokens > policy.budget.perRunTokens || maxLatencyMs > policy.budget.latencyMs) fail('BUDGET_EXCEEDED')

  const evidence = {
    policyId: policy.policyId, policyRecordId: input.policyRecordId, projectId: policy.projectId,
    candidateId: policy.candidateId, runId: input.runId, mode: policy.mode, manifestHash: policy.manifestHash,
    executionManifestHash: input.executionManifestHash, finalizedAt: input.finalizedAt,
    sealedCases: [...input.sealedCases].sort((a, b) => a.caseKey.localeCompare(b.caseKey)),
    dispatches: [...input.dispatches].sort((a, b) => a.claimId.localeCompare(b.claimId)),
    scores: [...input.scores].sort((a, b) => a.scoreId.localeCompare(b.scoreId)),
    settlements: [...input.settlements].sort((a, b) => a.id.localeCompare(b.id)),
    costEvents: [...input.costEvents].sort((a, b) => a.id.localeCompare(b.id)),
  }
  const average = (values: number[]) => values.reduce((sum, score) => sum + score, 0) / values.length
  const evidenceDigest = digest(canonical(evidence))
  return {
    policyId: policy.policyId, policyRecordId: input.policyRecordId, projectId: policy.projectId,
    candidateId: policy.candidateId, runId: input.runId, mode: policy.mode, manifestHash: policy.manifestHash,
    executionManifestHash: input.executionManifestHash, finalizedAt: input.finalizedAt,
    expectedPairs: expected.size, scoredPairs: pairs.size,
    baselineMeanScore: average(scoresByArm.baseline), candidateMeanScore: average(scoresByArm.candidate),
    authorityViolations, safetyFailures, totalCostUsd, totalTokens, maxRunCostUsd, maxRunTokens, maxLatencyMs,
    structurallyComplete: true as const, evidenceDigest,
  }
}
