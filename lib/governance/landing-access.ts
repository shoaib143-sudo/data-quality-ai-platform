import { createAdminClient } from '@/lib/supabase/admin'
import type { PersonaSlug } from './personas'
import { resolvePersonaFromRoleLabels } from './resolve-persona'

export type LandingAccessContext = {
  organizationId: string | null
  organizationRole: string | null
  persona: PersonaSlug
  enabled: boolean
}

export async function resolveLandingAccess(userId: string): Promise<LandingAccessContext> {
  const admin = createAdminClient()
  const membershipResult = await admin.schema('app').from('organization_members')
    .select('organization_id,role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipResult.error) throw new Error(`Unable to resolve organization membership: ${membershipResult.error.message}`)

  const organizationId = membershipResult.data?.organization_id ?? null
  const organizationRole = membershipResult.data?.role ? String(membershipResult.data.role) : null

  let roleLabels: string[] = []
  if (organizationId) {
    const projectsResult = await admin.schema('app').from('projects').select('id').eq('organization_id', organizationId)
    if (projectsResult.error) throw new Error(`Unable to resolve organization projects: ${projectsResult.error.message}`)
    const projectIds = (projectsResult.data ?? []).map(row => row.id)

    if (projectIds.length) {
      const bindingsResult = await admin.schema('governance').from('project_role_bindings')
        .select('role_key')
        .eq('user_id', userId)
        .eq('active', true)
        .in('project_id', projectIds)
      if (bindingsResult.error) throw new Error(`Unable to resolve governance roles: ${bindingsResult.error.message}`)

      const roleKeys = (bindingsResult.data ?? []).map(row => String(row.role_key))
      roleLabels = [...roleKeys]
      if (roleKeys.length) {
        const rolesResult = await admin.schema('governance').from('access_roles').select('role_key,name').in('role_key', roleKeys)
        if (rolesResult.error) throw new Error(`Unable to resolve governance role names: ${rolesResult.error.message}`)
        roleLabels.push(...(rolesResult.data ?? []).map(row => String(row.name)))
      }
    }
  }

  const persona = resolvePersonaFromRoleLabels(roleLabels, organizationRole)
  let enabled = true
  if (organizationId) {
    const settingResult = await admin.schema('governance').from('landing_page_settings')
      .select('enabled')
      .eq('organization_id', organizationId)
      .eq('persona_slug', persona)
      .maybeSingle()
    if (settingResult.error) throw new Error(`Unable to resolve landing page setting: ${settingResult.error.message}`)
    enabled = settingResult.data?.enabled ?? true
  }

  return { organizationId, organizationRole, persona, enabled }
}

export async function isLandingPageEnabled(organizationId: string | null, persona: PersonaSlug): Promise<boolean> {
  if (!organizationId) return true
  const admin = createAdminClient()
  const result = await admin.schema('governance').from('landing_page_settings')
    .select('enabled')
    .eq('organization_id', organizationId)
    .eq('persona_slug', persona)
    .maybeSingle()
  if (result.error) throw new Error(`Unable to resolve landing page setting: ${result.error.message}`)
  return result.data?.enabled ?? true
}
