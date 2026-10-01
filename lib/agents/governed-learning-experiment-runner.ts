export type LearningExperimentEvidenceClass = 'SYNTHETIC' | 'PROSPECTIVE_LIVE'
export type LearningExperimentArm = 'BASELINE' | 'CANDIDATE'
export type LearningExperimentTerminalStatus = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'POLICY_BLOCKED' | 'UNKNOWN'

export type LearningExperimentCaseInput = {
  caseKey: string
  sourceCaseRef: string
  inputArtifactRef: string
  inputArtifactHash: string
  payload: unknown
  baselineExecutableArtifactRef: string
  baselineExecutableArtifactHash: string
  candidateExecutableArtifactRef: string
  candidateExecutableArtifactHash: string
}

export type PreparedLearningExperimentAttempt = {
  attemptId: string
  executionCorrelationId: string
  attemptNumber: number
  reused: boolean
}

export type LearningExperimentArmExecution = {
  terminalStatus: LearningExperimentTerminalStatus
  outputArtifactRef?: string | null
  outputArtifactHash?: string | null
  observedLatencyMs?: number | null
  failureCode?: string | null
}

export type LearningExperimentPairScore = {
  baselineScore: number
  candidateScore: number
  independentlyVerified: boolean
  authorityViolation: boolean
  safetyFailure: boolean
  evaluatorType: 'DETERMINISTIC' | 'LABELED_DATASET' | 'ADVERSARIAL_SUITE' | 'HUMAN_EVALUATION'
  rubricRef: string
  calibrationRef: string
  observedAt: string
}

export type LearningExperimentSummary = {
  runId: string
  evidenceClass: LearningExperimentEvidenceClass
  caseCount: number
  scoredCaseCount: number
  complete: boolean
  baselineScore: number | null
  candidateScore: number | null
  authorityViolations: number
  safetyFailures: number
  accountingComplete: boolean
  totalCost: number
  maxRunCost: number
  totalTokens: number
  maxRunTokens: number
  maxLatencyMs: number
}

export interface LearningExperimentEvidenceStore {
  createRun(input: {
    projectId: string
    policyRecordId: string
    candidateId: string
    evidenceClass: LearningExperimentEvidenceClass
    caseKeys: readonly string[]
  }): Promise<string>
  prepareAttempt(input: {
    projectId: string
    runId: string
    caseKey: string
    arm: LearningExperimentArm
    version: string
    attemptKey: string
    executableArtifactRef: string
    executableArtifactHash: string
    inputArtifactRef: string
    inputArtifactHash: string
  }): Promise<PreparedLearningExperimentAttempt>
  recordArmResult(input: {
    projectId: string
    runId: string
    attemptId: string
    execution: LearningExperimentArmExecution
  }): Promise<string>
  recordCaseScore(input: {
    projectId: string
    runId: string
    caseKey: string
    evaluatorActorId: string
    baselineResultId: string
    candidateResultId: string
    score: LearningExperimentPairScore
  }): Promise<string>
  deriveSummary(input: { projectId: string; runId: string }): Promise<LearningExperimentSummary>
}

export interface LearningExperimentArmExecutor {
  execute(input: {
    projectId: string
    policyRecordId: string
    candidateId: string
    experimentRunId: string
    attemptId: string
    executionCorrelationId: string
    caseKey: string
    sourceCaseRef: string
    arm: LearningExperimentArm
    version: string
    payload: unknown
    signal?: AbortSignal
  }): Promise<LearningExperimentArmExecution>
}

export interface LearningExperimentIndependentScorer {
  score(input: {
    projectId: string
    policyRecordId: string
    candidateId: string
    experimentRunId: string
    caseKey: string
    sourceCaseRef: string
    baselineResultId: string
    candidateResultId: string
  }): Promise<LearningExperimentPairScore>
}

const SHA256 = /^sha256:[a-f0-9]{64}$/
const CASE_KEY = /^[a-f0-9]{64}$/

function required(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function stopStatus(error: unknown): LearningExperimentTerminalStatus {
  if (error instanceof DOMException && error.name === 'AbortError') return 'CANCELLED'
  if (error instanceof Error && /policy|authority|denied|blocked/i.test(error.message)) return 'POLICY_BLOCKED'
  return 'UNKNOWN'
}

export class GovernedPairedLearningExperimentRunner {
  constructor(
    private readonly store: LearningExperimentEvidenceStore,
    private readonly executor: LearningExperimentArmExecutor,
    private readonly scorer: LearningExperimentIndependentScorer,
  ) {}

  async run(input: {
    projectId: string
    policyRecordId: string
    candidateId: string
    evidenceClass: LearningExperimentEvidenceClass
    baselineVersion: string
    candidateVersion: string
    evaluatorActorId: string
    cases: readonly LearningExperimentCaseInput[]
    signal?: AbortSignal
  }): Promise<LearningExperimentSummary> {
    const projectId = required(input.projectId, 'projectId')
    const policyRecordId = required(input.policyRecordId, 'policyRecordId')
    const candidateId = required(input.candidateId, 'candidateId')
    const baselineVersion = required(input.baselineVersion, 'baselineVersion')
    const candidateVersion = required(input.candidateVersion, 'candidateVersion')
    const evaluatorActorId = required(input.evaluatorActorId, 'evaluatorActorId')
    if (baselineVersion === candidateVersion) throw new Error('baseline and candidate versions must differ')
    if (!input.cases.length) throw new Error('held-out experiment cases are required')

    const seen = new Set<string>()
    for (const item of input.cases) {
      if (!CASE_KEY.test(item.caseKey) || seen.has(item.caseKey)) throw new Error('case keys must be unique SHA-256 digests')
      seen.add(item.caseKey)
      required(item.sourceCaseRef, 'sourceCaseRef')
      required(item.inputArtifactRef, 'inputArtifactRef')
      required(item.baselineExecutableArtifactRef, 'baselineExecutableArtifactRef')
      required(item.candidateExecutableArtifactRef, 'candidateExecutableArtifactRef')
      if (!SHA256.test(item.inputArtifactHash)) throw new Error('inputArtifactHash must be sha256')
      if (!SHA256.test(item.baselineExecutableArtifactHash)) throw new Error('baselineExecutableArtifactHash must be sha256')
      if (!SHA256.test(item.candidateExecutableArtifactHash)) throw new Error('candidateExecutableArtifactHash must be sha256')
      if (item.baselineExecutableArtifactHash === item.candidateExecutableArtifactHash) throw new Error('baseline and candidate executable artifacts must differ')
    }

    const runId = await this.store.createRun({
      projectId,
      policyRecordId,
      candidateId,
      evidenceClass: input.evidenceClass,
      caseKeys: input.cases.map((item) => item.caseKey),
    })

    for (const item of input.cases) {
      input.signal?.throwIfAborted()
      const results = new Map<LearningExperimentArm, string>()

      for (const arm of ['BASELINE', 'CANDIDATE'] as const) {
        input.signal?.throwIfAborted()
        const version = arm === 'BASELINE' ? baselineVersion : candidateVersion
        const executableArtifactRef = arm === 'BASELINE' ? item.baselineExecutableArtifactRef : item.candidateExecutableArtifactRef
        const executableArtifactHash = arm === 'BASELINE' ? item.baselineExecutableArtifactHash : item.candidateExecutableArtifactHash
        const attempt = await this.store.prepareAttempt({
          projectId,
          runId,
          caseKey: item.caseKey,
          arm,
          version,
          attemptKey: `${item.caseKey}:${arm}:1`,
          executableArtifactRef,
          executableArtifactHash,
          inputArtifactRef: item.inputArtifactRef,
          inputArtifactHash: item.inputArtifactHash,
        })

        let execution: LearningExperimentArmExecution
        try {
          execution = await this.executor.execute({
            projectId,
            policyRecordId,
            candidateId,
            experimentRunId: runId,
            attemptId: attempt.attemptId,
            executionCorrelationId: attempt.executionCorrelationId,
            caseKey: item.caseKey,
            sourceCaseRef: item.sourceCaseRef,
            arm,
            version,
            payload: item.payload,
            signal: input.signal,
          })
        } catch (error) {
          execution = {
            terminalStatus: stopStatus(error),
            failureCode: error instanceof Error ? error.name : 'UNRESOLVED_EXECUTION_FAILURE',
          }
          await this.store.recordArmResult({ projectId, runId, attemptId: attempt.attemptId, execution })
          return this.store.deriveSummary({ projectId, runId })
        }

        const resultId = await this.store.recordArmResult({
          projectId,
          runId,
          attemptId: attempt.attemptId,
          execution,
        })
        results.set(arm, resultId)
        if (execution.terminalStatus !== 'SUCCEEDED') {
          return this.store.deriveSummary({ projectId, runId })
        }
      }

      const baselineResultId = results.get('BASELINE')
      const candidateResultId = results.get('CANDIDATE')
      if (!baselineResultId || !candidateResultId) throw new Error('paired arm result identity is incomplete')
      const score = await this.scorer.score({
        projectId,
        policyRecordId,
        candidateId,
        experimentRunId: runId,
        caseKey: item.caseKey,
        sourceCaseRef: item.sourceCaseRef,
        baselineResultId,
        candidateResultId,
      })
      await this.store.recordCaseScore({
        projectId,
        runId,
        caseKey: item.caseKey,
        evaluatorActorId,
        baselineResultId,
        candidateResultId,
        score,
      })
    }

    return this.store.deriveSummary({ projectId, runId })
  }
}
