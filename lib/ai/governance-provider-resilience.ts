import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ProviderResiliencePolicyProvider,
  ProviderResilienceProfile,
} from './provider-resilience'

function profile(row: Record<string, unknown>): ProviderResilienceProfile {
  const regions = Array.isArray(row.data_residency_regions)
    ? row.data_residency_regions.map(String).map(value => value.trim().toUpperCase()).filter(Boolean)
    : []
  const securityTier = Number(row.security_tier)
  const governanceTier = Number(row.governance_tier)
  if (!Number.isInteger(securityTier) || securityTier < 0 || securityTier > 10) throw new Error('Invalid provider resilience security tier.')
  if (!Number.isInteger(governanceTier) || governanceTier < 0 || governanceTier > 10) throw new Error('Invalid provider resilience governance tier.')
  if (!regions.length) throw new Error('Provider resilience profile has no data residency regions.')

  return {
    projectId: String(row.project_id),
    aiSystemVersionId: String(row.ai_system_version_id),
    fallbackGroup: String(row.fallback_group ?? '').trim(),
    productionEligible: row.production_eligible === true,
    automaticFallbackEnabled: row.automatic_fallback_enabled === true,
    dataResidencyRegions: [...new Set(regions)].sort(),
    securityTier,
    governanceTier,
  }
}

export function createGovernanceProviderResiliencePolicyProvider(): ProviderResiliencePolicyProvider {
  const admin = createAdminClient()
  return {
    async resolveProfiles(input) {
      const projectId = input.projectId.trim()
      const versionIds = [...new Set(input.aiSystemVersionIds.map(value => value.trim()).filter(Boolean))]
      if (!projectId || versionIds.length === 0) return new Map()

      const { data, error } = await admin.schema('governance')
        .from('ai_provider_resilience_profile_effective')
        .select('project_id,ai_system_version_id,fallback_group,production_eligible,automatic_fallback_enabled,data_residency_regions,security_tier,governance_tier')
        .eq('project_id', projectId)
        .in('ai_system_version_id', versionIds)
      if (error) throw new Error(`Unable to resolve governed provider resilience profiles: ${error.message}`)

      return new Map((data ?? []).map(row => {
        const value = profile(row as Record<string, unknown>)
        return [value.aiSystemVersionId, value] as const
      }))
    },
  }
}
