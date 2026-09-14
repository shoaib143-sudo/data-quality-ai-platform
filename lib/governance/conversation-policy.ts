import { createAdminClient } from '@/lib/supabase/admin'
import { AuthorizationError, authorizeProject } from '@/lib/auth/authorize'
import { resolveLandingAccess } from './landing-access'
import { authorizedDatasetScopeForProject } from './resource-authorization'
import type { PersonaSlug } from './personas'
import {
  resolveConversationDefaults,
  type ConversationOverride,
  type PersonaConversationDefault,
} from './persona-conversation-defaults'

export function sanitizeConversationOverride(value: unknown): ConversationOverride {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const result: ConversationOverride = {}
  if (['CONCISE','BALANCED','DETAILED'].includes(String(input.responseDepth))) {
    result.responseDepth = input.responseDepth as ConversationOverride['responseDepth']
  }
  if (['SUMMARY','EVIDENCE_FIRST','FULL_TRACE'].includes(String(input.evidenceDepth))) {
    result.evidenceDepth = input.evidenceDepth as ConversationOverride['evidenceDepth']
  }
  if (['ADVISORY','DECISION','OPERATIONAL'].includes(String(input.recommendationStyle))) {
    result.recommendationStyle = input.recommendationStyle as ConversationOverride['recommendationStyle']
  }
  if (['ENTERPRISE','DOMAIN','PROJECT','RESOURCE'].includes(String(input.defaultScope))) {
    result.defaultScope = input.defaultScope as ConversationOverride['defaultScope']
  }
  if (Array.isArray(input.suggestedPrompts)) {
    result.suggestedPrompts = input.suggestedPrompts.filter((item): item is string => typeof item === 'string').slice(0, 12)
  }
  if (Array.isArray(input.preferredAgentKeys)) {
    result.preferredAgentKeys = input.preferredAgentKeys.filter((item): item is string => typeof item === 'string').slice(0, 12)
  }
  return result
}

export async function resolveConversationPolicy(input: {
  organizationId: string
  userId: string
  persona: PersonaSlug
  projectId?: string | null
  domain?: string | null
}): Promise<PersonaConversationDefault> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('agent_conversation_overrides')
    .select('scope_type,persona_slug,domain,project_id,user_id,settings,updated_at')
    .eq('organization_id', input.organizationId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`Unable to resolve conversational policy: ${error.message}`)

  const rows = data ?? []
  const personaCompatible = (row: Record<string, unknown>) => !row.persona_slug || String(row.persona_slug) === input.persona

  const domainRow = input.domain
    ? rows.find(row => row.scope_type === 'DOMAIN' && personaCompatible(row) && String(row.domain ?? '').toLowerCase() === input.domain!.toLowerCase())
    : null
  const projectRow = input.projectId
    ? rows.find(row => row.scope_type === 'PROJECT' && personaCompatible(row) && String(row.project_id ?? '') === input.projectId)
    : null
  const userRow = rows.find(row =>
    row.scope_type === 'USER'
    && String(row.user_id ?? '') === input.userId
    && (!row.project_id || String(row.project_id) === String(input.projectId ?? ''))
    && (!row.domain || String(row.domain).toLowerCase() === String(input.domain ?? '').toLowerCase())
  )

  return resolveConversationDefaults(
    input.persona,
    sanitizeConversationOverride(domainRow?.settings),
    sanitizeConversationOverride(projectRow?.settings),
    sanitizeConversationOverride(userRow?.settings),
  )
}

export type ProjectConversationPolicyContext = {
  projectId: string
  appliedDomain: string | null
  availableDomains: string[]
  settings: PersonaConversationDefault
  persona: PersonaSlug
}

export async function resolveProjectConversationPolicy(input: {
  userId: string
  projectId: string
  requestedDomain?: string | null
}): Promise<ProjectConversationPolicyContext> {
  const authorization = await authorizeProject(input.userId, input.projectId, 'agent.converse')
  const [landing, datasetScope] = await Promise.all([
    resolveLandingAccess(input.userId),
    authorizedDatasetScopeForProject(input.userId, input.projectId),
  ])
  if (landing.organizationId !== authorization.organizationId) {
    throw new AuthorizationError('Conversation project is outside the active organization.', 403)
  }

  const admin = createAdminClient()
  const domainRows = datasetScope.authorizedDatasetIds.length
    ? await admin.schema('catalog').from('datasets')
        .select('id,business_domain')
        .eq('project_id', input.projectId)
        .in('id', datasetScope.authorizedDatasetIds)
    : { data: [], error: null }
  if (domainRows.error) throw new Error(`Unable to resolve conversational domain scope: ${domainRows.error.message}`)

  const availableDomains = Array.from(new Set((domainRows.data ?? [])
    .map(row => String(row.business_domain ?? '').trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))

  const requestedDomain = input.requestedDomain?.trim() || null
  const appliedDomain = requestedDomain
    ? availableDomains.find(domain => domain.toLowerCase() === requestedDomain.toLowerCase()) ?? null
    : null
  if (requestedDomain && !appliedDomain) {
    throw new AuthorizationError('Requested conversation domain is not visible in this project.', 403)
  }

  const settings = await resolveConversationPolicy({
    organizationId: authorization.organizationId,
    userId: input.userId,
    persona: landing.persona,
    projectId: input.projectId,
    domain: appliedDomain,
  })

  return {
    projectId: input.projectId,
    appliedDomain,
    availableDomains,
    settings,
    persona: landing.persona,
  }
}
