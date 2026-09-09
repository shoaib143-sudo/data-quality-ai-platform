import { createAdminClient } from '@/lib/supabase/admin'
import { createGovernanceEvaluationEngine } from './governance-evaluation-engine'
import { createGovernanceRetrievalProvider } from './governance-retrieval-provider'
import { buildGovernanceRetrievalEvaluationDataset } from './governance-retrieval-evaluation-dataset'
import { recordRetrievalEvaluation } from './retrieval-evaluation'
import { runRetrievalBenchmark, type RetrievalBenchmarkResult } from './retrieval-benchmark-runner'

export async function runGovernanceRetrievalBenchmark(input: {
  projectId: string
  k?: number
}): Promise<RetrievalBenchmarkResult> {
  const projectId = input.projectId.trim()
  if (!projectId) throw new Error('projectId is required')

  const dataset = await buildGovernanceRetrievalEvaluationDataset(projectId)
  if (!dataset.cases.length) {
    throw new Error('No governed retrieval relevance labels are available for this project')
  }

  const supabase = createAdminClient()
  return runRetrievalBenchmark({
    projectId,
    dataset,
    retrieval: createGovernanceRetrievalProvider(supabase),
    evaluationEngine: createGovernanceEvaluationEngine(),
    recordEvaluation: recordRetrievalEvaluation,
    k: input.k,
  })
}
