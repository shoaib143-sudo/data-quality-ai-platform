export type CapabilityDomain =
  | 'SOURCE_ONBOARDING'
  | 'CATALOG'
  | 'PROFILING'
  | 'DATA_QUALITY'
  | 'CLASSIFICATION'
  | 'LINEAGE'
  | 'GOVERNANCE'
  | 'REMEDIATION'
  | 'AI_AGENTS'
  | 'RETRIEVAL'
  | 'MODEL_RUNTIME'
  | 'EVALUATION'
  | 'OBSERVABILITY'
  | 'SECURITY'
  | 'RECOVERY'
  | 'CERTIFICATION'

export type CapabilityOutcome =
  | 'EXECUTED_AND_PASSED'
  | 'EXECUTED_AND_FAILED'
  | 'BLOCKED_POLICY'
  | 'BLOCKED_EXTERNAL'
  | 'NOT_APPLICABLE'
  | 'NOT_MEASURED'

export type CapabilityDescriptor = {
  capabilityKey: string
  domain: CapabilityDomain
  version: string
  mandatoryForE2E: boolean
  executorType: 'AGENT' | 'TOOL' | 'WORKFLOW' | 'MODEL' | 'RETRIEVAL' | 'CERTIFIER'
  executorKey: string
  requiredCapability: string | null
  riskTier: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  dependencies: string[]
  evidenceContract: string[]
  certificationGate: string | null
  enabled: boolean
}

export type CapabilityResult = {
  capabilityKey: string
  outcome: CapabilityOutcome
  evidenceRefs: string[]
  reason: string | null
}

export type CoverageSummary = {
  mandatory: number
  accounted: number
  executed: number
  passed: number
  failed: number
  blocked: number
  notApplicable: number
  notMeasured: number
  unaccounted: number
  accountingCoveragePct: number
  executionCoveragePct: number
  certificationEligible: boolean
}

export function summarizeCapabilityCoverage(
  descriptors: CapabilityDescriptor[],
  results: CapabilityResult[],
): CoverageSummary {
  const mandatoryDescriptors = descriptors.filter(item => item.enabled && item.mandatoryForE2E)
  const mandatoryKeys = new Set(mandatoryDescriptors.map(item => item.capabilityKey))
  const byKey = new Map(results.filter(item => mandatoryKeys.has(item.capabilityKey)).map(item => [item.capabilityKey, item]))

  const mandatory = mandatoryDescriptors.length
  const accounted = byKey.size
  const passed = [...byKey.values()].filter(item => item.outcome === 'EXECUTED_AND_PASSED').length
  const failed = [...byKey.values()].filter(item => item.outcome === 'EXECUTED_AND_FAILED').length
  const blocked = [...byKey.values()].filter(item => item.outcome === 'BLOCKED_POLICY' || item.outcome === 'BLOCKED_EXTERNAL').length
  const notApplicable = [...byKey.values()].filter(item => item.outcome === 'NOT_APPLICABLE').length
  const notMeasured = [...byKey.values()].filter(item => item.outcome === 'NOT_MEASURED').length
  const executed = passed + failed
  const unaccounted = Math.max(0, mandatory - accounted)

  return {
    mandatory,
    accounted,
    executed,
    passed,
    failed,
    blocked,
    notApplicable,
    notMeasured,
    unaccounted,
    accountingCoveragePct: mandatory === 0 ? 100 : (accounted / mandatory) * 100,
    executionCoveragePct: mandatory === 0 ? 100 : (executed / mandatory) * 100,
    certificationEligible:
      mandatory === accounted && failed === 0 && blocked === 0 && notMeasured === 0,
  }
}

export function assertNoUnregisteredMandatoryCapabilities(
  discoveredKeys: string[],
  registered: CapabilityDescriptor[],
): string[] {
  const registeredKeys = new Set(registered.filter(item => item.enabled).map(item => item.capabilityKey))
  return discoveredKeys.filter(key => !registeredKeys.has(key)).sort()
}
