import type { ReadinessUseCase } from './unified-readiness-framework.ts'
import type { CapabilityReadiness } from './unified-readiness-engine.ts'

export type ReadinessLens = {
  id: ReadinessUseCase | 'DATA_READINESS' | 'GOVERNANCE_READINESS'
  requiredDimensions: readonly string[]
  criticalCapabilityIds: readonly string[]
}

export const READINESS_LENSES: readonly ReadinessLens[] = [
  { id:'DATA_READINESS', requiredDimensions:['discoverability','quality','semantics','access','governance','trust','observability'], criticalCapabilityIds:['URA-QUAL-DQ-001','URA-GOV-POLICY-001','URA-TRUST-LINEAGE-001'] },
  { id:'GOVERNANCE_READINESS', requiredDimensions:['strategy','governance','trust','people'], criticalCapabilityIds:['URA-GOV-POLICY-001'] },
  { id:'ANALYTICS_BI', requiredDimensions:['discoverability','quality','semantics','access','governance','trust'], criticalCapabilityIds:['URA-QUAL-DQ-001','URA-GOV-POLICY-001'] },
  { id:'PREDICTIVE_ML', requiredDimensions:['quality','semantics','governance','trust','ai-governance','observability'], criticalCapabilityIds:['URA-QUAL-DQ-001','URA-TRUST-LINEAGE-001','URA-AIGOV-RISK-001'] },
  { id:'GENERATIVE_AI', requiredDimensions:['discoverability','quality','semantics','access','governance','trust','ai-governance','observability'], criticalCapabilityIds:['URA-SEM-GROUNDING-001','URA-GOV-POLICY-001','URA-TRUST-LINEAGE-001','URA-AIGOV-RISK-001','URA-OBS-DRIFT-001'] },
  { id:'RAG_ENTERPRISE_SEARCH', requiredDimensions:['discoverability','quality','semantics','access','governance','trust','observability'], criticalCapabilityIds:['URA-SEM-GROUNDING-001','URA-GOV-POLICY-001','URA-TRUST-LINEAGE-001'] },
  { id:'AI_COPILOT', requiredDimensions:['quality','semantics','governance','trust','ai-governance','observability'], criticalCapabilityIds:['URA-GOV-POLICY-001','URA-TRUST-LINEAGE-001','URA-AIGOV-RISK-001'] },
  { id:'AUTONOMOUS_AGENT', requiredDimensions:['quality','semantics','access','governance','trust','ai-governance','observability'], criticalCapabilityIds:['URA-GOV-POLICY-001','URA-TRUST-LINEAGE-001','URA-AIGOV-RISK-001','URA-OBS-DRIFT-001'] },
  { id:'MULTI_AGENT', requiredDimensions:['quality','semantics','access','governance','trust','ai-governance','observability'], criticalCapabilityIds:['URA-GOV-POLICY-001','URA-TRUST-LINEAGE-001','URA-AIGOV-RISK-001','URA-OBS-DRIFT-001'] },
  { id:'CUSTOM', requiredDimensions:[], criticalCapabilityIds:[] },
]

export function evaluateLens(lens: ReadinessLens, results: readonly CapabilityReadiness[]) {
  const byId = new Map(results.map(result => [result.capabilityId, result]))
  const critical = lens.criticalCapabilityIds.map(id => byId.get(id)).filter(Boolean) as CapabilityReadiness[]
  const failed = critical.filter(result => result.gate === 'NOT_CLEARED')
  const unknown = critical.filter(result => result.gate === 'UNKNOWN' || result.gate === 'CONDITIONAL')
  return { lensId:lens.id, gate: failed.length ? 'NOT_CLEARED' : unknown.length ? 'CONDITIONAL' : 'CLEARED', failed:failed.map(x=>x.capabilityId), unresolved:unknown.map(x=>x.capabilityId) }
}
