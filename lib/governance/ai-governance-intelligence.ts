import { createAdminClient } from '@/lib/supabase/admin'

type ControlPosture = {
  summary: {
    proposedControls: number
    activeControls: number
    pendingReviewControls: number
    openFindings: number
    pass: number
    warn: number
    fail: number
    unknown: number
  }
  controls: Array<Record<string, unknown>>
  latestEvaluations: Array<Record<string, unknown>>
  openFindings: Array<Record<string, unknown>>
}

export type AIGovernanceIntelligence = {
  certificationReadiness: Array<Record<string, unknown>>
  governanceValue: Record<string, unknown> | null
  controlPosture: ControlPosture
}

function latestPerControlScope(rows: Array<Record<string, any>>) {
  const latest = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const key = `${String(row.control_id)}:${row.scope_binding_id ? String(row.scope_binding_id) : 'PROJECT'}`
    if (!latest.has(key)) latest.set(key, row)
  }
  return Array.from(latest.values())
}

export async function loadProjectAIGovernanceIntelligence(projectId: string): Promise<AIGovernanceIntelligence> {
  const admin = createAdminClient()
  const [readinessResult, roiResult, controlsResult, evaluationsResult, findingsResult] = await Promise.all([
    admin.schema('governance').from('certification_readiness')
      .select('dataset_id,readiness_score,readiness_status,blockers,evidence,assessed_at')
      .eq('project_id', projectId)
      .order('readiness_score', { ascending: true })
      .limit(500),
    admin.schema('governance').from('governance_roi_snapshots')
      .select('value_score,confidence,metrics,limitations,calculated_at')
      .eq('project_id', projectId)
      .maybeSingle(),
    admin.schema('governance').from('control_definitions')
      .select('id,control_key,name,description,control_type,evaluation_method,severity,lifecycle_status,review_status,authority_class,reviewed_at,updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(500),
    admin.schema('governance').from('control_evaluations')
      .select('id,control_id,scope_binding_id,result,score,rationale,evidence_count,evaluated_by_type,evaluation_version,evaluated_at')
      .eq('project_id', projectId)
      .order('evaluated_at', { ascending: false })
      .limit(1000),
    admin.schema('governance').from('governance_findings')
      .select('id,control_id,evaluation_id,finding_key,status,severity,title,description,remediation,first_detected_at,last_detected_at,updated_at')
      .eq('project_id', projectId)
      .in('status', ['OPEN', 'ACKNOWLEDGED'])
      .order('last_detected_at', { ascending: false })
      .limit(500),
  ])
  if (readinessResult.error) throw new Error(`Unable to load certification readiness intelligence: ${readinessResult.error.message}`)
  if (roiResult.error) throw new Error(`Unable to load governance value intelligence: ${roiResult.error.message}`)
  if (controlsResult.error) throw new Error(`Unable to load governance control definitions: ${controlsResult.error.message}`)
  if (evaluationsResult.error) throw new Error(`Unable to load governance control evaluations: ${evaluationsResult.error.message}`)
  if (findingsResult.error) throw new Error(`Unable to load governance control findings: ${findingsResult.error.message}`)

  const controls = (controlsResult.data ?? []) as Array<Record<string, any>>
  const latestEvaluations = latestPerControlScope((evaluationsResult.data ?? []) as Array<Record<string, any>>)
  const openFindings = (findingsResult.data ?? []) as Array<Record<string, unknown>>
  const countResult = (result: string) => latestEvaluations.filter((row) => String(row.result).toUpperCase() === result).length

  return {
    certificationReadiness: (readinessResult.data ?? []) as Array<Record<string, unknown>>,
    governanceValue: roiResult.data as Record<string, unknown> | null,
    controlPosture: {
      summary: {
        proposedControls: controls.filter((row) => String(row.lifecycle_status).toUpperCase() === 'PROPOSED').length,
        activeControls: controls.filter((row) => String(row.lifecycle_status).toUpperCase() === 'ACTIVE' && String(row.review_status).toUpperCase() === 'APPROVED').length,
        pendingReviewControls: controls.filter((row) => String(row.review_status).toUpperCase() === 'PENDING').length,
        openFindings: openFindings.length,
        pass: countResult('PASS'),
        warn: countResult('WARN'),
        fail: countResult('FAIL'),
        unknown: countResult('UNKNOWN'),
      },
      controls,
      latestEvaluations,
      openFindings,
    },
  }
}

export async function enrichOutputWithAIGovernanceIntelligence(
  projectId: string,
  output: Record<string, unknown>,
) {
  const governanceIntelligence = await loadProjectAIGovernanceIntelligence(projectId)
  return { ...output, governanceIntelligence }
}

export async function refreshAllAIGovernanceIntelligence() {
  const admin = createAdminClient()
  const [coreResult, controlResult] = await Promise.all([
    admin.schema('governance').rpc('refresh_ai_governance_intelligence'),
    admin.schema('governance').rpc('refresh_all_governance_control_intelligence'),
  ])
  if (coreResult.error) throw new Error(`Unable to refresh AI governance intelligence: ${coreResult.error.message}`)
  if (controlResult.error) throw new Error(`Unable to refresh governance control intelligence: ${controlResult.error.message}`)

  const controls = controlResult.data as Record<string, unknown> | null
  const failureCount = Number(controls?.failure_count ?? 0)
  if (!Number.isFinite(failureCount) || failureCount > 0) {
    throw new Error(`Governance control intelligence reconciliation reported ${Number.isFinite(failureCount) ? failureCount : 'an invalid number of'} project failure(s).`)
  }

  return {
    core: coreResult.data as Record<string, unknown> | null,
    controls,
  }
}
