import { createAdminClient } from '@/lib/supabase/admin'
import type { PersonaSlug } from './personas'
import { resolvePersonaFromRoleLabels } from './resolve-persona'
import { assertInstanceOrganizationId, resolveInstanceOrganizationMembership } from './instance-organization'

export type LandingAccessContext = {
  organizationId: string
  organizationRole: string | null
  persona: PersonaSlug
  enabled: boolean
}

export async function resolveLandingAccess(userId: string): Promise<LandingAccessContext> {
  const admin = createAdminClient()
  const { organizationId, organizationRole } = await resolveInstanceOrganizationMembership(userId)

  const projectsResult = await admin.schema('app').from('projects').select('id').eq('organization_id', organizationId)
  if (projectsResult.error) throw new Error(`Unable to resolve organization projects: ${projectsResult.error.message}`)
  const projectIds = (projectsResult.data ?? []).map(row => row.id)

  let roleKeys: string[] = []
  if (projectIds.length) {
    const bindingsResult = await admin.schema('governance').from('project_role_bindings')
      .select('role_key')
      .eq('user_id', userId)
      .eq('active', true)
      .in('project_id', projectIds)
    if (bindingsResult.error) throw new Error(`Unable to resolve governance roles: ${bindingsResult.error.message}`)
    roleKeys = (bindingsResult.data ?? []).map(row => String(row.role_key))
  }

  const persona = resolvePersonaFromRoleLabels(roleKeys, organizationRole)
  const settingResult = await admin.schema('governance').from('landing_page_settings')
    .select('enabled')
    .eq('organization_id', organizationId)
    .eq('persona_slug', persona)
    .maybeSingle()
  if (settingResult.error) throw new Error(`Unable to resolve landing page setting: ${settingResult.error.message}`)
  const enabled = settingResult.data?.enabled ?? true

  return { organizationId, organizationRole, persona, enabled }
}

export async function isLandingPageEnabled(organizationId: string, persona: PersonaSlug): Promise<boolean> {
  await assertInstanceOrganizationId(organizationId)
  const admin = createAdminClient()
  const result = await admin.schema('governance').from('landing_page_settings')
    .select('enabled')
    .eq('organization_id', organizationId)
    .eq('persona_slug', persona)
    .maybeSingle()
  if (result.error) throw new Error(`Unable to resolve landing page setting: ${result.error.message}`)
  return result.data?.enabled ?? true
}
