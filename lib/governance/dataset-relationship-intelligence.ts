import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildDatasetRelationshipIntelligence,
  type DatasetCdeSignal,
  type DatasetIncidentCorrelationSignal,
  type DatasetLineageSignal,
  type DatasetStewardshipSignal,
} from '@/lib/governance/dataset-relationship-contract'

type DatasetRow = {
  id: string
  name: string
  business_domain: string | null
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

export async function loadDatasetRelationshipIntelligence(input: {
  projectId: string
  datasetId: string
  includeAuthoritativeLineage?: boolean
}) {
  const admin = createAdminClient()
  const { data: datasetsData, error: datasetsError } = await admin
    .schema('catalog')
    .from('datasets')
    .select('id,name,business_domain')
    .eq('project_id', input.projectId)
    .order('name')
    .limit(5000)
  if (datasetsError) throw new Error(`Unable to load project datasets: ${datasetsError.message}`)

  const datasets = (datasetsData ?? []) as DatasetRow[]
  const sourceDataset = datasets.find((dataset) => dataset.id === input.datasetId)
  if (!sourceDataset) throw new Error('Dataset was not found in the requested project.')

  const [sourceCdeResponse, sourceStewardshipResponse, sourceIncidentResponse] = await Promise.all([
    admin.schema('governance').from('cde_mappings')
      .select('id,cde_id,dataset_id,column_name,confidence,status')
      .eq('project_id', input.projectId)
      .eq('dataset_id', input.datasetId)
      .eq('status', 'APPROVED')
      .limit(5000),
    admin.schema('governance').from('stewardship_assignments')
      .select('id,dataset_id,user_id,role,status,active,target_state,subject_state')
      .eq('project_id', input.projectId)
      .eq('target_type', 'DATASET')
      .eq('dataset_id', input.datasetId)
      .eq('status', 'ACTIVE')
      .eq('active', true)
      .eq('target_state', 'CURRENT')
      .eq('subject_state', 'CURRENT')
      .limit(1000),
    admin.schema('governance').from('observability_incidents')
      .select('id,dataset_id')
      .eq('project_id', input.projectId)
      .eq('dataset_id', input.datasetId)
      .limit(1000),
  ])

  if (sourceCdeResponse.error) throw new Error(`Unable to load source CDE mappings: ${sourceCdeResponse.error.message}`)
  if (sourceStewardshipResponse.error) throw new Error(`Unable to load source stewardship: ${sourceStewardshipResponse.error.message}`)
  if (sourceIncidentResponse.error) throw new Error(`Unable to load source incident evidence: ${sourceIncidentResponse.error.message}`)

  const sourceCdeMappings = sourceCdeResponse.data ?? []
  const cdeIds = unique(sourceCdeMappings.map((row) => String(row.cde_id)))
  const sourceStewardship = sourceStewardshipResponse.data ?? []
  const principalIds = unique(sourceStewardship.map((row) => String(row.user_id)))
  const sourceIncidentIds = unique((sourceIncidentResponse.data ?? []).map((row) => String(row.id)))

  const [cdeResponse, targetCdeResponse, targetStewardshipResponse, incidentAResponse, incidentBResponse, lineageOutResponse, lineageInResponse] = await Promise.all([
    cdeIds.length
      ? admin.schema('governance').from('critical_data_elements')
          .select('id,cde_key,name,criticality')
          .eq('project_id', input.projectId)
          .in('id', cdeIds)
      : Promise.resolve({ data: [], error: null }),
    cdeIds.length
      ? admin.schema('governance').from('cde_mappings')
          .select('id,cde_id,dataset_id,column_name,confidence,status')
          .eq('project_id', input.projectId)
          .eq('status', 'APPROVED')
          .in('cde_id', cdeIds)
          .neq('dataset_id', input.datasetId)
          .limit(10000)
      : Promise.resolve({ data: [], error: null }),
    principalIds.length
      ? admin.schema('governance').from('stewardship_assignments')
          .select('id,dataset_id,user_id,role,status,active,target_state,subject_state')
          .eq('project_id', input.projectId)
          .eq('target_type', 'DATASET')
          .eq('status', 'ACTIVE')
          .eq('active', true)
          .eq('target_state', 'CURRENT')
          .eq('subject_state', 'CURRENT')
          .in('user_id', principalIds)
          .neq('dataset_id', input.datasetId)
          .limit(10000)
      : Promise.resolve({ data: [], error: null }),
    sourceIncidentIds.length
      ? admin.schema('governance').from('observability_incident_correlations')
          .select('id,incident_a_id,incident_b_id,correlation_type,status,score,confidence')
          .eq('project_id', input.projectId)
          .eq('status', 'ACTIVE')
          .in('incident_a_id', sourceIncidentIds)
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    sourceIncidentIds.length
      ? admin.schema('governance').from('observability_incident_correlations')
          .select('id,incident_a_id,incident_b_id,correlation_type,status,score,confidence')
          .eq('project_id', input.projectId)
          .eq('status', 'ACTIVE')
          .in('incident_b_id', sourceIncidentIds)
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    input.includeAuthoritativeLineage === true
      ? admin.schema('governance').from('authoritative_lineage_edges')
          .select('id,source_type,source_id,target_type,target_id,relationship,authority_state,origin')
          .eq('project_id', input.projectId)
          .eq('source_type', 'DATASET')
          .eq('source_id', input.datasetId)
          .eq('target_type', 'DATASET')
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    input.includeAuthoritativeLineage === true
      ? admin.schema('governance').from('authoritative_lineage_edges')
          .select('id,source_type,source_id,target_type,target_id,relationship,authority_state,origin')
          .eq('project_id', input.projectId)
          .eq('target_type', 'DATASET')
          .eq('target_id', input.datasetId)
          .eq('source_type', 'DATASET')
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ])

  for (const [label, response] of [
    ['critical data elements', cdeResponse],
    ['target CDE mappings', targetCdeResponse],
    ['target stewardship', targetStewardshipResponse],
    ['incident correlations A', incidentAResponse],
    ['incident correlations B', incidentBResponse],
    ['downstream authoritative lineage', lineageOutResponse],
    ['upstream authoritative lineage', lineageInResponse],
  ] as const) {
    if (response.error) throw new Error(`Unable to load ${label}: ${response.error.message}`)
  }

  const cdeById = new Map((cdeResponse.data ?? []).map((row) => [String(row.id), row]))
  const sourceMappingByCde = new Map(sourceCdeMappings.map((row) => [String(row.cde_id), row]))
  const cdeSignals: DatasetCdeSignal[] = (targetCdeResponse.data ?? []).flatMap((row) => {
    const cdeId = String(row.cde_id)
    const cde = cdeById.get(cdeId)
    const sourceMapping = sourceMappingByCde.get(cdeId)
    if (!cde || !sourceMapping) return []
    return [{
      targetDatasetId: String(row.dataset_id),
      cdeId,
      cdeKey: String(cde.cde_key),
      cdeName: String(cde.name),
      criticality: String(cde.criticality),
      sourceMappingStatus: String(sourceMapping.status),
      targetMappingStatus: String(row.status),
      sourceConfidence: sourceMapping.confidence === null ? null : Number(sourceMapping.confidence),
      targetConfidence: row.confidence === null ? null : Number(row.confidence),
    }]
  })

  const sourceStewardshipPairs = new Set(
    sourceStewardship.map((row) => `${String(row.user_id)}:${String(row.role)}`),
  )
  const stewardshipSignals: DatasetStewardshipSignal[] = (targetStewardshipResponse.data ?? [])
    .filter((row) => sourceStewardshipPairs.has(`${String(row.user_id)}:${String(row.role)}`))
    .map((row) => ({
      targetDatasetId: String(row.dataset_id),
      assignmentId: String(row.id),
      principalUserId: String(row.user_id),
      role: String(row.role),
      status: String(row.status),
      active: row.active === true,
      targetState: String(row.target_state),
      subjectState: String(row.subject_state),
    }))

  const correlations = [...(incidentAResponse.data ?? []), ...(incidentBResponse.data ?? [])]
  const counterpartIds = unique(correlations.map((row) => {
    const a = String(row.incident_a_id)
    const b = String(row.incident_b_id)
    return sourceIncidentIds.includes(a) ? b : a
  }))
  const counterpartResponse = counterpartIds.length
    ? await admin.schema('governance').from('observability_incidents')
        .select('id,dataset_id')
        .eq('project_id', input.projectId)
        .in('id', counterpartIds)
    : { data: [], error: null }
  if (counterpartResponse.error) throw new Error(`Unable to resolve correlated incident datasets: ${counterpartResponse.error.message}`)
  const datasetByIncident = new Map((counterpartResponse.data ?? []).map((row) => [String(row.id), String(row.dataset_id)]))
  const incidentSignals: DatasetIncidentCorrelationSignal[] = correlations.flatMap((row) => {
    const a = String(row.incident_a_id)
    const b = String(row.incident_b_id)
    const counterpartId = sourceIncidentIds.includes(a) ? b : a
    const targetDatasetId = datasetByIncident.get(counterpartId)
    if (!targetDatasetId || targetDatasetId === input.datasetId) return []
    return [{
      targetDatasetId,
      correlationId: String(row.id),
      correlationType: String(row.correlation_type),
      status: String(row.status),
      score: Number(row.score),
      confidence: Number(row.confidence),
    }]
  })

  const lineageSignals: DatasetLineageSignal[] = [
    ...(lineageOutResponse.data ?? []).map((row) => ({
      targetDatasetId: String(row.target_id),
      edgeId: String(row.id),
      relationship: String(row.relationship),
      authorityState: String(row.authority_state),
      origin: String(row.origin),
      direction: 'DOWNSTREAM' as const,
    })),
    ...(lineageInResponse.data ?? []).map((row) => ({
      targetDatasetId: String(row.source_id),
      edgeId: String(row.id),
      relationship: String(row.relationship),
      authorityState: String(row.authority_state),
      origin: String(row.origin),
      direction: 'UPSTREAM' as const,
    })),
  ]

  return {
    ...buildDatasetRelationshipIntelligence({
      sourceDataset: {
        id: sourceDataset.id,
        name: sourceDataset.name,
        businessDomain: sourceDataset.business_domain,
      },
      datasets: datasets.map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        businessDomain: dataset.business_domain,
      })),
      cdeSignals,
      stewardshipSignals,
      incidentSignals,
      lineageSignals,
    }),
    lineageIncluded: input.includeAuthoritativeLineage === true,
    lineageSemantics: input.includeAuthoritativeLineage === true
      ? 'Only governance.authoritative_lineage_edges is consumed; raw or unclassified lineage is excluded.'
      : 'Lineage signals omitted because the caller lacks lineage.read or did not request lineage.',
  }
}
