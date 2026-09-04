import { createAdminClient } from '@/lib/supabase/admin'

export async function listProjectPredictiveRisk(projectId: string) {
  const admin = createAdminClient()
  const [predictionsResult, datasetsResult, contextResult, linksResult, investigationsResult, correlationsResult] = await Promise.all([
    admin.schema('governance').from('governance_risk_predictions')
      .select('id,dataset_id,prediction_type,horizon_days,probability,risk_level,confidence,source_profile_run_id,contributors,explanation,evidence,calculated_at,expires_at')
      .eq('project_id', projectId)
      .order('probability', { ascending: false }),
    admin.schema('catalog').from('datasets')
      .select('id,name')
      .eq('project_id', projectId),
    admin.schema('governance').from('business_context_assets')
      .select('id,asset_key,asset_type,name,description,criticality,owner_key,metadata,updated_at')
      .eq('project_id', projectId)
      .order('criticality', { ascending: false }),
    admin.schema('governance').from('dataset_business_context_links')
      .select('id,dataset_id,business_context_asset_id,relationship_type,confidence,evidence,updated_at')
      .eq('project_id', projectId),
    admin.schema('governance').from('data_quality_investigations')
      .select('id,agent_run_id,dataset_id,dataset_version_id,profile_run_id,severity,status,summary,probable_root_causes,business_impact,risk,recommendations,approval_required,evidence,updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(50),
    admin.schema('governance').from('observability_incident_correlations')
      .select('id,incident_a_id,incident_b_id,correlation_type,status,score,confidence,evidence,last_observed_at')
      .eq('project_id', projectId)
      .eq('status', 'ACTIVE')
      .order('score', { ascending: false })
      .limit(50),
  ])

  for (const [label, result] of [
    ['risk predictions', predictionsResult],
    ['datasets', datasetsResult],
    ['business context', contextResult],
    ['business links', linksResult],
    ['investigations', investigationsResult],
    ['incident correlations', correlationsResult],
  ] as const) {
    if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`)
  }

  const datasetNames = new Map((datasetsResult.data ?? []).map((row) => [row.id, row.name]))
  return {
    predictions: (predictionsResult.data ?? []).map((prediction) => ({ ...prediction, dataset_name: datasetNames.get(prediction.dataset_id) ?? null })),
    businessContext: contextResult.data ?? [],
    businessLinks: linksResult.data ?? [],
    investigations: investigationsResult.data ?? [],
    incidentCorrelations: correlationsResult.data ?? [],
  }
}
