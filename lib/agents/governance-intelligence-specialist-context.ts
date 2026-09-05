import { enrichOutputWithAIGovernanceIntelligence } from '@/lib/governance/ai-governance-intelligence'
import { buildGovernanceIntelligenceBrief } from '@/lib/governance/governance-intelligence-brief'

type JsonRecord = Record<string, any>

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function roleRecommendationCodes(agentKey: string) {
  if (agentKey === 'steward_agent') {
    return new Set(['REAL_GOVERNANCE_CORPUS_NOT_INGESTED', 'CONTROL_AUTHORITY_PENDING', 'OPEN_GOVERNANCE_CONTROL_FINDINGS'])
  }
  if (agentKey === 'governance_analyst_agent') {
    return new Set(['REAL_GOVERNANCE_CORPUS_NOT_INGESTED', 'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED', 'CONTROL_AUTHORITY_PENDING', 'OPEN_GOVERNANCE_CONTROL_FINDINGS', 'CONTROL_EVALUATION_ATTENTION'])
  }
  if (agentKey === 'architect_agent') {
    return new Set(['REAL_FIELD_LINEAGE_DATA_NOT_INGESTED', 'CONTROL_AUTHORITY_PENDING', 'OPEN_GOVERNANCE_CONTROL_FINDINGS'])
  }
  if (agentKey === 'investigator_agent') {
    return new Set(['REAL_FIELD_LINEAGE_DATA_NOT_INGESTED', 'OPEN_GOVERNANCE_CONTROL_FINDINGS', 'CONTROL_EVALUATION_ATTENTION'])
  }
  if (agentKey === 'executive_agent') {
    return new Set(['REAL_GOVERNANCE_CORPUS_NOT_INGESTED', 'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED', 'CONTROL_AUTHORITY_PENDING', 'OPEN_GOVERNANCE_CONTROL_FINDINGS', 'CONTROL_EVALUATION_ATTENTION'])
  }
  return new Set(['OPEN_GOVERNANCE_CONTROL_FINDINGS', 'CONTROL_EVALUATION_ATTENTION'])
}

function compactControl(control: JsonRecord) {
  return {
    id: control.id,
    control_key: control.control_key,
    name: control.name,
    control_type: control.control_type,
    severity: control.severity,
    lifecycle_status: control.lifecycle_status,
    review_status: control.review_status,
    authority_class: control.authority_class,
    reviewed_at: control.reviewed_at,
  }
}

function compactEvaluation(evaluation: JsonRecord) {
  return {
    id: evaluation.id,
    control_id: evaluation.control_id,
    scope_binding_id: evaluation.scope_binding_id,
    result: evaluation.result,
    score: evaluation.score,
    rationale: evaluation.rationale,
    evidence_count: evaluation.evidence_count,
    evaluated_by_type: evaluation.evaluated_by_type,
    evaluation_version: evaluation.evaluation_version,
    evaluated_at: evaluation.evaluated_at,
  }
}

function compactFinding(finding: JsonRecord) {
  return {
    id: finding.id,
    control_id: finding.control_id,
    evaluation_id: finding.evaluation_id,
    finding_key: finding.finding_key,
    status: finding.status,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    remediation: finding.remediation,
    first_detected_at: finding.first_detected_at,
    last_detected_at: finding.last_detected_at,
  }
}

function compactBrief(brief: JsonRecord) {
  const posture = record(brief.posture)
  return {
    generatedAt: brief.generatedAt,
    truthModel: brief.truthModel,
    readiness: brief.readiness,
    controlIntelligence: brief.controlIntelligence,
    posture: {
      summary: posture.summary,
      authoritativeActiveControls: array(posture.authoritativeActiveControls).slice(0, 50).map(compactControl),
      proposedNonAuthoritativeControls: array(posture.proposedNonAuthoritativeControls).slice(0, 50).map(compactControl),
      latestEvaluations: array(posture.latestEvaluations).slice(0, 100).map(compactEvaluation),
      openFindings: array(posture.openFindings).slice(0, 100).map(compactFinding),
    },
    recommendations: array(brief.recommendations).slice(0, 50),
    limitations: stringArray(brief.limitations),
  }
}

function intelligenceObservations(brief: JsonRecord) {
  const readiness = record(brief.readiness)
  const posture = record(record(brief.posture).summary)
  const controls = record(brief.controlIntelligence)
  const blockerCount = array(readiness.formalBlockers).length
  return [
    `Formal AI Governance Intelligence readiness is ${text(readiness.status) || 'UNKNOWN'} with ${blockerCount} persisted blocker(s).`,
    `${Number(posture.activeControls ?? 0)} control(s) are AUTHORITATIVE_ACTIVE; ${Number(posture.proposedControls ?? 0)} control proposal(s) are PROPOSED_NON_AUTHORITATIVE.`,
    `${Number(posture.openFindings ?? 0)} unresolved governance control finding(s) are present; latest control results include ${Number(posture.fail ?? 0)} FAIL and ${Number(posture.warn ?? 0)} WARN.`,
    `Continuous control reconciliation is ${controls.continuousReconciliationPresent === true ? 'present' : 'not verified'} with a ${Number(controls.reconciliationSloMinutes ?? 0)} minute evaluation SLO and ${Number(controls.staleEvaluationGaps ?? 0)} stale evaluation gap(s).`,
  ]
}

function roleRecommendations(agentKey: string, brief: JsonRecord) {
  const allowed = roleRecommendationCodes(agentKey)
  return array(brief.recommendations)
    .filter((item) => allowed.has(text(item.code)))
    .map((item) => ({
      ...item,
      source: 'GOVERNANCE_INTELLIGENCE_BRIEF',
      authority: 'DETERMINISTIC_PERSISTED_STATE',
    }))
}

export function composeSpecialistOutputWithGovernanceIntelligence(
  base: Record<string, unknown>,
  brief: Record<string, unknown>,
) {
  const agentKey = text(record(base.agent).key)
  if (!agentKey) return base

  const observations = [...stringArray(base.observations), ...intelligenceObservations(brief)]
  const recommendations = [...array(base.recommendations), ...roleRecommendations(agentKey, brief)]
  const specialist = record(base.specialist)
  const reasoningContract = record(base.reasoningContract)
  const evidenceOrder = stringArray(reasoningContract.evidenceOrder)
  const rules = stringArray(reasoningContract.rules)

  const governanceRules = [
    'Only AUTHORITATIVE_ACTIVE controls may support authoritative control conclusions.',
    'PROPOSED_NON_AUTHORITATIVE controls are proposals only and require governed human approval before they can be treated as authority.',
    'Formal blockers from the database verifier are readiness constraints and must not be inferred away.',
    'Do not fabricate missing enterprise policy approval, provenance, attestation, transformation lineage, evidence, or ownership.',
  ]

  return {
    ...base,
    reasoningContract: {
      ...reasoningContract,
      evidenceOrder: Array.from(new Set(['GOVERNANCE_INTELLIGENCE_BRIEF', ...evidenceOrder])),
      rules: Array.from(new Set([...rules, ...governanceRules])),
    },
    observations,
    recommendations,
    specialist: {
      ...specialist,
      observations,
      recommendations,
      governanceIntelligenceConsumed: true,
      controlAuthorityRule: 'ACTIVE_AND_APPROVED_ONLY',
    },
    governanceIntelligenceBrief: compactBrief(brief),
    evidence_sources: Array.from(new Set([...stringArray(base.evidence_sources), 'governance.verify_ai_governance_intelligence', 'governance.control_definitions', 'governance.control_evaluations', 'governance.governance_findings'])),
    limitations: Array.from(new Set([
      ...stringArray(base.limitations),
      'Pending governance controls remain non-authoritative and are not compliance assertions.',
      'Formal readiness blockers are copied from the database verifier and cannot be overridden by specialist reasoning.',
    ])),
  }
}

export async function enrichSpecialistOutputWithGovernanceIntelligence(input: {
  projectId: string
  output: Record<string, unknown>
}) {
  const [base, brief] = await Promise.all([
    enrichOutputWithAIGovernanceIntelligence(input.projectId, input.output),
    buildGovernanceIntelligenceBrief(input.projectId),
  ])
  return composeSpecialistOutputWithGovernanceIntelligence(base, brief)
}
