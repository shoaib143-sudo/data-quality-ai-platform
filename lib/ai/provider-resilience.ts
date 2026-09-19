import type { ReasoningProvider, ReasoningRequest, ReasoningResult } from './reasoning-provider'

export type ProviderResilienceProfile = {
  projectId: string
  aiSystemVersionId: string
  fallbackGroup: string
  productionEligible: boolean
  automaticFallbackEnabled: boolean
  dataResidencyRegions: string[]
  securityTier: number
  governanceTier: number
}

export interface ProviderResiliencePolicyProvider {
  resolveProfiles(input: {
    projectId: string
    aiSystemVersionIds: string[]
  }): Promise<Map<string, ProviderResilienceProfile>>
}

export type ResilientProviderCandidate = {
  provider: ReasoningProvider
  modelName: string
  aiSystemVersionId: string
  profile: ProviderResilienceProfile
}

function normalizedRegions(profile: ProviderResilienceProfile) {
  return new Set(profile.dataResidencyRegions.map(region => region.trim().toUpperCase()).filter(Boolean))
}

export function isAutomaticFallbackEligible(
  primary: ProviderResilienceProfile,
  fallback: ProviderResilienceProfile,
) {
  if (primary.aiSystemVersionId === fallback.aiSystemVersionId) return false
  if (!primary.productionEligible || !fallback.productionEligible) return false
  if (!primary.automaticFallbackEnabled || !fallback.automaticFallbackEnabled) return false
  if (!primary.fallbackGroup.trim() || primary.fallbackGroup.trim() !== fallback.fallbackGroup.trim()) return false
  if (fallback.securityTier < primary.securityTier) return false
  if (fallback.governanceTier < primary.governanceTier) return false

  const primaryRegions = normalizedRegions(primary)
  const fallbackRegions = normalizedRegions(fallback)
  if (!primaryRegions.size || !fallbackRegions.size) return false
  for (const region of fallbackRegions) if (!primaryRegions.has(region)) return false
  return true
}

function fallbackReason(error: unknown) {
  if (error instanceof Error && error.name === 'ReasoningProviderHttpError') {
    const status = Number((error as Error & { status?: unknown }).status)
    if ([408, 429, 500, 502, 503, 504].includes(status)) return `HTTP_${status}`
    return null
  }
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return 'TIMEOUT'
  if (error instanceof TypeError) return 'NETWORK_ERROR'
  return null
}

export class ResilientReasoningProvider implements ReasoningProvider {
  readonly id: string
  private readonly primary: ResilientProviderCandidate
  private readonly fallbacks: ResilientProviderCandidate[]

  constructor(primary: ResilientProviderCandidate, fallbacks: ResilientProviderCandidate[]) {
    this.primary = primary
    this.fallbacks = fallbacks.filter(candidate => isAutomaticFallbackEligible(primary.profile, candidate.profile))
    this.id = primary.provider.id
  }

  async generateJson(request: ReasoningRequest): Promise<ReasoningResult> {
    try {
      const result = await this.primary.provider.generateJson(request)
      return {
        ...result,
        resilience: {
          requestedProvider: this.primary.provider.id,
          requestedModel: this.primary.modelName,
          actualProvider: result.provider,
          actualModel: result.model,
          fallbackApplied: false,
          fallbackReason: null,
          attempts: 1,
        },
      }
    } catch (primaryError) {
      const reason = fallbackReason(primaryError)
      if (!reason || this.fallbacks.length === 0) throw primaryError

      let lastError: unknown = primaryError
      let attempts = 1
      for (const candidate of this.fallbacks) {
        attempts += 1
        try {
          const result = await candidate.provider.generateJson(request)
          return {
            ...result,
            resilience: {
              requestedProvider: this.primary.provider.id,
              requestedModel: this.primary.modelName,
              actualProvider: result.provider,
              actualModel: result.model,
              fallbackApplied: true,
              fallbackReason: reason,
              attempts,
            },
          }
        } catch (error) {
          lastError = error
          if (!fallbackReason(error)) throw error
        }
      }
      throw lastError
    }
  }
}
