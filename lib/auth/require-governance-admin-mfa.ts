import { createClient } from '@/lib/supabase/server'
import { AuthorizationError } from '@/lib/auth/authorize'
import { decideGovernanceAdminMfa } from './governance-admin-mfa-policy'

/** Invoke after server-side role/scope authorization on each privileged interactive entry point.
 * Never grant access based only on this function: role and tenant authorization are independent.
 */
export async function requireGovernanceAdminMfa(): Promise<void> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user?.id) throw new AuthorizationError('Authentication required.', 401)
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) throw new AuthorizationError('Unable to verify MFA assurance.', 403)
  const decision = decideGovernanceAdminMfa({
    authenticated: true,
    isGovernanceAdmin: true, // caller must have already verified role and tenant scope
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
  })
  if (decision !== 'allow') throw new AuthorizationError(
    decision === 'enroll' ? 'Administrator MFA enrollment required.' :
    decision === 'challenge' ? 'Administrator MFA challenge required.' :
    'Administrator MFA assurance required.', 403,
  )
}
