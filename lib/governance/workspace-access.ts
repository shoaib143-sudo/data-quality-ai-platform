import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import type { PersonaSlug } from './personas'
import { resolveLandingAccess } from './landing-access'

export type WorkspaceKey =
  | 'dashboard'
  | 'catalog'
  | 'glossary'
  | 'lineage'
  | 'stewardship'
  | 'classification'
  | 'classification-privacy'
  | 'issues'
  | 'data-quality'
  | 'schedules'
  | 'monitoring'
  | 'observability'
  | 'audit'
  | 'reports'
  | 'admin'
  | 'retention'
  | 'profiling'
  | 'agents'
  | 'datasets'

const access: Record<PersonaSlug, readonly WorkspaceKey[]> = {
  'senior-leadership': ['catalog', 'issues', 'data-quality', 'stewardship', 'reports'],
  'business-user': ['catalog', 'glossary', 'issues', 'data-quality'],
  'data-owner': ['catalog', 'glossary', 'data-quality', 'stewardship', 'issues', 'lineage', 'reports', 'classification'],
  'data-product-owner': ['catalog', 'glossary', 'lineage', 'stewardship', 'issues', 'data-quality', 'reports'],
  'data-steward': ['catalog', 'glossary', 'data-quality', 'stewardship', 'issues', 'lineage', 'classification', 'reports'],
  'data-governance-specialist': ['catalog', 'glossary', 'lineage', 'stewardship', 'classification', 'issues', 'data-quality', 'audit', 'reports', 'retention'],
  'compliance-risk-officer': ['catalog', 'glossary', 'lineage', 'classification', 'issues', 'data-quality', 'audit', 'reports', 'retention'],
  'privacy-security-officer': ['catalog', 'glossary', 'lineage', 'classification', 'classification-privacy', 'issues', 'audit', 'reports'],
  'data-governance-admin': ['dashboard', 'catalog', 'glossary', 'lineage', 'stewardship', 'classification', 'classification-privacy', 'issues', 'data-quality', 'schedules', 'monitoring', 'observability', 'audit', 'reports', 'retention', 'profiling', 'agents', 'datasets'],
  'data-custodian': ['catalog', 'datasets', 'lineage', 'issues', 'data-quality', 'schedules', 'monitoring', 'observability', 'profiling', 'agents'],
  'source-system-owner': ['catalog', 'datasets', 'lineage', 'issues', 'data-quality', 'schedules', 'monitoring', 'observability', 'profiling'],
  'metadata-analyst': ['catalog', 'glossary', 'lineage', 'classification', 'issues', 'data-quality', 'audit', 'reports', 'profiling'],
  'data-quality-analyst': ['catalog', 'issues', 'data-quality', 'observability', 'audit', 'reports', 'profiling', 'agents'],
}

export function canAccessWorkspace(persona: PersonaSlug, workspace: WorkspaceKey, organizationRole?: string | null) {
  if (workspace === 'admin') return Boolean(organizationRole && /^(OWNER|ADMIN)$/i.test(organizationRole))
  return access[persona].includes(workspace)
}

export function workspacesForPersona(persona: PersonaSlug) {
  return access[persona]
}

export async function requireWorkspaceAccess(workspace: WorkspaceKey) {
  const user = await requireUser()
  const context = await resolveLandingAccess(user.id)

  if (!canAccessWorkspace(context.persona, workspace, context.organizationRole)) {
    redirect(context.enabled ? `/home/${context.persona}` : '/home/unavailable')
  }

  return context
}
