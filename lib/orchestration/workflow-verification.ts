export type VerificationOutcome = 'PASS' | 'FAIL' | 'UNCERTAIN'

export type WorkflowVerificationResult = {
  workflowRunId: string
  taskKey: string
  correlationId: string
  outcome: VerificationOutcome
  executorKey: string
  verifierKey: string
  policyVersion: string
  evidenceRefs: readonly string[]
  detail: string | null
}

export function assertTaskClosureAllowed(result: WorkflowVerificationResult) {
  if (!result.workflowRunId.trim() || !result.taskKey.trim() || !result.correlationId.trim()) throw new Error('Verification must be bound to workflow, task and correlation identity.')
  if (!result.executorKey.trim()) throw new Error('Executor identity is required.')
  if (!result.verifierKey.trim()) throw new Error('Independent verifier identity is required.')
  if (result.executorKey === result.verifierKey) throw new Error('Independent verification cannot be performed by the task executor.')
  if (!result.policyVersion.trim()) throw new Error('Verification policy version is required.')
  if (!result.evidenceRefs.length) throw new Error('Verification evidence is required before task closure.')
  if (result.outcome !== 'PASS') throw new Error(`Task closure denied because verification outcome is ${result.outcome}.`)
}
