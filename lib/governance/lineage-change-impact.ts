import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { analyzeLineageImpact } from '@/lib/governance/lineage-impact'
import { getFieldGraphProvider } from '@/lib/data-plane/field-graph-provider'
import type { FieldGraphEdge, FieldGraphNode, FieldGraphNodeRef } from '@/lib/data-plane/field-graph-contracts'

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

type TraversedColumn = {
  mapping: ColumnMapping
  distance: number
  path: Array<Record<string, unknown>>
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

function toColumnMapping(edge: FieldGraphEdge): ColumnMapping {
  return {
    id: edge.id,
    transformation_id: edge.transformationId,
    source_asset_id: edge.source.assetId,
    source_column: edge.source.columnName,
    target_asset_id: edge.target.assetId,
    target_column: edge.target.columnName,
    operation: edge.operation,
    expression: edge.expression,
    metadata: {
      ...object(edge.metadata),
      field_graph_depth: edge.depth,
      ...(edge.transformation ? { transformation: edge.transformation } : {}),
    },
  }
}

function traverseFieldEdges(edges: FieldGraphEdge[], anchor: FieldGraphNodeRef, maxDepth: number) {
  const adjacency = new Map<string, FieldGraphEdge[]>()
  for (const edge of edges) {
    const key = columnKey(edge.source.assetId, edge.source.columnName)
    const rows = adjacency.get(key) ?? []
    rows.push(edge)
    adjacency.set(key, rows)
  }

  const visited = new Set<string>([columnKey(anchor.assetId, anchor.columnName)])
  const queue: Array<{ ref: FieldGraphNodeRef; distance: number; path: Array<Record<string, unknown>>; confidence: number }> = [{ ref: anchor, distance: 0, path: [], confidence: 1 }]
  const traversed: TraversedColumn[] = []

  while (queue.length) {
    const current = queue.shift()!
    if (current.distance >= maxDepth) continue
    const outgoing = adjacency.get(columnKey(current.ref.assetId, current.ref.columnName)) ?? []
    for (const edge of outgoing) {
      const nextKey = columnKey(edge.target.assetId, edge.target.columnName)
      if (visited.has(nextKey)) continue
      visited.add(nextKey)
      const mapping = toColumnMapping(edge)
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
      queue.push({ ref: edge.target, distance: current.distance + 1, path: nextPath, confidence })
    }
  }

  return traversed
}

export async function analyzeColumnLineageImpact(input: {
  projectId: string
  datasetId: string
  datasetName?: string | null
  affectedColumns: string[]
  maxDepth?: number
  maxEdges?: number
  rootRiskScore?: number | null
  triggerType?: string | null
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const maxDepth = Math.max(1, Math.min(4, Math.trunc(input.maxDepth ?? 4)))
  const maxEdges = Math.max(10, Math.min(300, Math.trunc(input.maxEdges ?? 240)))
  const rootRisk = clamp(input.rootRiskScore ?? 0.7)
  const requestedColumns = [...new Set(input.affectedColumns.map((column) => column.trim()).filter(Boolean))].slice(0, 50)

  const { data: rootAssets, error: rootAssetError } = await admin.schema('governance').from('lineage_assets')
    .select('id,namespace,name,asset_type,dataset_id,metadata')
    .eq('project_id', input.projectId)
    .eq('dataset_id', input.datasetId)
  if (rootAssetError) throw new Error(`Unable to resolve lineage assets for column impact: ${rootAssetError.message}`)

  const graphProvider = getFieldGraphProvider()
  const rootRows = (rootAssets ?? []) as LineageAsset[]
  const nodeByKey = new Map<string, FieldGraphNode>()
  const uniqueEdges = new Map<string, FieldGraphEdge>()
  const traversedByTarget = new Map<string, TraversedColumn>()
  let graphTruncated = false
  let graphExhausted = true
  let neighborhoodRequests = 0

  for (const asset of rootRows) {
    for (const column of requestedColumns) {
      neighborhoodRequests += 1
      const anchor = { assetId: asset.id, columnName: column }
      const neighborhood = await graphProvider.fieldNeighborhood({
        projectId: input.projectId,
        anchor,
        direction: 'DOWNSTREAM',
        depth: maxDepth,
        maxEdges,
      })
      graphTruncated ||= neighborhood.truncated
      graphExhausted &&= neighborhood.exhausted
      for (const node of neighborhood.nodes) nodeByKey.set(columnKey(node.assetId, node.columnName), node)
      for (const edge of neighborhood.edges) uniqueEdges.set(edge.id, edge)
      for (const item of traverseFieldEdges(neighborhood.edges, anchor, maxDepth)) {
        const key = columnKey(item.mapping.target_asset_id, item.mapping.target_column)
        const current = traversedByTarget.get(key)
        if (!current || item.distance < current.distance || (item.distance === current.distance && item.confidence > current.confidence)) {
          traversedByTarget.set(key, item)
        }
      }
    }
  }

  const traversed = [...traversedByTarget.values()]
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
    const providerNode = nodeByKey.get(columnKey(mapping.target_asset_id, mapping.target_column))
    const assetLabel = asset ? [asset.namespace, asset.name].filter(Boolean).join('.') : providerNode?.label ?? `asset:${mapping.target_asset_id.slice(0, 8)}`
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
  const rawConfidence = nodes.length ? nodes.reduce((sum, node) => sum + node.confidence, 0) / nodes.length : (rootRows.length ? 0.8 : 0.35)
  const aggregateConfidence = graphTruncated ? clamp(rawConfidence * 0.85, 0.25, 0.96) : rawConfidence
  const scopeQualifier = graphTruncated ? ' within the configured bounded field-graph scope' : ''
  const summary = nodes.length
    ? `${nodes.length} downstream column dependenc${nodes.length === 1 ? 'y' : 'ies'} are affected by ${requestedColumns.length} proposed source column change${requestedColumns.length === 1 ? '' : 's'}${scopeQualifier}; ${criticalAffected.length} reach high or critical governed datasets.`
    : rootRows.length
      ? `No downstream column mappings were found for the selected ${requestedColumns.length} source column${requestedColumns.length === 1 ? '' : 's'} within ${maxDepth} bounded hops.`
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
      root_lineage_asset_ids: rootRows.map((asset) => asset.id),
      field_graph_provider: graphProvider.providerKey,
      field_graph_truncated: graphTruncated,
      field_graph_exhausted: graphExhausted,
      max_edges_per_anchor: maxEdges,
      neighborhood_requests: neighborhoodRequests,
      mapping_count_examined: uniqueEdges.size,
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
        field_graph_provider: graphProvider.providerKey,
        field_graph_truncated: graphTruncated,
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
    metadata: {
      analysis_id: analysis.id,
      affected_columns: requestedColumns,
      affected_count: nodes.length,
      critical_affected_count: criticalAffected.length,
      risk_score: aggregateRisk,
      confidence: aggregateConfidence,
      field_graph_provider: graphProvider.providerKey,
      field_graph_truncated: graphTruncated,
      mapping_count_examined: uniqueEdges.size,
    },
  })

  return {
    analysisId: analysis.id as string,
    affectedCount: nodes.length,
    criticalAffectedCount: criticalAffected.length,
    riskScore: aggregateRisk,
    confidence: aggregateConfidence,
    summary,
    affectedColumns: requestedColumns,
    maxDepth,
    maxEdges,
    graphProvider: graphProvider.providerKey,
    truncated: graphTruncated,
    exhausted: graphExhausted,
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
  maxEdges?: number
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const changeType = input.changeType.trim().toUpperCase() || 'PIPELINE_LOGIC_CHANGE'
  const affectedColumns = [...new Set((input.affectedColumns ?? []).map((column) => column.trim()).filter(Boolean))].slice(0, 50)
  const baseRisk = changeRisk(changeType)
  const maxDepth = Math.max(1, Math.min(4, Math.trunc(input.maxDepth ?? 4)))
  const maxEdges = Math.max(10, Math.min(300, Math.trunc(input.maxEdges ?? 240)))

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
    maxDepth,
    maxEdges: Math.min(400, Math.max(maxEdges, 120)),
    rootRiskScore: baseRisk,
    actorUserId: input.actorUserId ?? null,
  })

  const columnImpact = affectedColumns.length
    ? await analyzeColumnLineageImpact({
        projectId: input.projectId,
        datasetId: input.datasetId,
        datasetName: dataset.name,
        affectedColumns,
        maxDepth,
        maxEdges,
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
  const scopeLimited = datasetImpact.truncated || Boolean(columnImpact?.truncated)
  const rawConfidence = columnImpact
    ? clamp((datasetImpact.confidence + columnImpact.confidence) / 2, 0.25, 0.98)
    : datasetImpact.confidence
  const confidence = scopeLimited ? clamp(rawConfidence * 0.88, 0.25, 0.98) : rawConfidence
  const approvalRequired = riskScore >= 0.75 || criticalAffected > 0 || certifiedAffected > 0
  const decision = approvalRequired ? 'APPROVAL_REQUIRED' : (scopeLimited || riskScore >= 0.5) ? 'REVIEW_REQUIRED' : 'SAFE_TO_PROCEED'

  const businessDescriptions = [...new Set(combinedNodes
    .map((node) => 'businessDescription' in node ? text(node.businessDescription) : '')
    .filter(Boolean))]
  const baseBusinessImpact = datasetImpact.affectedCount === 0 && (columnImpact?.affectedCount ?? 0) === 0
    ? 'No downstream dependency is proven by the current persisted lineage evidence. Absence of lineage evidence is not proof of no impact.'
    : `${datasetImpact.affectedCount} downstream assets and ${columnImpact?.affectedCount ?? 0} mapped downstream columns are within scope. ${criticalAffected} high or critical governed dependencies and ${certifiedAffected} certified dependencies increase change risk.`
  const businessImpact = scopeLimited
    ? `${baseBusinessImpact} The configured graph bound was reached, so the analysis requires review and must not be interpreted as complete-estate proof of safety.`
    : baseBusinessImpact

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
        graph_scope_limited: scopeLimited,
        max_depth: maxDepth,
        max_edges: maxEdges,
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
      graph_scope_limited: scopeLimited,
      max_depth: maxDepth,
      max_edges: maxEdges,
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
    scopeLimited,
    maxDepth,
    maxEdges,
    datasetImpact,
    columnImpact,
  }
}
