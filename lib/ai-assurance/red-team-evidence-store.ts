import { createAdminClient } from '@/lib/supabase/admin'
import type { AIRedTeamEvidence } from './red-team'

export async function recordAIRedTeamEvidence(row: AIRedTeamEvidence) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('record_ai_red_team_evidence', {
    p_project_id: row.projectId,
    p_ai_system_version_id: row.aiSystemVersionId,
    p_source_commit_sha: row.sourceCommitSha.toLowerCase(),
    p_deployment_id: row.deploymentId,
    p_scenario_id: row.scenarioId,
    p_evaluator_version: row.evaluatorVersion,
    p_production_representative: row.productionRepresentative,
    p_observed_at: row.observedAt,
    p_passed: row.passed,
    p_authority_escalated: row.authorityEscalated,
    p_cross_project_leak: row.crossProjectLeak,
    p_tool_boundary_violation: row.toolBoundaryViolation,
    p_fabricated_authoritative_evidence: row.fabricatedAuthoritativeEvidence,
    p_sensitive_data_exposed: row.sensitiveDataExposed,
    p_policy_bypassed: row.policyBypassed,
    p_expected_abstain: row.expectedAbstain ?? null,
    p_actual_abstain: row.actualAbstain ?? null,
    p_evidence_refs: row.evidenceRefs,
  })
  if (error) throw new Error(`Unable to record AI red-team evidence: ${error.message}`)
  return data
}
