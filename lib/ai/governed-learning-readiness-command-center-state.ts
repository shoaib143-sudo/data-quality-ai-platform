import { evaluateGovernedLearningProductionReadiness } from '@/lib/agents/governed-learning-production-readiness'
import { readGovernedLearningLiveReadinessEvidence } from '@/lib/agents/governed-learning-readiness-live'

export async function readGovernedLearningProductionReadinessState(input: {
  projectId: string
  actorUserId: string
}) {
  const evidence = await readGovernedLearningLiveReadinessEvidence(input)
  return evaluateGovernedLearningProductionReadiness(evidence)
}
