export type ExternalCapabilityId =
  | 'harness-engineering'
  | 'claude-security'
  | 'diagram-design'
  | 'browser-use'
  | 'openviking'
  | 'agent-memory'
  | 'scientific-agent-skills'

export type ExternalCapabilityDisposition =
  | 'BORROW_PATTERN'
  | 'EXTENSION_POINT'
  | 'BENCHMARK_LATER'
  | 'GAP_DEFERRED'
  | 'NOT_APPLICABLE'

export type ExternalCapabilityPolicy = Readonly<{
  id: ExternalCapabilityId
  repository: string
  disposition: ExternalCapabilityDisposition
  enabledByDefault: false
  authoritative: false
  productionSecretsAllowed: false
  persistentWritesAllowed: boolean
  networkAccess: 'NONE' | 'ALLOWLIST_ONLY'
  purpose: string
}>

export const EXTERNAL_CAPABILITY_POLICIES: readonly ExternalCapabilityPolicy[] = [
  {
    id: 'harness-engineering',
    repository: 'https://github.com/harness-engineer/awesome-harness-engineering',
    disposition: 'BORROW_PATTERN',
    enabledByDefault: false,
    authoritative: false,
    productionSecretsAllowed: false,
    persistentWritesAllowed: false,
    networkAccess: 'NONE',
    purpose: 'Research input for native DataNexus harness design.',
  },
  {
    id: 'claude-security',
    repository: 'https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-security',
    disposition: 'EXTENSION_POINT',
    enabledByDefault: false,
    authoritative: false,
    productionSecretsAllowed: false,
    persistentWritesAllowed: false,
    networkAccess: 'ALLOWLIST_ONLY',
    purpose: 'Advisory defensive code and change review.',
  },
  {
    id: 'diagram-design',
    repository: 'https://github.com/cathrynlavery/diagram-design',
    disposition: 'EXTENSION_POINT',
    enabledByDefault: false,
    authoritative: false,
    productionSecretsAllowed: false,
    persistentWritesAllowed: false,
    networkAccess: 'NONE',
    purpose: 'Non-authoritative architecture and lineage documentation.',
  },
  {
    id: 'browser-use',
    repository: 'https://github.com/browser-use/browser-use',
    disposition: 'EXTENSION_POINT',
    enabledByDefault: false,
    authoritative: false,
    productionSecretsAllowed: false,
    persistentWritesAllowed: false,
    networkAccess: 'ALLOWLIST_ONLY',
    purpose: 'Sandboxed UI and persona verification only.',
  },
  {
    id: 'openviking',
    repository: 'https://github.com/volcengine/OpenViking',
    disposition: 'BENCHMARK_LATER',
    enabledByDefault: false,
    authoritative: false,
    productionSecretsAllowed: false,
    persistentWritesAllowed: false,
    networkAccess: 'ALLOWLIST_ONLY',
    purpose: 'Offline context retrieval benchmark only.',
  },
  {
    id: 'agent-memory',
    repository: 'UNSELECTED',
    disposition: 'GAP_DEFERRED',
    enabledByDefault: false,
    authoritative: false,
    productionSecretsAllowed: false,
    persistentWritesAllowed: false,
    networkAccess: 'NONE',
    purpose: 'Deferred because DataNexus already owns governed memory and learning.',
  },
  {
    id: 'scientific-agent-skills',
    repository: 'https://github.com/K-Dense-AI/scientific-agent-skills',
    disposition: 'NOT_APPLICABLE',
    enabledByDefault: false,
    authoritative: false,
    productionSecretsAllowed: false,
    persistentWritesAllowed: false,
    networkAccess: 'NONE',
    purpose: 'Not part of the default DataNexus product runtime.',
  },
] as const

export function getExternalCapabilityPolicy(id: ExternalCapabilityId) {
  const policy = EXTERNAL_CAPABILITY_POLICIES.find((candidate) => candidate.id === id)
  if (!policy) throw new Error('Unknown external capability')
  return policy
}

export type ExternalInvocationRequest = Readonly<{
  capability: ExternalCapabilityId
  explicitEnable: boolean
  production: boolean
  carriesSecrets: boolean
  requestsPersistentWrite: boolean
  targetUrl?: string
  allowedHosts?: readonly string[]
}>

export type ExternalInvocationDecision =
  | Readonly<{ allowed: true; reason: 'BOUNDED_EXTENSION_ALLOWED' }>
  | Readonly<{ allowed: false; reason: string }>

export function authorizeExternalInvocation(request: ExternalInvocationRequest): ExternalInvocationDecision {
  const policy = getExternalCapabilityPolicy(request.capability)

  if (!request.explicitEnable) return { allowed: false, reason: 'CAPABILITY_DISABLED_BY_DEFAULT' }
  if (policy.disposition === 'BORROW_PATTERN') return { allowed: false, reason: 'REFERENCE_ONLY' }
  if (policy.disposition === 'BENCHMARK_LATER' && request.production) return { allowed: false, reason: 'BENCHMARK_ONLY' }
  if (policy.disposition === 'GAP_DEFERRED') return { allowed: false, reason: 'CAPABILITY_DEFERRED' }
  if (policy.disposition === 'NOT_APPLICABLE') return { allowed: false, reason: 'CAPABILITY_NOT_APPLICABLE' }
  if (request.carriesSecrets && !policy.productionSecretsAllowed) return { allowed: false, reason: 'SECRETS_FORBIDDEN' }
  if (request.requestsPersistentWrite && !policy.persistentWritesAllowed) return { allowed: false, reason: 'PERSISTENT_WRITE_FORBIDDEN' }

  if (request.targetUrl) {
    if (policy.networkAccess !== 'ALLOWLIST_ONLY') return { allowed: false, reason: 'NETWORK_FORBIDDEN' }
    let host: string
    try {
      host = new URL(request.targetUrl).hostname.toLowerCase()
    } catch {
      return { allowed: false, reason: 'INVALID_TARGET_URL' }
    }
    const allowed = (request.allowedHosts ?? []).some((candidate) => candidate.toLowerCase() === host)
    if (!allowed) return { allowed: false, reason: 'HOST_NOT_ALLOWLISTED' }
  }

  return { allowed: true, reason: 'BOUNDED_EXTENSION_ALLOWED' }
}
