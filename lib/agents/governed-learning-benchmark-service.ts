import type { SkillBenchmarkEvidence } from './governed-skill-promotion-gate'
import type { LearningRiskClass } from './governed-learning-policy'
import type { PairedLearningCase } from './governed-learning-paired-benchmark'

export async function recordGovernedLearningCandidateBenchmark(input: {
  projectId: string
  candidateId: string
  benchmark: SkillBenchmarkEvidence
  pairedCases: readonly PairedLearningCase[]
  trainingCaseKeys: readonly string[]
  rollbackRef: string
  minimumCaseCount?: number
  minimumCandidateScore?: number
  riskClass?: LearningRiskClass
  actorUserId?: string | null
}) {
  void input
  throw new Error('Governed learning benchmark writes are disabled until server-owned output, evaluator, and accounting evidence can be attested.')
}
