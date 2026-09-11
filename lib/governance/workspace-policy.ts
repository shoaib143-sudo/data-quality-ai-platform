import type { PersonaSlug } from './personas'

export type WorkspaceKey =
  | 'dashboard'
  | 'catalog'
  | 'discovery'
  | 'glossary'
  | 'lineage'
  | 'lineage-manage'
  | 'stewardship'
  | 'classification'
  | 'classification-privacy'
  | 'issues'
  | 'inbox'
  | 'data-quality'
  | 'schedules'
  | 'monitoring'
  | 'observability'
  | 'observability-manage'
  | 'audit'
  | 'reports'
  | 'ai-capabilities'
  | 'admin'
  | 'retention'
  | 'profiling'
  | 'agents'
  | 'datasets'
  | 'contracts'
  | 'documents'
  | 'scorecards'
  | 'workflows'
  | 'platform'
  | 'search'
  | 'journeys'

const access: Record<PersonaSlug, readonly WorkspaceKey[]> = {
  'senior-leadership': ['catalog', 'issues', 'data-quality', 'stewardship', 'reports', 'profiling', 'scorecards', 'search', 'inbox', 'journeys'],
  'business-user': ['catalog', 'glossary', 'issues', 'data-quality', 'profiling', 'search', 'inbox', 'journeys'],
  'data-owner': ['catalog', 'discovery', 'glossary', 'data-quality', 'stewardship', 'issues', 'lineage', 'lineage-manage', 'reports', 'classification', 'profiling', 'contracts', 'scorecards', 'workflows', 'search', 'inbox', 'journeys'],
  'data-product-owner': ['catalog', 'glossary', 'lineage', 'stewardship', 'issues', 'data-quality', 'reports', 'profiling', 'contracts', 'scorecards', 'workflows', 'search', 'inbox', 'journeys'],
  'data-steward': ['catalog', 'discovery', 'glossary', 'data-quality', 'stewardship', 'issues', 'lineage', 'lineage-manage', 'classification', 'reports', 'profiling', 'contracts', 'scorecards', 'workflows', 'search', 'inbox', 'journeys'],
  'data-governance-specialist': ['catalog', 'glossary', 'lineage', 'stewardship', 'classification', 'issues', 'data-quality', 'audit', 'reports', 'ai-capabilities', 'retention', 'profiling', 'contracts', 'scorecards', 'workflows', 'search', 'inbox', 'journeys'],
  'compliance-risk-officer': ['catalog', 'glossary', 'lineage', 'classification', 'issues', 'data-quality', 'audit', 'reports', 'retention', 'profiling', 'contracts', 'documents', 'scorecards', 'workflows', 'search', 'inbox', 'journeys'],
  'privacy-security-officer': ['catalog', 'glossary', 'lineage', 'classification', 'classification-privacy', 'issues', 'audit', 'reports', 'profiling', 'documents', 'workflows', 'search', 'inbox', 'journeys'],
  'data-governance-admin': ['dashboard', 'catalog', 'discovery', 'glossary', 'lineage', 'lineage-manage', 'stewardship', 'classification', 'classification-privacy', 'issues', 'data-quality', 'schedules', 'monitoring', 'observability', 'observability-manage', 'audit', 'reports', 'ai-capabilities', 'retention', 'profiling', 'agents', 'datasets', 'contracts', 'documents', 'scorecards', 'workflows', 'platform', 'search', 'inbox', 'journeys'],
  'data-custodian': ['catalog', 'discovery', 'datasets', 'lineage', 'lineage-manage', 'issues', 'data-quality', 'schedules', 'monitoring', 'observability', 'observability-manage', 'profiling', 'agents', 'ai-capabilities', 'contracts', 'documents', 'workflows', 'search', 'inbox', 'journeys'],
  'source-system-owner': ['catalog', 'datasets', 'lineage', 'issues', 'data-quality', 'schedules', 'monitoring', 'observability', 'observability-manage', 'profiling', 'contracts', 'workflows', 'search', 'inbox', 'journeys'],
  'metadata-analyst': ['catalog', 'glossary', 'lineage', 'classification', 'issues', 'data-quality', 'audit', 'reports', 'ai-capabilities', 'profiling', 'contracts', 'documents', 'scorecards', 'search', 'inbox', 'journeys'],
  'data-quality-analyst': ['catalog', 'issues', 'data-quality', 'observability', 'audit', 'reports', 'ai-capabilities', 'profiling', 'agents', 'contracts', 'documents', 'scorecards', 'workflows', 'search', 'inbox', 'journeys'],
}

export const workspacePrefixes: readonly [string, WorkspaceKey][] = [
  ['/classification-privacy', 'classification-privacy'],
  ['/catalog/discovery', 'discovery'],
  ['/lineage/ingest', 'lineage-manage'],
  ['/lineage/suggestions', 'lineage-manage'],
  ['/observability/settings', 'observability-manage'],
  ['/ai-capabilities', 'ai-capabilities'],
  ['/data-quality', 'data-quality'],
  ['/profiling', 'profiling'],
  ['/observability', 'observability'],
  ['/monitoring', 'monitoring'],
  ['/recovery', 'monitoring'],
  ['/stewardship', 'stewardship'],
  ['/classification', 'classification'],
  ['/contracts', 'contracts'],
  ['/documents', 'documents'],
  ['/scorecards', 'scorecards'],
  ['/workflows', 'workflows'],
  ['/platform', 'platform'],
  ['/journeys', 'journeys'],
  ['/search', 'search'],
  ['/catalog', 'catalog'],
  ['/glossary', 'glossary'],
  ['/lineage', 'lineage'],
  ['/inbox', 'inbox', 'journeys'],
  ['/issues', 'issues'],
  ['/reports', 'reports'],
  ['/schedules', 'schedules'],
  ['/retention', 'retention'],
  ['/agents', 'agents'],
  ['/datasets', 'datasets'],
  ['/dashboard', 'dashboard'],
  ['/audit', 'audit'],
  ['/admin', 'admin'],
]

export function canAccessWorkspace(persona: PersonaSlug, workspace: WorkspaceKey, organizationRole?: string | null) {
  if (workspace === 'admin') return Boolean(organizationRole && /^(OWNER|ADMIN)$/i.test(organizationRole))
  return access[persona].includes(workspace)
}

export function workspacesForPersona(persona: PersonaSlug) {
  return access[persona]
}

export function workspaceForHref(href: string): WorkspaceKey | null {
  const pathname = href.split(/[?#]/, 1)[0] || '/'
  const match = workspacePrefixes.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return match?.[1] ?? null
}

export function canAccessWorkspaceHref(persona: PersonaSlug, href: string, organizationRole?: string | null) {
  if (href === '/home' || href.startsWith('/home/')) return true
  if (href === '/ai-insights' || href.startsWith('/ai-insights?')) return true
  const workspace = workspaceForHref(href)
  return workspace ? canAccessWorkspace(persona, workspace, organizationRole) : false
}
