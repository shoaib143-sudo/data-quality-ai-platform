import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDataGovernanceSuperAdmin } from '@/lib/auth/data-governance-super-admin'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const admin = createAdminClient()
  const [{ data: memberships, error }, governanceSuperAdmin] = await Promise.all([
    admin
      .schema('app')
      .from('organization_members')
      .select('organization_id,role')
      .eq('user_id', user.id)
      .in('role', ['OWNER', 'ADMIN'])
      .limit(1),
    isDataGovernanceSuperAdmin(user.id),
  ])

  if (error) throw new Error(`Unable to resolve organization administrator access: ${error.message}`)
  if (!memberships?.length && !governanceSuperAdmin) redirect('/home')

  return children
}
