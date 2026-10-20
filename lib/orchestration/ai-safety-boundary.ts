export type AiSafetyDecision = 'ALLOW' | 'DENY' | 'REVIEW'

export type AiSafetyAssessment = {
  decision: AiSafetyDecision
  policyKey: string
  reasons: string[]
  evidenceRefs: string[]
}

export interface AiSafetyProvider {
  readonly id: string
  assess(input: {
    projectId: string
    workflowRunId: string
    taskKey: string
    capabilityKey: string
    contentClass: 'INPUT' | 'OUTPUT'
    payloadHash: string
  }): Promise<AiSafetyAssessment>
}

export function assertAiSafetyAllowsExecution(assessment: AiSafetyAssessment) {
  if (!assessment.policyKey.trim()) throw new Error('AI safety assessment requires policy identity.')
  if (assessment.decision !== 'ALLOW') {
    throw new Error(`AI safety gate did not allow execution: ${assessment.decision}.`)
  }
  if (!assessment.evidenceRefs.length) throw new Error('AI safety ALLOW requires evidence.')
}
