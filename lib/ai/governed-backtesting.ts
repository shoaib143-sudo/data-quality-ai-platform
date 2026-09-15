import type { VerifiedEvaluationCase, VerifiedEvaluationDataset } from './evaluation-dataset'

export const GOVERNED_BACKTEST_VERSION = 'governed-backtest-v1' as const

export type BacktestReadinessReason =
  | 'READY'
  | 'INSUFFICIENT_TRAINING_CASES'
  | 'INSUFFICIENT_EVALUATION_CASES'
  | 'TRAINING_CLASS_COLLAPSE'
  | 'EVALUATION_CLASS_COLLAPSE'

export type GovernedBacktestRequest = {
  projectId: string
  dataset: VerifiedEvaluationDataset
  trainingCutoffAt: string
  evaluationEndAt: string
  minimumTrainingCases: number
  minimumEvaluationCases: number
}

export type GovernedBacktestPartition = {
  caseIds: string[]
  sampleSize: number
  effectiveCount: number
  ineffectiveCount: number
  earliestVerifiedAt: string | null
  latestVerifiedAt: string | null
}

export type GovernedBacktestReadiness = {
  version: typeof GOVERNED_BACKTEST_VERSION
  projectId: string
  status: 'READY' | 'NOT_READY'
  reasons: BacktestReadinessReason[]
  trainingCutoffAt: string
  evaluationEndAt: string
  training: GovernedBacktestPartition
  evaluation: GovernedBacktestPartition
  evidenceRefs: string[]
  predictiveProbabilityExposed: false
  shadowDecisionAuthority: false
  historicalOutcomeOnly: true
}

function timestamp(value: string, label: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`)
  return parsed
}

function positiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

function partition(cases: VerifiedEvaluationCase[]): GovernedBacktestPartition {
  const ordered = [...cases].sort((a, b) => a.verifiedOutcome.verifiedAt.localeCompare(b.verifiedOutcome.verifiedAt))
  return {
    caseIds: ordered.map((item) => item.caseId),
    sampleSize: ordered.length,
    effectiveCount: ordered.filter((item) => item.verifiedOutcome.effective).length,
    ineffectiveCount: ordered.filter((item) => !item.verifiedOutcome.effective).length,
    earliestVerifiedAt: ordered[0]?.verifiedOutcome.verifiedAt ?? null,
    latestVerifiedAt: ordered.at(-1)?.verifiedOutcome.verifiedAt ?? null,
  }
}

export function buildGovernedBacktestReadiness(input: GovernedBacktestRequest): GovernedBacktestReadiness {
  const projectId = input.projectId.trim()
  if (!projectId) throw new Error('projectId is required')
  if (input.dataset.projectId !== projectId) throw new Error('dataset projectId must match projectId')
  if (input.dataset.datasetKind !== 'verified_production_cases') throw new Error('Only verified production cases are eligible for governed backtesting')

  const trainingCutoff = timestamp(input.trainingCutoffAt, 'trainingCutoffAt')
  const evaluationEnd = timestamp(input.evaluationEndAt, 'evaluationEndAt')
  if (trainingCutoff >= evaluationEnd) throw new Error('trainingCutoffAt must be before evaluationEndAt')

  const minimumTrainingCases = positiveInteger(input.minimumTrainingCases, 'minimumTrainingCases')
  const minimumEvaluationCases = positiveInteger(input.minimumEvaluationCases, 'minimumEvaluationCases')

  const seenCaseIds = new Set<string>()
  const eligible = input.dataset.cases.filter((item) => {
    if (item.projectId !== projectId) return false
    if (seenCaseIds.has(item.caseId)) return false
    seenCaseIds.add(item.caseId)
    return true
  })

  const trainingCases = eligible.filter((item) => timestamp(item.verifiedOutcome.verifiedAt, 'verifiedOutcome.verifiedAt') <= trainingCutoff)
  const evaluationCases = eligible.filter((item) => {
    const verifiedAt = timestamp(item.verifiedOutcome.verifiedAt, 'verifiedOutcome.verifiedAt')
    return verifiedAt > trainingCutoff && verifiedAt <= evaluationEnd
  })

  const training = partition(trainingCases)
  const evaluation = partition(evaluationCases)
  const reasons: BacktestReadinessReason[] = []

  if (training.sampleSize < minimumTrainingCases) reasons.push('INSUFFICIENT_TRAINING_CASES')
  if (evaluation.sampleSize < minimumEvaluationCases) reasons.push('INSUFFICIENT_EVALUATION_CASES')
  if (training.sampleSize > 0 && (training.effectiveCount === 0 || training.ineffectiveCount === 0)) reasons.push('TRAINING_CLASS_COLLAPSE')
  if (evaluation.sampleSize > 0 && (evaluation.effectiveCount === 0 || evaluation.ineffectiveCount === 0)) reasons.push('EVALUATION_CLASS_COLLAPSE')

  const status = reasons.length === 0 ? 'READY' : 'NOT_READY'
  const evidenceRefs = [...new Set(
    eligible
      .filter((item) => {
        const verifiedAt = timestamp(item.verifiedOutcome.verifiedAt, 'verifiedOutcome.verifiedAt')
        return verifiedAt <= evaluationEnd
      })
      .flatMap((item) => item.evidenceRefs),
  )].sort()

  return {
    version: GOVERNED_BACKTEST_VERSION,
    projectId,
    status,
    reasons: status === 'READY' ? ['READY'] : reasons,
    trainingCutoffAt: new Date(trainingCutoff).toISOString(),
    evaluationEndAt: new Date(evaluationEnd).toISOString(),
    training,
    evaluation,
    evidenceRefs,
    predictiveProbabilityExposed: false,
    shadowDecisionAuthority: false,
    historicalOutcomeOnly: true,
  }
}
