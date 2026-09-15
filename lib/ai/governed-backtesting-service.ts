import { createGovernanceEvaluationDatasetBuilder } from './governance-evaluation-dataset'
import { buildGovernedBacktestReadiness } from './governed-backtesting'

function positiveInteger(value: number | undefined, fallback: number, label: string, maximum: number) {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}`)
  }
  return resolved
}

export async function runGovernedBacktestReadiness(input: {
  projectId: string
  trainingCutoffAt: string
  evaluationEndAt: string
  minimumTrainingCases?: number
  minimumEvaluationCases?: number
  datasetLimit?: number
}) {
  const projectId = input.projectId.trim()
  if (!projectId) throw new Error('projectId is required')

  const minimumTrainingCases = positiveInteger(input.minimumTrainingCases, 20, 'minimumTrainingCases', 500)
  const minimumEvaluationCases = positiveInteger(input.minimumEvaluationCases, 10, 'minimumEvaluationCases', 500)
  const datasetLimit = positiveInteger(input.datasetLimit, 500, 'datasetLimit', 500)

  const dataset = await createGovernanceEvaluationDatasetBuilder().build({
    projectId,
    limit: datasetLimit,
  })

  return buildGovernedBacktestReadiness({
    projectId,
    dataset,
    trainingCutoffAt: input.trainingCutoffAt,
    evaluationEndAt: input.evaluationEndAt,
    minimumTrainingCases,
    minimumEvaluationCases,
  })
}
