import { createAdminClient } from '@/lib/supabase/admin'
import { enrichObservabilityIncidentWithLineageImpact } from '@/lib/governance/lineage-impact'
import { correlateObservabilityIncidents } from '@/lib/observability/cross-dataset-correlation'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}

function severityRank(value: unknown) {
  return ({ INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as Record<string, number>)[text(value).toUpperCase()] ?? 0
}

function highestSeverity(values: unknown[]) {
  const labels = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
  return labels[Math.max(0, Math.min(4, Math.max(0, ...values.map(severityRank))))]
}

export async function refreshProjectPredictiveRisk(projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('refresh_governance_risk_predictions', { p_project_id: projectId })
  if (error) throw new Error(`Unable to refresh governance risk predictions: ${error.message}`)
  return data as Record<string, unknown>
}

export async function refreshAllPredictiveRisk() {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('refresh_all_governance_risk_predictions')
  if (error) throw new Error(`Unable to refresh predictive governance risk: ${error.message}`)
  return data as Record<string, unknown>
}

export async function listProjectPredictiveRisk(projectId: string) {
  const admin = createAdminClient()
  const [predictionsResult, contextResult, linksResult, investigationsResult, correlationsResult] = await Promise.all([
    admin.schema('governance').from('governance_risk_predictions')
      .select('id,dataset_id,prediction_type,horizon_days,probability,risk_level,confidence,source_profile_run_id,contributors,explanation,evidence,calculated_at,expires_at,catalog.datasets(name)')
      .eq('project_id', projectId)
      .order('probability', { ascending: false }),
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
    ['business context', contextResult],
    ['business links', linksResult],
    ['investigations', investigationsResult],
    ['incident correlations', correlationsResult],
  ] as const) {
    if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`)
  }

  return {
    predictions: predictionsResult.data ?? [],
    businessContext: contextResult.data ?? [],
    businessLinks: linksResult.data ?? [],
    investigations: investigationsResult.data ?? [],
    incidentCorrelations: correlationsResult.data ?? [],
  }
}

export async function persistInvestigatorRiskAssessment(input: {
  projectId: string
  agentRunId: string
  actorUserId: string | null
  output: Record<string, unknown>
}) {
  const admin = createAdminClient()
  await refreshProjectPredictiveRisk(input.projectId)

  const { data: predictions, error: predictionError } = await admin.schema('governance').from('governance_risk_predictions')
    .select('id,dataset_id,prediction_type,horizon_days,probability,risk_level,confidence,source_profile_run_id,contributors,explanation,evidence,calculated_at')
    .eq('project_id', input.projectId)
    .order('probability', { ascending: false })
  if (predictionError) throw new Error(`Unable to load investigator predictive risk: ${predictionError.message}`)
  if (!predictions?.length) return null

  const specialist = input.output.specialist && typeof input.output.specialist === 'object' && !Array.isArray(input.output.specialist)
    ? input.output.specialist as Record<string, unknown>
    : {}
  const specialistEvidence = specialist.evidence && typeof specialist.evidence === 'object' && !Array.isArray(specialist.evidence)
    ? specialist.evidence as Record<string, unknown>
    : {}

  const referencedDatasetIds = new Map<string, number>()
  for (const collection of Object.values(specialistEvidence)) {
    for (const row of rows(collection)) {
      const datasetId = text(row.dataset_id)
      if (datasetId) referencedDatasetIds.set(datasetId, (referencedDatasetIds.get(datasetId) ?? 0) + 1)
    }
  }

  const rankedDatasetIds = [...referencedDatasetIds.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const selectedDatasetId = rankedDatasetIds.find((id) => predictions.some((prediction) => prediction.dataset_id === id))
    ?? predictions[0].dataset_id
  const selectedPredictions = predictions.filter((prediction) => prediction.dataset_id === selectedDatasetId)

  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets')
    .select('id,name')
    .eq('id', selectedDatasetId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (datasetError || !dataset) throw new Error(`Unable to resolve investigator target dataset: ${datasetError?.message ?? 'not found'}`)

  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,version_number,status,created_at')
    .eq('dataset_id', selectedDatasetId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (versionError || !version) throw new Error(`Unable to resolve investigator dataset version: ${versionError?.message ?? 'not found'}`)

  const sourceProfileRunId = selectedPredictions.find((prediction) => prediction.source_profile_run_id)?.source_profile_run_id ?? null
  const hypotheses = rows(input.output.hypotheses)
  const recommendations = rows(input.output.recommendations)

  const { data: businessLinks, error: businessError } = await admin.schema('governance').from('dataset_business_context_links')
    .select('relationship_type,confidence,evidence,business_context_assets(asset_key,asset_type,name,criticality,description,metadata)')
    .eq('project_id', input.projectId)
    .eq('dataset_id', selectedDatasetId)
  if (businessError) throw new Error(`Unable to load investigator business impact context: ${businessError.message}`)

  const riskLevel = highestSeverity(selectedPredictions.map((prediction) => prediction.risk_level))
  const maxProbability = Math.max(...selectedPredictions.map((prediction) => Number(prediction.probability ?? 0)))
  const maxConfidence = Math.max(...selectedPredictions.map((prediction) => Number(prediction.confidence ?? 0)))
  const businessAssets = businessLinks ?? []
  const businessNames = businessAssets.flatMap((link) => {
    const linked = Array.isArray(link.business_context_assets) ? link.business_context_assets : link.business_context_assets ? [link.business_context_assets] : []
    return linked.map((asset: any) => asset?.name).filter(Boolean)
  })
  const businessImpact = businessNames.length
    ? `${dataset.name} supports governed business context ${[...new Set(businessNames)].join(', ')}; quality or governance degradation can therefore propagate into those governed domains.`
    : `${dataset.name} has no explicit business-context link yet; impact is bounded to the technical and governance evidence currently modeled.`

  const summary = `${dataset.name} investigator assessment selected the highest-evidence project risk target. Maximum transparent predicted risk is ${riskLevel} (${maxProbability.toFixed(3)}) with confidence ${maxConfidence.toFixed(3)}.`
  const status = severityRank(riskLevel) >= 2 ? 'ATTENTION_REQUIRED' : 'CONTROLLED'

  const payload = {
    project_id: input.projectId,
    agent_run_id: input.agentRunId,
    dataset_id: selectedDatasetId,
    dataset_version_id: version.id,
    profile_run_id: sourceProfileRunId,
    severity: riskLevel,
    status,
    summary,
    probable_root_causes: hypotheses,
    business_impact: businessImpact,
    risk: {
      model: 'transparent_rules_v1',
      predictions: selectedPredictions,
      maximum_probability: maxProbability,
      maximum_risk_level: riskLevel,
      confidence: maxConfidence,
    },
    recommendations,
    approval_required: false,
    evidence: {
      source_agent_run_id: input.agentRunId,
      specialist_focus: specialist.focus ?? null,
      business_context: businessAssets,
      prediction_ids: selectedPredictions.map((prediction) => prediction.id),
      source_profile_run_id: sourceProfileRunId,
      read_only: true,
    },
    updated_at: new Date().toISOString(),
  }

  const { data: investigation, error: investigationError } = await admin.schema('governance').from('data_quality_investigations')
    .upsert(payload, { onConflict: 'agent_run_id' })
    .select('id,severity,status,summary,business_impact,risk,evidence,updated_at')
    .single()
  if (investigationError || !investigation) throw new Error(`Unable to persist investigator assessment: ${investigationError?.message ?? 'unknown error'}`)

  let lineageImpact: Record<string, unknown> | null = null
  const { data: incident, error: incidentError } = await admin.schema('governance').from('observability_incidents')
    .select('id,severity,status')
    .eq('project_id', input.projectId)
    .eq('dataset_id', selectedDatasetId)
    .in('status', ['OPEN', 'INVESTIGATING', 'MITIGATING'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (incidentError) throw new Error(`Unable to resolve investigator observability incident: ${incidentError.message}`)

  if (incident) {
    try {
      lineageImpact = await enrichObservabilityIncidentWithLineageImpact({
        incidentId: incident.id,
        projectId: input.projectId,
        datasetId: selectedDatasetId,
        severity: incident.severity,
        actorUserId: input.actorUserId,
      }) as unknown as Record<string, unknown>
    } catch (error) {
      lineageImpact = { status: 'PARTIAL', error: error instanceof Error ? error.message : 'Lineage impact enrichment failed.' }
    }
  }

  let correlation: Record<string, unknown> | null = null
  try {
    correlation = await correlateObservabilityIncidents({ projectId: input.projectId, actorUserId: input.actorUserId }) as unknown as Record<string, unknown>
  } catch (error) {
    correlation = { status: 'PARTIAL', error: error instanceof Error ? error.message : 'Incident correlation failed.' }
  }

  const enrichedOutput = {
    ...input.output,
    investigation: {
      id: investigation.id,
      datasetId: selectedDatasetId,
      datasetName: dataset.name,
      datasetVersionId: version.id,
      profileRunId: sourceProfileRunId,
      severity: investigation.severity,
      status: investigation.status,
      summary: investigation.summary,
      businessImpact: investigation.business_impact,
      predictiveRisk: selectedPredictions,
      lineageImpact,
      incidentCorrelation: correlation,
    },
  }
  const { error: outputError } = await admin.schema('agent').from('agent_runs').update({ output: enrichedOutput }).eq('id', input.agentRunId)
  if (outputError) throw new Error(`Unable to attach investigation evidence to agent run: ${outputError.message}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorType: input.actorUserId ? 'USER' : 'AGENT',
    eventType: 'INVESTIGATOR_PREDICTIVE_RISK_ASSESSMENT_PERSISTED',
    entityType: 'DATASET',
    entityId: selectedDatasetId,
    correlationId: input.agentRunId,
    metadata: {
      investigation_id: investigation.id,
      agent_run_id: input.agentRunId,
      risk_level: riskLevel,
      maximum_probability: maxProbability,
      confidence: maxConfidence,
      business_context_links: businessAssets.length,
      source_profile_run_id: sourceProfileRunId,
      read_only: true,
    },
  })

  return enrichedOutput.investigation
}
