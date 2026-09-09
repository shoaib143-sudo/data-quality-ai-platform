import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { resolveLandingAccess } from '@/lib/governance/landing-access'

export default async function RoleAwareHomePage() {
  const user = await requireUser()
  const access = await resolveLandingAccess(user.id)
  redirect(access.enabled ? `/home/${access.persona}` : '/home/unavailable')
}
