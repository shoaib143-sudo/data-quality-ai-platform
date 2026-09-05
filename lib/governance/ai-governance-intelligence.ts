import { createAdminClient } from '@/lib/supabase/admin'

export type AIGovernanceIntelligence = {
  certificationReadiness: Array<Record<string, unknown>>
  governanceValue: Record<string, unknown> | null
}

export async function loadProjectAIGovernanceIntelligence(projectId: string): Promise<AIGovernanceIntelligence> {
  const admin = createAdminClient()
  const [readinessResult, roiResult] = await Promise.all([
    admin.schema('governance').from('certification_readiness')
      .select('dataset_id,readiness_score,readiness_status,blockers,evidence,assessed_at')
      .eq('project_id', projectId)
      .order('readiness_score', { ascending: true })
      .limit(500),
    admin.schema('governance').from('governance_roi_snapshots')
      .select('value_score,confidence,metrics,limitations,calculated_at')
      .eq('project_id', projectId)
      .maybeSingle(),
  ])
  if (readinessResult.error) throw new Error(`Unable to load certification readiness intelligence: ${readinessResult.error.message}`)
  if (roiResult.error) throw new Error(`Unable to load governance value intelligence: ${roiResult.error.message}`)
  return {
    certificationReadiness: (readinessResult.data ?? []) as Array<Record<string, unknown>>,
    governanceValue: roiResult.data as Record<string, unknown> | null,
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
  const { data, error } = await admin.schema('governance').rpc('refresh_ai_governance_intelligence')
  if (error) throw new Error(`Unable to refresh AI governance intelligence: ${error.message}`)
  return data as Record<string, unknown> | null
}
