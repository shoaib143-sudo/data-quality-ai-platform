import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { resolvePersonaFromRoleLabels } from '@/lib/governance/resolve-persona'

export default async function RoleAwareHomePage() {
  const user = await requireUser()
  const supabase = await createClient()

  const [bindingsResult, organizationResult] = await Promise.all([
    supabase.schema('governance').from('project_role_bindings').select('role_key').eq('user_id', user.id).eq('active', true),
    supabase.schema('app').from('organization_members').select('role').eq('user_id', user.id).limit(1).maybeSingle(),
  ])

  const roleKeys = bindingsResult.error ? [] : (bindingsResult.data ?? []).map(row => String(row.role_key))
  let roleLabels = [...roleKeys]

  if (roleKeys.length) {
    const rolesResult = await supabase.schema('governance').from('access_roles').select('role_key,name').in('role_key', roleKeys)
    if (!rolesResult.error) roleLabels = roleLabels.concat((rolesResult.data ?? []).map(row => String(row.name)))
  }

  const organizationRole = organizationResult.error ? null : organizationResult.data?.role ?? null
  const persona = resolvePersonaFromRoleLabels(roleLabels, organizationRole)
  redirect(`/home/${persona}`)
}
