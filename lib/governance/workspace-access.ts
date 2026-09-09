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
  'business-user': ['catalog', 'glossary', 'datasets', 'issues', 'data-quality'],
  'data-owner': ['catalog', 'glossary', 'datasets', 'data-quality', 'stewardship', 'issues', 'lineage', 'reports', 'classification'],
  'data-steward': ['catalog', 'glossary', 'datasets', 'data-quality', 'stewardship', 'issues', 'lineage', 'classification', 'reports'],
  'data-governance-admin': ['dashboard', 'catalog', 'glossary', 'lineage', 'stewardship', 'classification', 'classification-privacy', 'issues', 'data-quality', 'schedules', 'monitoring', 'observability', 'audit', 'reports', 'retention', 'profiling', 'agents', 'datasets'],
  'data-governance-specialist': ['catalog', 'glossary', 'datasets', 'lineage', 'stewardship', 'classification', 'issues', 'data-quality', 'audit', 'reports', 'retention'],
  'compliance-risk-officer': ['catalog', 'glossary', 'lineage', 'classification', 'issues', 'data-quality', 'audit', 'reports', 'retention'],
  'privacy-security-officer': ['catalog', 'glossary', 'lineage', 'classification', 'classification-privacy', 'issues', 'audit', 'reports'],
  'data-custodian': ['catalog', 'datasets', 'lineage', 'issues', 'data-quality', 'schedules', 'monitoring', 'observability', 'profiling', 'agents'],
  'data-product-owner': ['catalog', 'glossary', 'datasets', 'lineage', 'stewardship', 'issues', 'data-quality', 'reports'],
  'source-system-owner': ['catalog', 'datasets', 'lineage', 'issues', 'data-quality', 'schedules', 'monitoring', 'observability', 'profiling'],
}

export function canAccessWorkspace(persona: PersonaSlug, workspace: WorkspaceKey, organizationRole?: string | null) {
  if (workspace === 'admin') return Boolean(organizationRole && /^(OWNER|ADMIN)$/i.test(organizationRole))
  return access[persona].includes(workspace)
}

export async function requireWorkspaceAccess(workspace: WorkspaceKey) {
  const user = await requireUser()
  const context = await resolveLandingAccess(user.id)

  if (!canAccessWorkspace(context.persona, workspace, context.organizationRole)) {
    redirect(context.enabled ? `/home/${context.persona}` : '/home/unavailable')
  }

  return context
}
