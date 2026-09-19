import fs from 'node:fs'
import path from 'node:path'

function read(relative) { return fs.readFileSync(path.join(process.cwd(), relative), 'utf8') }
function requireText(source, text, message) { if (!source.includes(text)) throw new Error(message) }

const migration = read('supabase/migrations/20260919124000_provider_resilience_profiles.sql')
const policy = read('lib/ai/provider-resilience.ts')
const router = read('lib/ai/intelligent-router.ts')
const governance = read('lib/ai/governance-intelligent-router.ts')
const observable = read('lib/ai/observable-intelligent-router.ts')

for (const token of [
  'ai_provider_resilience_profile_versions',
  'fallback_group',
  'production_eligible',
  'automatic_fallback_enabled',
  'data_residency_regions',
  'security_tier',
  'governance_tier',
  'policy.approve',
  'append-only governance evidence',
]) requireText(migration, token, `Provider resilience migration missing ${token}`)

requireText(policy, 'isAutomaticFallbackEligible', 'Fallback equivalence must be deterministic.')
requireText(policy, 'fallback.securityTier < primary.securityTier', 'Fallback security tier cannot weaken.')
requireText(policy, 'fallback.governanceTier < primary.governanceTier', 'Fallback governance tier cannot weaken.')
requireText(policy, 'primaryRegions.has(region)', 'Fallback residency must be equal or stricter.')
requireText(policy, "[408, 429, 500, 502, 503, 504]", 'Only bounded transient provider HTTP failures may trigger fallback.')
requireText(router, 'ResilientReasoningProvider', 'Intelligent Router must compose governed failover.')
requireText(router, 'resiliencePolicy.resolveProfiles', 'Router must resolve exact version resilience profiles.')
requireText(governance, 'createGovernanceProviderResiliencePolicyProvider()', 'Production router must use governed resilience profiles.')
requireText(observable, 'resilience_requested_provider', 'Telemetry must record requested provider.')
requireText(observable, 'resilience_actual_provider', 'Telemetry must record actual provider.')
requireText(observable, 'resilience_fallback_reason', 'Telemetry must record fallback reason.')

for (const forbidden of [
  /fallback\.securityTier\s*>\s*primary\.securityTier/,
  /fallback\.governanceTier\s*>\s*primary\.governanceTier/,
]) {
  if (forbidden.test(policy)) throw new Error(`Unsafe provider resilience pattern: ${forbidden}`)
}

console.log('Runtime v2 governed provider resilience contract verified.')
