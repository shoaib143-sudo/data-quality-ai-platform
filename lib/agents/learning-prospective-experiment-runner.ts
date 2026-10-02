import { createHash } from 'node:crypto'

export type LearningProspectiveEvidenceClass = 'SYNTHETIC_REHEARSAL' | 'LIVE_PROSPECTIVE'
export type LearningProspectiveArm = 'BASELINE' | 'CANDIDATE'

export type LearningProspectiveCase = {
  caseKey: string
  sourceCaseRef: string
}

export type LearningProspectivePlan = {
  projectId: string
  policyRecordId: string
  candidateId: string
  datasetManifestId: string
  policyKey: string
  agentKey: string
  skillKey: string
  mode: 'GUIDED' | 'GOVERNED_AUTO' | 'FULL_AUTONOMOUS'
  baselineVersion: string
  candidateVersion: string
  evaluatorActorId: string
  sampleSize: number
  heldOutCases: readonly LearningProspectiveCase[]
}

export type LearningProspectiveAttempt = {
  attemptId: string
  executionRunId: string
  status: 'CLAIMED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  evidenceRef: string | null
  existing: boolean
}

export type LearningProspectiveCaseEvaluation = {
  evaluationId: string
  caseKey: string
  baselineEvidenceRef: string
  candidateEvidenceRef: string
  baselineScore: number
  candidateScore: number
  authorityViolation: boolean
  adversarialFailure: boolean
  observedAt: string
}

export interface LearningProspectivePlanProvider {
  load(input: { projectId: string; policyRecordId: string; candidateId: string }): Promise<LearningProspectivePlan>
}

export interface LearningProspectiveRunStore {
  begin(input: {
    projectId: string
    policyRecordId: string
    candidateId: string
    runKey: string
    evidenceClass: LearningProspectiveEvidenceClass
  }): Promise<{ runId: string; expectedCaseCount: number; existing: boolean }>
  claimAttempt(input: {
    projectId: string
    runId: string
    caseKey: string
    arm: LearningProspectiveArm
    version: string
    attemptKey: string
  }): Promise<LearningProspectiveAttempt>
  completeAttempt(input: {
    projectId: string
    attemptId: string
    status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
    evidenceRef: string | null
    errorCode: string | null
  }): Promise<void>
  loadCaseEvaluation(input: {
    projectId: string
    runId: string
    caseKey: string
  }): Promise<LearningProspectiveCaseEvaluation | null>
  recordCaseEvaluation(input: {
    projectId: string
    runId: string
    caseKey: string
    evaluatorActorId: string
    baselineEvidenceRef: string
    candidateEvidenceRef: string
    baselineScore: number
    candidateScore: number
    authorityViolation: boolean
    adversarialFailure: boolean
    observedAt: string
  }): Promise<LearningProspectiveCaseEvaluation>
  completeRun(input: { projectId: string; runId: string }): Promise<void>
}

export interface LearningProspectiveArmExecutor {
  execute(input: {
    projectId: string
    policyRecordId: string
    candidateId: string
    experimentRunId: string
    executionRunId: string
    attemptKey: string
    caseKey: string
    sourceCaseRef: string
    arm: LearningProspectiveArm
    version: string
    agentKey: string
    skillKey: string
    mode: LearningProspectivePlan['mode']
    evidenceClass: LearningProspectiveEvidenceClass
  }): Promise<{ evidenceRef: string }>
}

export interface LearningProspectiveIndependentEvaluator {
  evaluate(input: {
    projectId: string
    policyRecordId: string
    candidateId: string
    caseKey: string
    sourceCaseRef: string
    evaluatorActorId: string
    baselineEvidenceRef: string
    candidateEvidenceRef: string
    baselineVersion: string
    candidateVersion: string
    evidenceClass: LearningProspectiveEvidenceClass
  }): Promise<{
    baselineScore: number
    candidateScore: number
    authorityViolation: boolean
    adversarialFailure: boolean
    observedAt: string
  }>
}

export type LearningProspectiveRunSummary = {
  runId: string
  evidenceClass: LearningProspectiveEvidenceClass
  caseCount: number
  baselineScore: number
  candidateScore: number
  authorityViolations: number
  adversarialFailures: number
  caseEvaluations: LearningProspectiveCaseEvaluation[]
}

function normalizedText(value: string, label: string) {
  const result = value.trim()
  if (!result) throw new Error(`${label} is required`)
  return result
}

function boundedScore(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`)
  return value
}

function attemptKey(input: {
  policyRecordId: string
  caseKey: string
  arm: LearningProspectiveArm
  version: string
}) {
  return `sha256:${createHash('sha256')
    .update([input.policyRecordId, input.caseKey, input.arm, input.version].join(':'))
    .digest('hex')}`
}

async function resolveArm(input: {
  plan: LearningProspectivePlan
  store: LearningProspectiveRunStore
  executor: LearningProspectiveArmExecutor
  runId: string
  evidenceClass: LearningProspectiveEvidenceClass
  item: LearningProspectiveCase
  arm: LearningProspectiveArm
}) {
  const version = input.arm === 'BASELINE' ? input.plan.baselineVersion : input.plan.candidateVersion
  const key = attemptKey({
    policyRecordId: input.plan.policyRecordId,
    caseKey: input.item.caseKey,
    arm: input.arm,
    version,
  })
  const attempt = await input.store.claimAttempt({
    projectId: input.plan.projectId,
    runId: input.runId,
    caseKey: input.item.caseKey,
    arm: input.arm,
    version,
    attemptKey: key,
  })
  if (attempt.status === 'SUCCEEDED' && attempt.evidenceRef) return attempt.evidenceRef
  if (attempt.existing) {
    const error = new Error(`Existing ${input.arm} attempt requires reconciliation before re-dispatch`)
    error.name = 'LearningProspectiveRecoveryRequiredError'
    throw error
  }
  if (attempt.status !== 'CLAIMED') throw new Error('New learning experiment attempt was not claimed')

  try {
    const result = await input.executor.execute({
      projectId: input.plan.projectId,
      policyRecordId: input.plan.policyRecordId,
      candidateId: input.plan.candidateId,
      experimentRunId: input.runId,
      executionRunId: attempt.executionRunId,
      attemptKey: key,
      caseKey: input.item.caseKey,
      sourceCaseRef: input.item.sourceCaseRef,
      arm: input.arm,
      version,
      agentKey: input.plan.agentKey,
      skillKey: input.plan.skillKey,
      mode: input.plan.mode,
      evidenceClass: input.evidenceClass,
    })
    const evidenceRef = normalizedText(result.evidenceRef, 'evidenceRef')
    await input.store.completeAttempt({
      projectId: input.plan.projectId,
      attemptId: attempt.attemptId,
      status: 'SUCCEEDED',
      evidenceRef,
      errorCode: null,
    })
    return evidenceRef
  } catch (error) {
    await input.store.completeAttempt({
      projectId: input.plan.projectId,
      attemptId: attempt.attemptId,
      status: error instanceof DOMException && error.name === 'AbortError' ? 'CANCELLED' : 'FAILED',
      evidenceRef: null,
      errorCode: error instanceof Error ? error.name || 'EXECUTION_FAILED' : 'EXECUTION_FAILED',
    })
    throw error
  }
}

/**
 * Orchestrates a complete, paired, prospective learning experiment.
 *
 * The runner never selects a post-lock subset: v1 requires the locked sampleSize
 * to equal the complete HELD_OUT partition. It never promotes a candidate and it
 * never turns SYNTHETIC_REHEARSAL evidence into live outcome evidence.
 */
export async function runLearningProspectiveExperiment(input: {
  projectId: string
  policyRecordId: string
  candidateId: string
  runKey: string
  evidenceClass: LearningProspectiveEvidenceClass
  planProvider: LearningProspectivePlanProvider
  store: LearningProspectiveRunStore
  executor: LearningProspectiveArmExecutor
  evaluator: LearningProspectiveIndependentEvaluator
}): Promise<LearningProspectiveRunSummary> {
  const projectId = normalizedText(input.projectId, 'projectId')
  const policyRecordId = normalizedText(input.policyRecordId, 'policyRecordId')
  const candidateId = normalizedText(input.candidateId, 'candidateId')
  const runKey = normalizedText(input.runKey, 'runKey')
  const plan = await input.planProvider.load({ projectId, policyRecordId, candidateId })

  if (plan.projectId !== projectId || plan.policyRecordId !== policyRecordId || plan.candidateId !== candidateId) {
    throw new Error('Prospective experiment plan identity mismatch')
  }
  if (plan.sampleSize !== plan.heldOutCases.length || plan.sampleSize <= 0) {
    throw new Error('Prospective runner requires the complete locked held-out partition')
  }
  const keys = new Set<string>()
  for (const item of plan.heldOutCases) {
    if (!/^[a-f0-9]{64}$/.test(item.caseKey) || keys.has(item.caseKey)) throw new Error('Held-out case keys must be unique SHA-256 digests')
    keys.add(item.caseKey)
    normalizedText(item.sourceCaseRef, 'sourceCaseRef')
  }

  const run = await input.store.begin({
    projectId,
    policyRecordId,
    candidateId,
    runKey,
    evidenceClass: input.evidenceClass,
  })
  if (run.expectedCaseCount !== plan.sampleSize) throw new Error('Persisted experiment case count does not match locked plan')

  const evaluations: LearningProspectiveCaseEvaluation[] = []
  for (const item of plan.heldOutCases) {
    const existing = await input.store.loadCaseEvaluation({ projectId, runId: run.runId, caseKey: item.caseKey })
    if (existing) {
      evaluations.push(existing)
      continue
    }

    const baselineEvidenceRef = await resolveArm({
      plan, store: input.store, executor: input.executor, runId: run.runId,
      evidenceClass: input.evidenceClass, item, arm: 'BASELINE',
    })
    const candidateEvidenceRef = await resolveArm({
      plan, store: input.store, executor: input.executor, runId: run.runId,
      evidenceClass: input.evidenceClass, item, arm: 'CANDIDATE',
    })
    if (baselineEvidenceRef === candidateEvidenceRef) throw new Error('Baseline and candidate evidence must be independently addressable')

    const scored = await input.evaluator.evaluate({
      projectId,
      policyRecordId,
      candidateId,
      caseKey: item.caseKey,
      sourceCaseRef: item.sourceCaseRef,
      evaluatorActorId: plan.evaluatorActorId,
      baselineEvidenceRef,
      candidateEvidenceRef,
      baselineVersion: plan.baselineVersion,
      candidateVersion: plan.candidateVersion,
      evidenceClass: input.evidenceClass,
    })
    boundedScore(scored.baselineScore, 'baselineScore')
    boundedScore(scored.candidateScore, 'candidateScore')
    if (!Number.isFinite(Date.parse(scored.observedAt))) throw new Error('Evaluator observedAt is invalid')

    evaluations.push(await input.store.recordCaseEvaluation({
      projectId,
      runId: run.runId,
      caseKey: item.caseKey,
      evaluatorActorId: plan.evaluatorActorId,
      baselineEvidenceRef,
      candidateEvidenceRef,
      baselineScore: scored.baselineScore,
      candidateScore: scored.candidateScore,
      authorityViolation: scored.authorityViolation,
      adversarialFailure: scored.adversarialFailure,
      observedAt: scored.observedAt,
    }))
  }

  if (evaluations.length !== plan.sampleSize) throw new Error('Prospective experiment evaluation set is incomplete')
  await input.store.completeRun({ projectId, runId: run.runId })

  const baselineScore = evaluations.reduce((sum, item) => sum + item.baselineScore, 0) / evaluations.length
  const candidateScore = evaluations.reduce((sum, item) => sum + item.candidateScore, 0) / evaluations.length
  return {
    runId: run.runId,
    evidenceClass: input.evidenceClass,
    caseCount: evaluations.length,
    baselineScore,
    candidateScore,
    authorityViolations: evaluations.filter((item) => item.authorityViolation).length,
    adversarialFailures: evaluations.filter((item) => item.adversarialFailure).length,
    caseEvaluations: evaluations,
  }
}
