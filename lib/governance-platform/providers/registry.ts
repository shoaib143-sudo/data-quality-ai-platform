import type { GovernanceProvider } from './sdk/provider.ts'
import { assertProviderManifestConformance } from './conformance.ts'

const providers = new Map<string, GovernanceProvider>()

export function registerGovernanceProvider(provider: GovernanceProvider) {
  const manifest=assertProviderManifestConformance(provider.manifest())
  const key = manifest.provider.trim().toLowerCase()
  if (!key) throw new Error('Governance provider name is required.')
  if (providers.has(key)) throw new Error(`Governance provider "${key}" is already registered.`)
  providers.set(key, provider)
  return provider
}

export function getGovernanceProvider(provider: string) {
  return providers.get(provider.trim().toLowerCase()) ?? null
}

export function listGovernanceProviders() {
  return [...providers.values()].map(provider => provider.manifest())
}

export function clearGovernanceProvidersForTests() {
  providers.clear()
}
