import type { ReadinessCapability } from './unified-readiness-framework.ts'
import type { CapabilityReadiness } from './unified-readiness-engine.ts'

export type ReadinessActionProposal = {
  capabilityId: string
  title: string
  rationale: string
  dataNexusAction: string
  requiresAuthorization: true
  autoExecute: false
  priority: 'CRITICAL' | 'HIGH' | 'STANDARD'
}

export function proposeReadinessActions(capabilities: readonly ReadinessCapability[], results: readonly CapabilityReadiness[]): ReadinessActionProposal[] {
  const byId = new Map(capabilities.map(capability => [capability.id, capability]))
  return results.filter(result => result.gate === 'NOT_CLEARED').flatMap(result => {
    const capability = byId.get(result.capabilityId)
    if (!capability) return []
    return [{
      capabilityId: capability.id,
      title: `Improve ${capability.label}`,
      rationale: capability.recommendedAction,
      dataNexusAction: capability.dataNexusAction,
      requiresAuthorization: true as const,
      autoExecute: false as const,
      priority: capability.criticality === 'CRITICAL' ? 'CRITICAL' as const : capability.criticality === 'HIGH' ? 'HIGH' as const : 'STANDARD' as const,
    }]
  })
}
