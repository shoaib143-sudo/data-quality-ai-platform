import { hasProjectCapability } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveInstanceOrganizationMembership } from './instance-organization'

type CoverageAuthority = {
  id: string
  user_id: string
  project_id: string | null
  domain: string
  approval_axis: 'BUSINESS' | 'GOVERNANCE'
  source_role_key: string | null
  starts_at: string
  ends_at: string | null
  reason: string
}

export type ApprovalCoverageScope = {
  projectId: string
  projectName: string
  domain: string
  status: 'HEALTHY' | 'MISSING_BUSINESS' | 'MISSING_GOVERNANCE' | 'SEPARATION_BLOCKED'
  businessApprovers: { userId: string; label: string; sourceRoleKey: string | null; scope: string }[]
  governanceApprovers: { userId: string; label: string; sourceRoleKey: string | null; scope: string }[]
  separationSatisfiable: boolean
}

function activeAuthority(row: CoverageAuthority, now: number) {
  const starts = new Date(row.starts_at).getTime()
  const ends = row.ends_at ? new Date(row.ends_at).getTime() : null
  return starts <= now && (ends === null || ends > now)
}

export async function loadApprovalCoverageWorkspace(userId: string) {
  const admin = createAdminClient()
  const membership = await resolveInstanceOrganizationMembership(userId)

  const { data: projects, error: projectsError } = await admin.schema('app').from('projects')
    .select('id,name')
    .eq('organization_id', membership.organizationId)
    .order('name')
  if (projectsError) throw new Error(`Unable to load approval-coverage projects: ${projectsError.message}`)

  const managedProjects = (await Promise.all((projects ?? []).map(async project => ({
    id: String(project.id),
    name: String(project.name),
    allowed: await hasProjectCapability(userId, String(project.id), 'admin.manage'),
  })))).filter(project => project.allowed)

  const managedIds = managedProjects.map(project => project.id)
  if (!managedIds.length) return { scopes: [] as ApprovalCoverageScope[], managedProjectCount: 0 }

  const [datasetsResult, cdesResult, authoritiesResult] = await Promise.all([
    admin.schema('catalog').from('datasets')
      .select('project_id,business_domain')
      .in('project_id', managedIds),
    admin.schema('governance').from('critical_data_elements')
      .select('project_id,domain,metadata')
      .in('project_id', managedIds),
    admin.schema('governance').from('agent_approval_authorities')
      .select('id,user_id,project_id,domain,approval_axis,source_role_key,starts_at,ends_at,reason')
      .eq('active', true)
      .in('project_id', managedIds),
  ])

  if (datasetsResult.error) throw new Error(`Unable to load approval-coverage dataset domains: ${datasetsResult.error.message}`)
  if (cdesResult.error) throw new Error(`Unable to load approval-coverage critical-element domains: ${cdesResult.error.message}`)
  if (authoritiesResult.error) throw new Error(`Unable to load approval authorities: ${authoritiesResult.error.message}`)

  const domainsByProject = new Map<string, Map<string, string>>()
  const addDomain = (projectId: string, domain: string) => {
    const trimmed = domain.trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    const domains = domainsByProject.get(projectId) ?? new Map<string, string>()
    if (!domains.has(key)) domains.set(key, trimmed)
    domainsByProject.set(projectId, domains)
  }

  for (const row of datasetsResult.data ?? []) addDomain(String(row.project_id), String(row.business_domain ?? ''))
  for (const row of cdesResult.data ?? []) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>
    const synthetic = String(metadata.synthetic_bootstrap ?? 'false').trim().toLowerCase()
    if (['true', '1', 'yes'].includes(synthetic)) continue
    addDomain(String(row.project_id), String(row.domain ?? ''))
  }

  const now = Date.now()
  const authorities = (authoritiesResult.data ?? []).filter(row => activeAuthority(row as CoverageAuthority, now)) as CoverageAuthority[]
  const authorityUserIds = [...new Set(authorities.map(row => row.user_id))]
  const labels = new Map<string, string>()
  if (authorityUserIds.length) {
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (usersError) throw new Error(`Unable to load approval approver directory: ${usersError.message}`)
    for (const user of usersData.users) {
      if (authorityUserIds.includes(user.id)) labels.set(user.id, user.email ?? user.id)
    }
  }

  const projectNames = new Map(managedProjects.map(project => [project.id, project.name]))
  const scopes: ApprovalCoverageScope[] = []

  for (const project of managedProjects) {
    const domains = [...(domainsByProject.get(project.id)?.values() ?? [])].sort((a, b) => a.localeCompare(b))
    for (const domain of domains) {
      const matching = authorities.filter(row =>
        String(row.project_id) === project.id && row.domain.trim().toLowerCase() === domain.toLowerCase())
      const business = matching.filter(row => row.approval_axis === 'BUSINESS')
      const governance = matching.filter(row => row.approval_axis === 'GOVERNANCE')
      const separationSatisfiable = business.some(businessRow => governance.some(governanceRow => governanceRow.user_id !== businessRow.user_id))

      const status: ApprovalCoverageScope['status'] = business.length === 0
        ? 'MISSING_BUSINESS'
        : governance.length === 0
          ? 'MISSING_GOVERNANCE'
          : separationSatisfiable
            ? 'HEALTHY'
            : 'SEPARATION_BLOCKED'

      const present = (row: CoverageAuthority) => ({
        userId: row.user_id,
        label: labels.get(row.user_id) ?? row.user_id,
        sourceRoleKey: row.source_role_key,
        scope: `${projectNames.get(project.id) ?? project.id} / ${domain}`,
      })

      scopes.push({
        projectId: project.id,
        projectName: project.name,
        domain,
        status,
        businessApprovers: business.map(present),
        governanceApprovers: governance.map(present),
        separationSatisfiable,
      })
    }
  }

  return { scopes, managedProjectCount: managedProjects.length }
}
