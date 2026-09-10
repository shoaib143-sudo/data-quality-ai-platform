export const GOVERNANCE_TRUTH_CLASSES = [
  'AUTHORITATIVE_FACT',
  'OBSERVED_EVIDENCE',
  'DERIVED_INTELLIGENCE',
  'GOVERNED_DECISION',
] as const

export type GovernanceTruthClass = (typeof GOVERNANCE_TRUTH_CLASSES)[number]

export const CONTROL_ENFORCEMENT_MODES = ['OBSERVE', 'ADVISE', 'ENFORCE'] as const
export type ControlEnforcementMode = (typeof CONTROL_ENFORCEMENT_MODES)[number]

export const CONTROL_EFFECTIVENESS_STATES = [
  'EFFECTIVE',
  'PARTIAL',
  'INEFFECTIVE',
  'NOT_ASSESSED',
] as const
export type ControlEffectivenessState = (typeof CONTROL_EFFECTIVENESS_STATES)[number]

export const EVIDENCE_FRESHNESS_STATES = ['CURRENT', 'STALE', 'EXPIRED', 'UNKNOWN'] as const
export type EvidenceFreshnessState = (typeof EVIDENCE_FRESHNESS_STATES)[number]

export const JOURNEY_ACCEPTANCE_PATHS = ['NORMAL', 'UNAUTHORIZED', 'DEGRADED'] as const
export type JourneyAcceptancePath = (typeof JOURNEY_ACCEPTANCE_PATHS)[number]

export type TrustedEvidenceReference = {
  truthClass: GovernanceTruthClass
  objectType: string
  objectId: string
  versionId?: string | null
  observedAt?: string | null
  effectiveFrom?: string | null
  effectiveTo?: string | null
  evidenceHash?: string | null
}

export type TrustedControlAssessment = {
  controlKey: string
  enforcementMode: ControlEnforcementMode
  designEffectiveness: ControlEffectivenessState
  operatingEffectiveness: ControlEffectivenessState
  evidenceFreshness: EvidenceFreshnessState
  evidence: TrustedEvidenceReference[]
}

export type TrustedJourneyAcceptance = {
  journeyKey: string
  path: JourneyAcceptancePath
  passed: boolean
  evidence: TrustedEvidenceReference[]
}

export function assertGovernanceTruthClass(value: string): asserts value is GovernanceTruthClass {
  if (!(GOVERNANCE_TRUTH_CLASSES as readonly string[]).includes(value)) {
    throw new Error(`Unsupported governance truth class: ${value}`)
  }
}

export function assertControlEnforcementMode(value: string): asserts value is ControlEnforcementMode {
  if (!(CONTROL_ENFORCEMENT_MODES as readonly string[]).includes(value)) {
    throw new Error(`Unsupported control enforcement mode: ${value}`)
  }
}

export function validateEvidenceReference(reference: TrustedEvidenceReference): void {
  assertGovernanceTruthClass(reference.truthClass)
  if (!reference.objectType.trim()) throw new Error('Evidence objectType is required')
  if (!reference.objectId.trim()) throw new Error('Evidence objectId is required')
  if (reference.effectiveFrom && reference.effectiveTo) {
    const from = Date.parse(reference.effectiveFrom)
    const to = Date.parse(reference.effectiveTo)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      throw new Error('Evidence effective interval is invalid')
    }
  }
}

export function validateTrustedControlAssessment(assessment: TrustedControlAssessment): void {
  if (!assessment.controlKey.trim()) throw new Error('controlKey is required')
  assertControlEnforcementMode(assessment.enforcementMode)
  if (!(CONTROL_EFFECTIVENESS_STATES as readonly string[]).includes(assessment.designEffectiveness)) {
    throw new Error(`Unsupported design effectiveness: ${assessment.designEffectiveness}`)
  }
  if (!(CONTROL_EFFECTIVENESS_STATES as readonly string[]).includes(assessment.operatingEffectiveness)) {
    throw new Error(`Unsupported operating effectiveness: ${assessment.operatingEffectiveness}`)
  }
  if (!(EVIDENCE_FRESHNESS_STATES as readonly string[]).includes(assessment.evidenceFreshness)) {
    throw new Error(`Unsupported evidence freshness: ${assessment.evidenceFreshness}`)
  }
  for (const reference of assessment.evidence) validateEvidenceReference(reference)
}
