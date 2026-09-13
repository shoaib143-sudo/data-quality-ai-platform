import { createAdminClient } from '@/lib/supabase/admin'
import { resolveInstanceOrganizationMembership } from './instance-organization'

/**
 * Resolve the most recently assigned active governance project for a user.
 *
 * This is a presentation default only. It does not grant access and it does not
 * replace route/API authorization. Workspaces may still allow the user to
 * switch among projects they are authorized to use.
 */
export async function resolvePreferredGovernanceProject(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { organizationId } = await resolveInstanceOrganizationMembership(userId)

  const projectsResult = await admin
    .schema('app')
    .from('projects')
    .select('id')
    .eq('organization_id', organizationId)
  if (projectsResult.error) throw new Error(`Unable to resolve organization projects: ${projectsResult.error.message}`)

  const projectIds = (projectsResult.data ?? []).map(row => String(row.id))
  if (projectIds.length === 0) return null

  const bindingResult = await admin
    .schema('governance')
    .from('project_role_bindings')
    .select('project_id,assigned_at')
    .eq('user_id', userId)
    .eq('active', true)
    .in('project_id', projectIds)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (bindingResult.error) throw new Error(`Unable to resolve preferred governance project: ${bindingResult.error.message}`)

  return bindingResult.data?.project_id ? String(bindingResult.data.project_id) : null
}
