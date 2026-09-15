import type { VerifiedEvaluationDataset } from './evaluation-dataset'
import type { GovernedBacktestReadiness } from './governed-backtesting'

export const GOVERNED_SHADOW_EVALUATION_VERSION = 'governed-shadow-evaluation-v1' as const

export type ShadowPrediction = {
  caseId: string
  predictedEffectiveProbability: number
}

export type GovernedShadowEvaluationRequest = {
  projectId: string
  dataset: VerifiedEvaluationDataset
  readiness: GovernedBacktestReadiness
  candidateModelVersionId: string
  predictions: ShadowPrediction[]
}

export type GovernedShadowEvaluationResult = {
  version: typeof GOVERNED_SHADOW_EVALUATION_VERSION
  projectId: string
  candidateModelVersionId: string
  status: 'EVALUATED'
  sampleSize: number
  effectiveCount: number
  ineffectiveCount: number
  brierScore: number
  accuracy: number
  confusionMatrix: {
    truePositive: number
    falsePositive: number
    trueNegative: number
    falseNegative: number
  }
  evidenceRefs: string[]
  predictiveProbabilityExposed: false
  rowLevelPredictionsExposed: false
  shadowDecisionAuthority: false
  executionAuthority: false
  promotionAuthority: false
  historicalOutcomeOnly: true
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function probability(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('predictedEffectiveProbability must be between 0 and 1')
  }
  return value
}

function timestamp(value: string, label: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`)
  return parsed
}

function round(value: number) {
  return Number(value.toFixed(12))
}

export function evaluateGovernedShadowPredictions(input: GovernedShadowEvaluationRequest): GovernedShadowEvaluationResult {
  const projectId = requiredText(input.projectId, 'projectId')
  const candidateModelVersionId = requiredText(input.candidateModelVersionId, 'candidateModelVersionId')

  if (input.dataset.projectId !== projectId) throw new Error('dataset projectId must match projectId')
  if (input.dataset.datasetKind !== 'verified_production_cases') {
    throw new Error('Only verified production cases are eligible for governed shadow evaluation')
  }
  if (input.readiness.projectId !== projectId) throw new Error('readiness projectId must match projectId')
  if (input.readiness.status !== 'READY') throw new Error('Governed backtesting readiness must be READY before shadow evaluation')
  if (input.readiness.predictiveProbabilityExposed !== false || input.readiness.shadowDecisionAuthority !== false) {
    throw new Error('Shadow evaluation requires non-authoritative governed backtesting readiness')
  }

  const trainingCutoff = timestamp(input.readiness.trainingCutoffAt, 'trainingCutoffAt')
  const evaluationEnd = timestamp(input.readiness.evaluationEndAt, 'evaluationEndAt')
  const expectedCaseIds = new Set(input.readiness.evaluation.caseIds)
  if (expectedCaseIds.size !== input.readiness.evaluation.caseIds.length) {
    throw new Error('readiness evaluation caseIds must be unique')
  }
  if (expectedCaseIds.size === 0) throw new Error('readiness evaluation partition must not be empty')

  const datasetById = new Map(input.dataset.cases.map((item) => [item.caseId, item]))
  const evaluationCases = input.readiness.evaluation.caseIds.map((caseId) => {
    const item = datasetById.get(caseId)
    if (!item) throw new Error(`readiness evaluation case is missing from dataset: ${caseId}`)
    if (item.projectId !== projectId) throw new Error(`evaluation case project mismatch: ${caseId}`)
    const verifiedAt = timestamp(item.verifiedOutcome.verifiedAt, 'verifiedOutcome.verifiedAt')
    if (!(verifiedAt > trainingCutoff && verifiedAt <= evaluationEnd)) {
      throw new Error(`evaluation case is outside governed holdout window: ${caseId}`)
    }
    return item
  })

  const predictionByCaseId = new Map<string, number>()
  for (const prediction of input.predictions) {
    const caseId = requiredText(prediction.caseId, 'prediction.caseId')
    if (!expectedCaseIds.has(caseId)) throw new Error(`prediction case is outside governed evaluation partition: ${caseId}`)
    if (predictionByCaseId.has(caseId)) throw new Error(`duplicate shadow prediction for case: ${caseId}`)
    predictionByCaseId.set(caseId, probability(prediction.predictedEffectiveProbability))
  }

  if (predictionByCaseId.size !== expectedCaseIds.size) {
    throw new Error('Shadow predictions must cover every governed evaluation case exactly once')
  }

  let squaredError = 0
  let correct = 0
  let truePositive = 0
  let falsePositive = 0
  let trueNegative = 0
  let falseNegative = 0

  for (const item of evaluationCases) {
    const predictedProbability = predictionByCaseId.get(item.caseId)
    if (predictedProbability == null) throw new Error(`missing shadow prediction for case: ${item.caseId}`)
    const observed = item.verifiedOutcome.effective ? 1 : 0
    squaredError += (predictedProbability - observed) ** 2

    const predictedEffective = predictedProbability >= 0.5
    if (predictedEffective === item.verifiedOutcome.effective) correct += 1
    if (predictedEffective && item.verifiedOutcome.effective) truePositive += 1
    else if (predictedEffective && !item.verifiedOutcome.effective) falsePositive += 1
    else if (!predictedEffective && !item.verifiedOutcome.effective) trueNegative += 1
    else falseNegative += 1
  }

  return {
    version: GOVERNED_SHADOW_EVALUATION_VERSION,
    projectId,
    candidateModelVersionId,
    status: 'EVALUATED',
    sampleSize: evaluationCases.length,
    effectiveCount: evaluationCases.filter((item) => item.verifiedOutcome.effective).length,
    ineffectiveCount: evaluationCases.filter((item) => !item.verifiedOutcome.effective).length,
    brierScore: round(squaredError / evaluationCases.length),
    accuracy: round(correct / evaluationCases.length),
    confusionMatrix: {
      truePositive,
      falsePositive,
      trueNegative,
      falseNegative,
    },
    evidenceRefs: [...new Set(evaluationCases.flatMap((item) => item.evidenceRefs))].sort(),
    predictiveProbabilityExposed: false,
    rowLevelPredictionsExposed: false,
    shadowDecisionAuthority: false,
    executionAuthority: false,
    promotionAuthority: false,
    historicalOutcomeOnly: true,
  }
}
