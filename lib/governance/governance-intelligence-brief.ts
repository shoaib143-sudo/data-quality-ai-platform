import { createAdminClient } from '@/lib/supabase/admin'
import { loadProjectAIGovernanceIntelligence } from '@/lib/governance/ai-governance-intelligence'

type JsonRecord = Record<string, any>

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function blockerAction(code: string) {
  if (code === 'REAL_GOVERNANCE_CORPUS_NOT_INGESTED') {
    return {
      action: 'Complete provenance and authorized human approval for a genuine enterprise governance source before treating derived controls as authoritative.',
      executionBoundary: 'HUMAN_AUTHORITY_REQUIRED',
    }
  }
  if (code === 'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED') {
    return {
      action: 'Ingest genuine transformation metadata that identifies real source and target fields through the governed lineage ingestion boundary.',
      executionBoundary: 'EXTERNAL_SOURCE_ARTIFACT_REQUIRED',
    }
  }
  return {
    action: 'Resolve the persisted formal gate blocker before asserting full AI Governance Intelligence readiness.',
    executionBoundary: 'FORMAL_BLOCKER',
  }
}

export async function buildGovernanceIntelligenceBrief(projectId: string) {
  const admin = createAdminClient()
  const [intelligence, gateResult] = await Promise.all([
    loadProjectAIGovernanceIntelligence(projectId),
    admin.schema('governance').rpc('verify_ai_governance_intelligence', { p_project_id: projectId }),
  ])
  if (gateResult.error) throw new Error(`Unable to verify AI Governance Intelligence: ${gateResult.error.message}`)

  const gate = record(gateResult.data)
  const checks = record(gate.checks)
  const controlGate = record(checks.governance_control_intelligence)
  const controls = intelligence.controlPosture.controls as JsonRecord[]
  const activeControls = controls.filter((control) => text(control.lifecycle_status).toUpperCase() === 'ACTIVE' && text(control.review_status).toUpperCase() === 'APPROVED')
  const proposedControls = controls.filter((control) => text(control.lifecycle_status).toUpperCase() === 'PROPOSED')
  const blockers = array(gate.blockers)
  const openFindings = intelligence.controlPosture.openFindings as JsonRecord[]
  const latestEvaluations = intelligence.controlPosture.latestEvaluations as JsonRecord[]

  const recommendations: JsonRecord[] = blockers.map((blocker) => {
    const code = text(blocker.code)
    return { priority: 'BLOCKER', code, ...blockerAction(code) }
  })

  if (openFindings.length) {
    recommendations.push({
      priority: 'HIGH',
      code: 'OPEN_GOVERNANCE_CONTROL_FINDINGS',
      action: `Investigate and remediate ${openFindings.length} unresolved governance control finding(s) using their persisted evaluation and issue evidence.`,
      executionBoundary: 'GOVERNED_REMEDIATION',
    })
  }

  if (proposedControls.length && activeControls.length === 0) {
    recommendations.push({
      priority: 'GOVERNANCE_REVIEW',
      code: 'CONTROL_AUTHORITY_PENDING',
      action: `${proposedControls.length} control proposal(s) exist but remain non-authoritative until their source governance authority and control review requirements are satisfied.`,
      executionBoundary: 'HUMAN_APPROVAL_REQUIRED',
    })
  }

  const failingEvaluations = latestEvaluations.filter((evaluation) => ['FAIL', 'WARN'].includes(text(evaluation.result).toUpperCase()))
  if (failingEvaluations.length && !openFindings.length) {
    recommendations.push({
      priority: 'HIGH',
      code: 'CONTROL_EVALUATION_ATTENTION',
      action: `${failingEvaluations.length} latest control evaluation(s) require attention; reconcile their persisted finding lifecycle before considering the posture healthy.`,
      executionBoundary: 'GOVERNED_INVESTIGATION',
    })
  }

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    truthModel: {
      authoritativeStore: 'POSTGRES_GOVERNANCE_PLANE',
      controlAuthorityRule: 'ACTIVE_AND_APPROVED_ONLY',
      proposedControlLabel: 'PROPOSED_NON_AUTHORITATIVE',
      activeControlLabel: 'AUTHORITATIVE_ACTIVE',
      policyFactsGeneratedByAI: false,
      complianceClaimsGeneratedByAI: false,
    },
    readiness: {
      status: text(gate.status),
      failureCount: Number(gate.failure_count ?? 0),
      partialOrExternalCount: Number(gate.partial_or_external_count ?? 0),
      formalBlockers: blockers,
    },
    controlIntelligence: {
      status: text(controlGate.status),
      mode: text(controlGate.mode),
      continuousReconciliationPresent: controlGate.continuous_reconciliation_present === true,
      automatedEvidenceCollectorPresent: controlGate.automated_evidence_collector_present === true,
      controlIssueProjectionPresent: controlGate.control_issue_projection_present === true,
      reconciliationSloMinutes: Number(controlGate.reconciliation_slo_minutes ?? 0),
      staleEvaluationGaps: Number(controlGate.stale_evaluation_gaps ?? 0),
      lifecycleViolations: Number(controlGate.lifecycle_violations ?? 0),
    },
    posture: {
      summary: intelligence.controlPosture.summary,
      authoritativeActiveControls: activeControls,
      proposedNonAuthoritativeControls: proposedControls,
      latestEvaluations,
      openFindings,
    },
    certificationReadiness: intelligence.certificationReadiness,
    governanceValue: intelligence.governanceValue,
    recommendations,
    limitations: [
      'Pending or proposed controls are not compliance assertions and must not be presented as authoritative policy controls.',
      'This brief does not fabricate missing enterprise policy approval, provenance, attestation, transformation lineage, evidence, or ownership.',
      'Formal blocker status is copied from the database verifier and remains authoritative for production readiness decisions.',
      'Recommendations are deterministic mappings from persisted blocker, finding, evaluation, and control lifecycle state.',
    ],
  }
}
