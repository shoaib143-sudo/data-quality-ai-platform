type LearningEvaluatorBinding = {
  authenticatedUserId: string
  policyEvaluatorActorId: string
  resultEvaluatorActorId: string
}

function canonicalActorId(value: string, label: string) {
  const normalized = value.trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error(`${label} must be a canonical UUID.`)
  }
  return normalized
}

/** Fail closed unless the session principal, locked policy and result agree. */
export function assertAuthenticatedLearningEvaluator(input: LearningEvaluatorBinding) {
  const authenticatedUserId = canonicalActorId(input.authenticatedUserId, 'Authenticated user ID')
  const policyEvaluatorActorId = canonicalActorId(input.policyEvaluatorActorId, 'Policy evaluator ID')
  const resultEvaluatorActorId = canonicalActorId(input.resultEvaluatorActorId, 'Result evaluator ID')

  if (authenticatedUserId !== policyEvaluatorActorId || authenticatedUserId !== resultEvaluatorActorId) {
    throw new Error('Authenticated evaluator must match the evaluator bound to the policy and evaluation result.')
  }
  return authenticatedUserId
}
