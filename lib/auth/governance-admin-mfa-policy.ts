/** Fail-closed assurance decision for interactive governance-admin requests.
 * Role authorization remains a separate mandatory check. Never use client-supplied AAL.
 */
export type AssuranceLevel = 'aal1' | 'aal2' | null | undefined
export type AdminMfaDecision = 'allow' | 'enroll' | 'challenge' | 'deny'
export function decideGovernanceAdminMfa(input: {
  authenticated: boolean
  isGovernanceAdmin: boolean
  currentLevel: AssuranceLevel
  nextLevel: AssuranceLevel
}): AdminMfaDecision {
  if (!input.authenticated || !input.isGovernanceAdmin) return 'deny'
  if (input.currentLevel === 'aal2') return 'allow'
  if (input.currentLevel !== 'aal1') return 'deny'
  if (input.nextLevel === 'aal2') return 'challenge'
  if (input.nextLevel === 'aal1') return 'enroll'
  return 'deny'
}
