import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { analyzeLineageImpact } from '@/lib/governance/lineage-impact'

type ColumnMapping = {
  id: string
  transformation_id: string | null
  source_asset_id: string
  source_column: string
  target_asset_id: string
  target_column: string
  operation: string | null
  expression: string | null
  metadata: Record<string, unknown> | null
}

type LineageAsset = {
  id: string
  namespace: string | null
  name: string
  asset_type: string
  dataset_id: string | null
  metadata: Record<string, unknown> | null
}

type ColumnImpactNode = {
  mappingId: string
  assetId: string
  assetName: string
  column: string
  distance: number
  path: Array<Record<string, unknown>>
  criticality: string
  certificationStatus: string
  businessDescription: string | null
  riskScore: number
  confidence: number
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function clamp(value: number, min = 0, max = 1) { return Math.max(min, Math.min(max, value)) }
function columnKey(assetId: string, column: string) { return `${assetId}:${column.trim().toLowerCase()}` }
function criticalityWeight(value: unknown) {
  const weights: Record<string, number> = { LOW: 0.15, MEDIUM: 0.35, HIGH: 0.72, CRITICAL: 1 }
  return weights[text(value).toUpperCase()] ?? 0.25
}
function certificationWeight(value: unknown) {
  const status = text(value).toUpperCase()
  if (status === 'CERTIFIED') return 0.2
  if (status === 'PENDING') return 0.08
  return 0
}
function mappingConfidence(mapping: ColumnMapping) {
  const metadata = object(mapping.metadata)
  let score = 0.68
  if (mapping.transformation_id) score += 0.1
  if (text(mapping.expression)) score += 0.08
  if (text(mapping.operation)) score += 0.04
  if (metadata.integration_id || metadata.external_event_id || metadata.logic_hash) score += 0.06
  if (metadata.manual === true) score -= 0.05
  return clamp(score, 0.35, 0.96)
}
function changeRisk(changeType: string) {
  const risks: Record<string, number> = {
    DROP_DATASET: 0.98,
    PIPELINE_BREAKING_CHANGE: 0.95,
    DROP_COLUMN: 0.88,
    RENAME_COLUMN: 0.78,
    TYPE_NARROWING: 0.76,
    TYPE_CHANGE: 0.72,
    PIPELINE_LOGIC_CHANGE: 0.68,
    NULLABILITY_CHANGE: 0.62,
    ADD_COLUMN: 0.35,
    ADD_DATASET: 0.2,
  }
  return risks[changeType] ?? 0.65
}

export async function analyzeColumnLineageImpact(input: {
  projectId: string
  datasetId: string
  datasetName?: string | null
  affectedColumns: string[]
  maxDepth?: number
  rootRiskScore?: number | null
  triggerType?: string | null
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const maxDepth = Math.max(1, Math.min(20, Math.trunc(input.maxDepth ?? 5)))
  const rootRisk = clamp(input.rootRiskScore ?? 0.7)
  const requestedColumns = [...new Set(input.affectedColumns.map((column) => column.trim()).filter(Boolean))]

  const { data: rootAssets, error: rootAssetError } = await admin.schema('governance').from('lineage_assets')
    .select('id,namespace,name,asset_type,dataset_id,metadata')
    .eq('project_id', input.projectId)
    .eq('dataset_id', input.datasetId)
  if (rootAssetError) throw new Error(`Unable to resolve lineage assets for column impact: ${rootAssetError.message}`)

  const { data: mappings, error: mappingError } = await admin.schema('governance').from('lineage_column_mappings')
    .select('id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression,metadata')
    .eq('project_id', input.projectId)
    .limit(20000)
  if (mappingError) throw new Error(`Unable to load column lineage mappings: ${mappingError.message}`)

  const mappingRows = (mappings ?? []) as ColumnMapping[]
  const rootAssetIds = new Set((rootAssets ?? []).map((asset) => asset.id))
  const adjacency = new Map<string, ColumnMapping[]>()
  for (const mapping of mappingRows) {
    const key = columnKey(mapping.source_asset_id, mapping.source_column)
    const rows = adjacency.get(key) ?? []
    rows.push(mapping)
    adjacency.set(key, rows)
  }

  const queue: Array<{ assetId: string; column: string; distance: number; path: Array<Record<string, unknown>>; confidence: number }> = []
  for (const assetId of rootAssetIds) {
    for (const column of requestedColumns) queue.push({ assetId, column, distance: 0, path: [], confidence: 1 })
  }

  const visited = new Set(queue.map((item) => columnKey(item.assetId, item.column)))
  const traversed: Array<{ mapping: ColumnMapping; distance: number; path: Array<Record<string, unknown>>; confidence: number }> = []
  while (queue.length) {
    const current = queue.shift()!
    if (current.distance >= maxDepth) continue
    const outgoing = adjacency.get(columnKey(current.assetId, current.column)) ?? []
    for (const mapping of outgoing) {
      const nextKey = columnKey(mapping.target_asset_id, mapping.target_column)
      if (visited.has(nextKey)) continue
      visited.add(nextKey)
      const step = {
        mapping_id: mapping.id,
        transformation_id: mapping.transformation_id,
        source_asset_id: mapping.source_asset_id,
        source_column: mapping.source_column,
        target_asset_id: mapping.target_asset_id,
        target_column: mapping.target_column,
        operation: mapping.operation,
        expression: mapping.expression,
      }
      const nextPath = [...current.path, step]
      const confidence = clamp(Math.min(current.confidence, mappingConfidence(mapping)) * (1 / (1 + current.distance * 0.04)), 0.25, 0.96)
      traversed.push({ mapping, distance: current.distance + 1, path: nextPath, confidence })
      queue.push({ assetId: mapping.target_asset_id, column: mapping.target_column, distance: current.distance + 1, path: nextPath, confidence })
    }
  }

  const targetAssetIds = [...new Set(traversed.map((item) => item.mapping.target_asset_id))]
  const { data: targetAssets, error: targetAssetError } = targetAssetIds.length
    ? await admin.schema('governance').from('lineage_assets').select('id,namespace,name,asset_type,dataset_id,metadata').eq('project_id', input.projectId).in('id', targetAssetIds)
    : { data: [], error: null }
  if (targetAssetError) throw new Error(`Unable to enrich affected column assets: ${targetAssetError.message}`)
  const assetById = new Map(((targetAssets ?? []) as LineageAsset[]).map((asset) => [asset.id, asset]))

  const targetDatasetIds = [...new Set(((targetAssets ?? []) as LineageAsset[]).map((asset) => asset.dataset_id).filter((id): id is string => Boolean(id)))]
  const [{ data: datasets, error: datasetError }, { data: catalogRows, error: catalogError }] = await Promise.all([
    targetDatasetIds.length
      ? admin.schema('catalog').from('datasets').select('id,name').eq('project_id', input.projectId).in('id', targetDatasetIds)
      : Promise.resolve({ data: [], error: null }),
    targetDatasetIds.length
      ? admin.schema('governance').from('dataset_catalog').select('dataset_id,criticality,certification_status,business_description').eq('project_id', input.projectId).in('dataset_id', targetDatasetIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (datasetError) throw new Error(`Unable to resolve affected column datasets: ${datasetError.message}`)
  if (catalogError) throw new Error(`Unable to resolve affected column governance metadata: ${catalogError.message}`)
  const datasetById = new Map((datasets ?? []).map((row) => [row.id, row]))
  const catalogById = new Map((catalogRows ?? []).map((row) => [row.dataset_id, row]))

  const nodes: ColumnImpactNode[] = traversed.map(({ mapping, distance, path, confidence }) => {
    const asset = assetById.get(mapping.target_asset_id)
    const governance = asset?.dataset_id ? catalogById.get(asset.dataset_id) : undefined
    const dataset = asset?.dataset_id ? datasetById.get(asset.dataset_id) : undefined
    const criticality = governance?.criticality ?? 'MEDIUM'
    const certificationStatus = governance?.certification_status ?? 'UNCERTIFIED'
    const distanceDecay = 1 / (1 + Math.max(0, distance - 1) * 0.28)
    const governanceBoost = criticalityWeight(criticality) * 0.3 + certificationWeight(certificationStatus)
    const riskScore = clamp(rootRisk * distanceDecay * 0.72 + governanceBoost)
    const assetLabel = asset ? [asset.namespace, asset.name].filter(Boolean).join('.') : `asset:${mapping.target_asset_id.slice(0, 8)}`
    return {
      mappingId: mapping.id,
      assetId: mapping.target_asset_id,
      assetName: dataset?.name ? `${dataset.name} · ${assetLabel}` : assetLabel,
      column: mapping.target_column,
      distance,
      path,
      criticality,
      certificationStatus,
      businessDescription: governance?.business_description ?? null,
      riskScore,
      confidence,
    }
  })

  const criticalAffected = nodes.filter((node) => ['HIGH', 'CRITICAL'].includes(text(node.criticality).toUpperCase()))
  const aggregateRisk = nodes.length ? Math.max(...nodes.map((node) => node.riskScore)) : 0
  const aggregateConfidence = nodes.length ? nodes.reduce((sum, node) => sum + node.confidence, 0) / nodes.length : (rootAssetIds.size ? 0.8 : 0.35)
  const summary = nodes.length
    ? `${nodes.length} downstream column dependenc${nodes.length === 1 ? 'y' : 'ies'} are affected by ${requestedColumns.length} proposed source column change${requestedColumns.length === 1 ? '' : 's'}; ${criticalAffected.length} reach high or critical governed datasets.`
    : rootAssetIds.size
      ? `No downstream column mappings were found for the selected ${requestedColumns.length} source column${requestedColumns.length === 1 ? '' : 's'} within ${maxDepth} hops.`
      : 'No lineage asset is linked to the selected governed dataset, so column-level impact cannot be proven from persisted evidence.'

  const now = new Date().toISOString()
  const { data: analysis, error: analysisError } = await admin.schema('governance').from('lineage_impact_analyses').insert({
    project_id: input.projectId,
    root_asset_type: 'DATASET',
    root_asset_id: input.datasetId,
    root_asset_name: input.datasetName ?? null,
    trigger_type: input.triggerType?.trim().toUpperCase() || 'COLUMN_IMPACT',
    trigger_id: null,
    direction: 'DOWNSTREAM',
    max_depth: maxDepth,
    affected_count: nodes.length,
    critical_affected_count: criticalAffected.length,
    risk_score: aggregateRisk,
    confidence: aggregateConfidence,
    summary,
    evidence: {
      impact_scope: 'COLUMN',
      affected_columns: requestedColumns,
      root_lineage_asset_ids: [...rootAssetIds],
      mapping_count_examined: mappingRows.length,
      generated_at: now,
    },
    updated_at: now,
  }).select('id').single()
  if (analysisError || !analysis) throw new Error(`Unable to persist column lineage impact analysis: ${analysisError?.message ?? 'unknown error'}`)

  if (nodes.length) {
    const rows = nodes.map((node) => ({
      analysis_id: analysis.id,
      project_id: input.projectId,
      asset_type: 'COLUMN',
      asset_id: node.mappingId,
      asset_name: `${node.assetName}.${node.column}`,
      distance: node.distance,
      path: node.path,
      criticality: node.criticality,
      certification_status: node.certificationStatus,
      risk_score: node.riskScore,
      confidence: node.confidence,
      evidence: {
        target_asset_id: node.assetId,
        target_column: node.column,
        business_description: node.businessDescription,
      },
    }))
    const { error: nodeError } = await admin.schema('governance').from('lineage_impact_nodes').insert(rows)
    if (nodeError) throw new Error(`Unable to persist column lineage impact nodes: ${nodeError.message}`)
  }

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'AGENT',
    eventType: 'COLUMN_LINEAGE_IMPACT_ANALYZED',
    entityType: 'DATASET',
    entityId: input.datasetId,
    metadata: { analysis_id: analysis.id, affected_columns: requestedColumns, affected_count: nodes.length, critical_affected_count: criticalAffected.length, risk_score: aggregateRisk, confidence: aggregateConfidence },
  })

  return {
    analysisId: analysis.id as string,
    affectedCount: nodes.length,
    criticalAffectedCount: criticalAffected.length,
    riskScore: aggregateRisk,
    confidence: aggregateConfidence,
    summary,
    affectedColumns: requestedColumns,
    nodes,
  }
}

export async function assessProposedLineageChange(input: {
  projectId: string
  datasetId: string
  changeType: string
  changeSummary?: string | null
  affectedColumns?: string[]
  maxDepth?: number
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const changeType = input.changeType.trim().toUpperCase() || 'PIPELINE_LOGIC_CHANGE'
  const affectedColumns = [...new Set((input.affectedColumns ?? []).map((column) => column.trim()).filter(Boolean))]
  const baseRisk = changeRisk(changeType)

  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets')
    .select('id,name,project_id')
    .eq('id', input.datasetId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (datasetError || !dataset) throw new Error(`Unable to resolve proposed-change dataset: ${datasetError?.message ?? 'not found'}`)

  const datasetImpact = await analyzeLineageImpact({
    projectId: input.projectId,
    rootAssetType: 'DATASET',
    rootAssetId: input.datasetId,
    rootAssetName: dataset.name,
    triggerType: 'PROPOSED_CHANGE',
    direction: 'DOWNSTREAM',
    maxDepth: input.maxDepth ?? 5,
    rootRiskScore: baseRisk,
    actorUserId: input.actorUserId ?? null,
  })

  const columnImpact = affectedColumns.length
    ? await analyzeColumnLineageImpact({
        projectId: input.projectId,
        datasetId: input.datasetId,
        datasetName: dataset.name,
        affectedColumns,
        maxDepth: input.maxDepth ?? 5,
        rootRiskScore: baseRisk,
        triggerType: 'PROPOSED_COLUMN_CHANGE',
        actorUserId: input.actorUserId ?? null,
      })
    : null

  const combinedNodes = [...datasetImpact.nodes, ...(columnImpact?.nodes ?? [])]
  const certifiedAffected = combinedNodes.filter((node) => text('certificationStatus' in node ? node.certificationStatus : '').toUpperCase() === 'CERTIFIED').length
  const criticalAffected = Math.max(datasetImpact.criticalAffectedCount, columnImpact?.criticalAffectedCount ?? 0)
  const blastRisk = Math.max(datasetImpact.riskScore, columnImpact?.riskScore ?? 0)
  const riskScore = clamp(Math.max(baseRisk * 0.72 + blastRisk * 0.28, blastRisk))
  const confidence = columnImpact
    ? clamp((datasetImpact.confidence + columnImpact.confidence) / 2, 0.25, 0.98)
    : datasetImpact.confidence
  const approvalRequired = riskScore >= 0.75 || criticalAffected > 0 || certifiedAffected > 0
  const decision = approvalRequired ? 'APPROVAL_REQUIRED' : riskScore >= 0.5 ? 'REVIEW_REQUIRED' : 'SAFE_TO_PROCEED'

  const businessDescriptions = [...new Set(combinedNodes
    .map((node) => 'businessDescription' in node ? text(node.businessDescription) : '')
    .filter(Boolean))]
  const businessImpact = datasetImpact.affectedCount === 0 && (columnImpact?.affectedCount ?? 0) === 0
    ? 'No downstream dependency is proven by the current persisted lineage evidence. Absence of lineage evidence is not proof of no impact.'
    : `${datasetImpact.affectedCount} downstream assets and ${columnImpact?.affectedCount ?? 0} mapped downstream columns are within scope. ${criticalAffected} high or critical governed dependencies and ${certifiedAffected} certified dependencies increase change risk.`

  const now = new Date().toISOString()
  const { data: existingAnalysis, error: existingError } = await admin.schema('governance').from('lineage_impact_analyses')
    .select('evidence')
    .eq('id', datasetImpact.analysisId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (existingError || !existingAnalysis) throw new Error(`Unable to persist proposed-change evidence: ${existingError?.message ?? 'analysis not found'}`)

  const { error: updateError } = await admin.schema('governance').from('lineage_impact_analyses').update({
    risk_score: riskScore,
    confidence,
    evidence: {
      ...object(existingAnalysis.evidence),
      proposed_change: {
        change_type: changeType,
        change_summary: input.changeSummary?.trim() || null,
        affected_columns: affectedColumns,
        base_change_risk: baseRisk,
        decision,
        approval_required: approvalRequired,
        certified_affected_count: certifiedAffected,
        column_impact_analysis_id: columnImpact?.analysisId ?? null,
        business_impact: businessImpact,
        business_context: businessDescriptions.slice(0, 20),
        assessed_at: now,
      },
    },
    updated_at: now,
  }).eq('id', datasetImpact.analysisId)
  if (updateError) throw new Error(`Unable to update proposed-change impact analysis: ${updateError.message}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'AGENT',
    eventType: 'LINEAGE_PROPOSED_CHANGE_ASSESSED',
    entityType: 'DATASET',
    entityId: input.datasetId,
    metadata: {
      analysis_id: datasetImpact.analysisId,
      column_impact_analysis_id: columnImpact?.analysisId ?? null,
      change_type: changeType,
      affected_columns: affectedColumns,
      risk_score: riskScore,
      confidence,
      decision,
      approval_required: approvalRequired,
      critical_affected_count: criticalAffected,
      certified_affected_count: certifiedAffected,
      production_mutation_performed: false,
    },
  })

  return {
    datasetId: input.datasetId,
    datasetName: dataset.name,
    analysisId: datasetImpact.analysisId,
    columnAnalysisId: columnImpact?.analysisId ?? null,
    changeType,
    changeSummary: input.changeSummary?.trim() || null,
    affectedColumns,
    decision,
    approvalRequired,
    productionMutationPerformed: false,
    riskScore,
    confidence,
    affectedCount: datasetImpact.affectedCount,
    columnAffectedCount: columnImpact?.affectedCount ?? 0,
    criticalAffectedCount: criticalAffected,
    certifiedAffectedCount: certifiedAffected,
    businessImpact,
    datasetImpact,
    columnImpact,
  }
}
