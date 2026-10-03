export type VerificationOutcome = 'PASS' | 'FAIL' | 'UNCERTAIN'

export type WorkflowVerificationResult = {
  outcome: VerificationOutcome
  verifierKey: string
  evidenceRefs: readonly string[]
  detail: string | null
}

export function assertTaskClosureAllowed(result: WorkflowVerificationResult) {
  if (!result.verifierKey.trim()) throw new Error('Independent verifier identity is required.')
  if (!result.evidenceRefs.length) throw new Error('Verification evidence is required before task closure.')
  if (result.outcome !== 'PASS') throw new Error(`Task closure denied because verification outcome is ${result.outcome}.`)
}
