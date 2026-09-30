import type { ProviderCapability, CapabilityMode } from './sdk/capability'

export type SemanticLoss = 'EXACT' | 'APPROXIMATED' | 'UNSUPPORTED'

export type CapabilityResolution = {
  capability: string
  mode: CapabilityMode
  semanticLoss: SemanticLoss
  providerCapability: ProviderCapability | null
  executable: boolean
  reason: string | null
}

export function resolveProviderCapability(
  capabilities: ProviderCapability[],
  capability: string,
  mode: CapabilityMode,
): CapabilityResolution {
  const normalized = capability.trim().toLowerCase()
  const candidate = capabilities.find(item => item.capability.trim().toLowerCase() === normalized) ?? null
  if (!candidate || candidate.support === 'UNSUPPORTED') {
    return { capability, mode, semanticLoss: 'UNSUPPORTED', providerCapability: candidate, executable: false, reason: 'Provider does not support the requested semantic capability.' }
  }
  if (!candidate.modes.includes(mode)) {
    return { capability, mode, semanticLoss: 'UNSUPPORTED', providerCapability: candidate, executable: false, reason: `Provider capability does not support ${mode}.` }
  }
  if (candidate.support === 'READ_ONLY' && mode !== 'READ') {
    return { capability, mode, semanticLoss: 'UNSUPPORTED', providerCapability: candidate, executable: false, reason: 'Provider capability is read only.' }
  }
  return {
    capability,
    mode,
    semanticLoss: candidate.support === 'PARTIAL' ? 'APPROXIMATED' : 'EXACT',
    providerCapability: candidate,
    executable: true,
    reason: candidate.support === 'PARTIAL' ? (candidate.limitations?.join(' ') || 'Provider implements this capability partially.') : null,
  }
}
