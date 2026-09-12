export type AccessibilityState = 'NOT_MEASURED' | 'PASS' | 'FAIL'

export const ACCESSIBILITY_PERSONAS = [
  'senior-leadership','business-user','data-owner','data-product-owner','data-steward','data-governance-specialist',
  'compliance-risk-officer','privacy-security-officer','data-governance-admin','data-custodian','source-system-owner',
  'metadata-analyst','data-quality-analyst'
] as const

export const REQUIRED_MANUAL_CHECKS = [
  'KEYBOARD_ONLY','SCREEN_READER','FOCUS_ORDER','DIALOG_FOCUS_TRAP','ZOOM_200','ZOOM_400','NARROW_VIEWPORT',
  'DYNAMIC_STATUS_ANNOUNCEMENT','FORM_ERROR_RECOVERY','COMPLEX_TABLE_OR_GRAPH_ALTERNATIVE'
] as const

export const REQUIRED_AUTOMATED_CHECKS = ['SEMANTIC_HTML','ARIA_VALIDITY','COLOR_CONTRAST','LANDMARK_STRUCTURE'] as const
export const ACCESSIBILITY_MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000

export type PersonaAccessibilityEvidence = {
  persona: string
  surfaceId: string
  route: string
  observedAt: string
  productionRepresentative: boolean
  automatedPassed: string[]
  manualPassed: string[]
  failures: string[]
}

export type AccessibilityCoverageRequirement = { persona: string; surfaceId: string }

export function evaluatePersonaAccessibility(
  evidence: PersonaAccessibilityEvidence[],
  requiredCoverage: AccessibilityCoverageRequirement[],
  nowMs = Date.now(),
) {
  if (evidence.length === 0) return { state: 'NOT_MEASURED' as const, blockers: ['NO_ACCESSIBILITY_EVIDENCE'] }
  if (requiredCoverage.length === 0) return { state: 'NOT_MEASURED' as const, blockers: ['NO_REQUIRED_SURFACE_INVENTORY'] }

  const blockers: string[] = []
  const requiredPersonas = new Set(requiredCoverage.map((item) => item.persona))
  for (const persona of ACCESSIBILITY_PERSONAS) {
    if (!requiredPersonas.has(persona)) blockers.push(`PERSONA_${persona}_COVERAGE_NOT_DECLARED`)
  }

  for (const requirement of requiredCoverage) {
    if (!ACCESSIBILITY_PERSONAS.includes(requirement.persona as (typeof ACCESSIBILITY_PERSONAS)[number])) {
      blockers.push(`UNKNOWN_PERSONA_${requirement.persona}`)
      continue
    }
    if (!requirement.surfaceId.trim()) {
      blockers.push(`PERSONA_${requirement.persona}_SURFACE_ID_MISSING`)
      continue
    }

    const rows = evidence.filter((item) =>
      item.persona === requirement.persona
      && item.surfaceId === requirement.surfaceId
      && item.productionRepresentative,
    )
    const prefix = `PERSONA_${requirement.persona}_SURFACE_${requirement.surfaceId}`
    if (rows.length === 0) {
      blockers.push(`${prefix}_NOT_MEASURED`)
      continue
    }

    for (const row of rows) {
      if (!row.route.trim()) blockers.push(`${prefix}_ROUTE_MISSING`)
      const observedMs = Date.parse(row.observedAt)
      if (!Number.isFinite(observedMs)) blockers.push(`${prefix}_TIMESTAMP_INVALID`)
      else {
        if (observedMs > nowMs + 5 * 60 * 1000) blockers.push(`${prefix}_TIMESTAMP_FUTURE`)
        if (nowMs - observedMs > ACCESSIBILITY_MAX_EVIDENCE_AGE_MS) blockers.push(`${prefix}_EVIDENCE_STALE`)
      }
      for (const check of REQUIRED_AUTOMATED_CHECKS) if (!row.automatedPassed.includes(check)) blockers.push(`${prefix}_AUTOMATED_${check}_MISSING`)
      for (const check of REQUIRED_MANUAL_CHECKS) if (!row.manualPassed.includes(check)) blockers.push(`${prefix}_MANUAL_${check}_MISSING`)
      if (row.failures.length > 0) blockers.push(`${prefix}_HAS_FAILURES`)
    }
  }

  return { state: blockers.length === 0 ? 'PASS' as const : 'FAIL' as const, blockers: [...new Set(blockers)] }
}
