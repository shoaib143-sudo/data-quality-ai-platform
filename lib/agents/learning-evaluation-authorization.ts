type LearningEvaluatorBinding = {
  authenticatedUserId: string
  policyEvaluatorActorId: string
  resultEvaluatorActorId: string
}

export function canonicalLearningActorId(value: string, label: string) {
  const normalized = value.trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error(`${label} must be a canonical UUID.`)
  }
  return normalized
}

/** Fail closed unless the session principal, locked policy and result agree. */
export function assertAuthenticatedLearningEvaluator(input: LearningEvaluatorBinding) {
  const authenticatedUserId = canonicalLearningActorId(input.authenticatedUserId, 'Authenticated user ID')
  const policyEvaluatorActorId = canonicalLearningActorId(input.policyEvaluatorActorId, 'Policy evaluator ID')
  const resultEvaluatorActorId = canonicalLearningActorId(input.resultEvaluatorActorId, 'Result evaluator ID')

  if (authenticatedUserId !== policyEvaluatorActorId || authenticatedUserId !== resultEvaluatorActorId) {
    throw new Error('Authenticated evaluator must match the evaluator bound to the policy and evaluation result.')
  }
  return authenticatedUserId
}

export function assertLearningEvaluatorAssignment(input: {
  proposerUserId: string
  evaluatorUserId: string
}) {
  const proposerUserId = canonicalLearningActorId(input.proposerUserId, 'Proposer user ID')
  const evaluatorUserId = canonicalLearningActorId(input.evaluatorUserId, 'Evaluator user ID')
  if (proposerUserId === evaluatorUserId) throw new Error('Proposer and evaluator must be different authenticated users.')
  return { proposerUserId, evaluatorUserId }
}
