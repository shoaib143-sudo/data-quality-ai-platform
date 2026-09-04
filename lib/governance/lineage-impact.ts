import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { getGraphProvider } from '@/lib/data-plane/graph-provider'

type Direction = 'DOWNSTREAM' | 'UPSTREAM'

type LineageEdge = {
  id: string
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  relationship: string
  transformation_id: string | null
  metadata: Record<string, unknown> | null
}

type TraversedNode = {
  assetType: string
  assetId: string
  distance: number
  path: Array<Record<string, unknown>>
  edgeEvidence: Array<Record<string, unknown>>
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function clamp(value: number, min = 0, max = 1) { return Math.max(min, Math.min(max, value)) }
function nodeKey(type: string, id: string) { return `${type.toUpperCase()}:${id}` }
function criticalityWeight(value: unknown) {
  const weights: Record<string, number> = { LOW: 0.15, MEDIUM: 0.35, HIGH: 0.7, CRITICAL: 1 }
  return weights[text(value).toUpperCase()] ?? 0.25
}
function certificationWeight(value: unknown) {
  const status = text(value).toUpperCase()
  if (status === 'CERTIFIED') return 0.18
  if (status === 'PENDING') return 0.08
  return 0
}
function edgeConfidence(edge: LineageEdge) {
  const metadata = object(edge.metadata)
  let score = 0.65
  if (metadata.integration_id || metadata.external_event_id) score += 0.12
  if (edge.transformation_id || metadata.transformation_id || metadata.logic_hash) score += 0.12
  if (metadata.auto_discovered === true) score += 0.05
  if (metadata.manual === true) score -= 0.05
  return clamp(score, 0.35, 0.95)
}

async function resolveNamesAndGovernance(projectId: string, nodes: TraversedNode[]) {
  const admin = createAdminClient()
  const datasetIds = [...new Set(nodes.filter((node) => node.assetType.toUpperCase() === 'DATASET').map((node) => node.assetId))]
  const externalIds = [...new Set(nodes.filter((node) => node.assetType.toUpperCase() === 'EXTERNAL_ASSET').map((node) => node.assetId))]

  const [datasetsResult, catalogResult, externalResult] = await Promise.all([
    datasetIds.length
      ? admin.schema('catalog').from('datasets').select('id,name').eq('project_id', projectId).in('id', datasetIds)
      : Promise.resolve({ data: [], error: null }),
    datasetIds.length
      ? admin.schema('governance').from('dataset_catalog').select('dataset_id,criticality,certification_status,business_description').eq('project_id', projectId).in('dataset_id', datasetIds)
      : Promise.resolve({ data: [], error: null }),
    externalIds.length
      ? admin.schema('governance').from('lineage_assets').select('id,namespace,name,asset_type,dataset_id,metadata').eq('project_id', projectId).in('id', externalIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  const firstError = [datasetsResult.error, catalogResult.error, externalResult.error].find(Boolean)
  if (firstError) throw new Error(`Unable to enrich lineage impact assets: ${firstError.message}`)

  const datasetById = new Map((datasetsResult.data ?? []).map((row) => [row.id, row]))
  const catalogById = new Map((catalogResult.data ?? []).map((row) => [row.dataset_id, row]))
  const externalById = new Map((externalResult.data ?? []).map((row) => [row.id, row]))

  return nodes.map((node) => {
    const type = node.assetType.toUpperCase()
    if (type === 'DATASET') {
      const dataset = datasetById.get(node.assetId)
      const governance = catalogById.get(node.assetId)
      return {
        ...node,
        assetName: dataset?.name ?? `dataset:${node.assetId.slice(0, 8)}`,
        criticality: governance?.criticality ?? 'MEDIUM',
        certificationStatus: governance?.certification_status ?? 'UNCERTIFIED',
        businessDescription: governance?.business_description ?? null,
      }
    }
    if (type === 'EXTERNAL_ASSET') {
      const asset = externalById.get(node.assetId)
      return {
        ...node,
        assetName: asset ? [asset.namespace, asset.name].filter(Boolean).join('.') : `external:${node.assetId.slice(0, 8)}`,
        criticality: 'MEDIUM',
        certificationStatus: 'UNCERTIFIED',
        businessDescription: null,
      }
    }
    return {
      ...node,
      assetName: `${type.toLowerCase()}:${node.assetId.slice(0, 8)}`,
      criticality: 'MEDIUM',
      certificationStatus: 'UNCERTIFIED',
      businessDescription: null,
    }
  })
}

function traverse(edges: LineageEdge[], rootType: string, rootId: string, direction: Direction, maxDepth: number) {
  const adjacency = new Map<string, LineageEdge[]>()
  for (const edge of edges) {
    const key = direction === 'DOWNSTREAM'
      ? nodeKey(edge.source_type, edge.source_id)
      : nodeKey(edge.target_type, edge.target_id)
    const current = adjacency.get(key) ?? []
    current.push(edge)
    adjacency.set(key, current)
  }

  const visited = new Set<string>([nodeKey(rootType, rootId)])
  const result: TraversedNode[] = []
  const queue: Array<{ assetType: string; assetId: string; distance: number; path: Array<Record<string, unknown>>; evidence: Array<Record<string, unknown>> }> = [{ assetType: rootType, assetId: rootId, distance: 0, path: [], evidence: [] }]

  while (queue.length) {
    const current = queue.shift()!
    if (current.distance >= maxDepth) continue
    const outgoing = adjacency.get(nodeKey(current.assetType, current.assetId)) ?? []
    for (const edge of outgoing) {
      const nextType = direction === 'DOWNSTREAM' ? edge.target_type : edge.source_type
      const nextId = direction === 'DOWNSTREAM' ? edge.target_id : edge.source_id
      const key = nodeKey(nextType, nextId)
      if (visited.has(key)) continue
      visited.add(key)
      const step = {
        edge_id: edge.id,
        relationship: edge.relationship,
        source_type: edge.source_type,
        source_id: edge.source_id,
        target_type: edge.target_type,
        target_id: edge.target_id,
        transformation_id: edge.transformation_id,
      }
      const nextPath = [...current.path, step]
      const edgeEvidence = [...current.evidence, {
        edge_id: edge.id,
        relationship: edge.relationship,
        confidence: edgeConfidence(edge),
        metadata: object(edge.metadata),
      }]
      const node: TraversedNode = { assetType: nextType, assetId: nextId, distance: current.distance + 1, path: nextPath, edgeEvidence }
      result.push(node)
      queue.push({ assetType: nextType, assetId: nextId, distance: node.distance, path: nextPath, evidence: edgeEvidence })
    }
  }
  return result
}

export async function analyzeLineageImpact(input: {
  projectId: string
  rootAssetType: string
  rootAssetId: string
  rootAssetName?: string | null
  triggerType?: string | null
  triggerId?: string | null
  direction?: Direction
  maxDepth?: number
  maxEdges?: number
  rootRiskScore?: number | null
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const direction: Direction = input.direction ?? 'DOWNSTREAM'
  const maxDepth = Math.max(1, Math.min(4, Math.trunc(input.maxDepth ?? 4)))
  const maxEdges = Math.max(10, Math.min(400, Math.trunc(input.maxEdges ?? 400)))
  const rootType = input.rootAssetType.trim().toUpperCase()
  const rootRisk = clamp(input.rootRiskScore ?? 0.65)

  const graphProvider = getGraphProvider()
  const neighborhood = await graphProvider.neighborhood({
    projectId: input.projectId,
    anchor: { type: rootType, id: input.rootAssetId },
    direction,
    depth: maxDepth,
    maxEdges,
  })
  const edges: LineageEdge[] = neighborhood.edges.map((edge) => ({
    id: edge.id,
    source_type: edge.source.type,
    source_id: edge.source.id,
    target_type: edge.target.type,
    target_id: edge.target.id,
    relationship: edge.relationship,
    transformation_id: edge.transformationId ?? null,
    metadata: {
      ...object(edge.metadata),
      graph_depth: edge.depth,
      ...(edge.transformation ? { transformation: edge.transformation } : {}),
    },
  }))

  const traversed = traverse(edges, rootType, input.rootAssetId, direction, maxDepth)
  const enriched = await resolveNamesAndGovernance(input.projectId, traversed)

  const scored = enriched.map((node) => {
    const pathConfidence = node.edgeEvidence.length
      ? node.edgeEvidence.reduce((acc, edge) => acc * Number(edge.confidence ?? 0.6), 1) ** (1 / node.edgeEvidence.length)
      : 0.5
    const distanceDecay = 1 / (1 + (node.distance - 1) * 0.3)
    const governanceBoost = criticalityWeight(node.criticality) * 0.3 + certificationWeight(node.certificationStatus)
    const riskScore = clamp(rootRisk * distanceDecay * 0.7 + governanceBoost)
    const confidence = clamp(pathConfidence * (1 / (1 + (node.distance - 1) * 0.08)), 0.25, 0.95)
    return { ...node, riskScore, confidence }
  })

  const criticalAffected = scored.filter((node) => ['HIGH', 'CRITICAL'].includes(text(node.criticality).toUpperCase()))
  const aggregateRisk = scored.length ? Math.max(...scored.map((node) => node.riskScore)) : 0
  const aggregateConfidence = scored.length ? scored.reduce((sum, node) => sum + node.confidence, 0) / scored.length : 1
  const scopeQualifier = neighborhood.truncated ? ' within the configured bounded graph scope' : ''
  const summary = scored.length
    ? `${scored.length} ${direction.toLowerCase()} lineage asset${scored.length === 1 ? '' : 's'} are within ${maxDepth} hop${maxDepth === 1 ? '' : 's'} of ${input.rootAssetName ?? `${rootType}:${input.rootAssetId.slice(0, 8)}`}${scopeQualifier}; ${criticalAffected.length} are high or critical governance assets.`
    : `No ${direction.toLowerCase()} lineage dependencies were found within ${maxDepth} hop${maxDepth === 1 ? '' : 's'} of ${input.rootAssetName ?? `${rootType}:${input.rootAssetId.slice(0, 8)}`}.`

  const now = new Date().toISOString()
  const { data: analysis, error: analysisError } = await admin.schema('governance').from('lineage_impact_analyses').insert({
    project_id: input.projectId,
    root_asset_type: rootType,
    root_asset_id: input.rootAssetId,
    root_asset_name: input.rootAssetName ?? null,
    trigger_type: input.triggerType?.trim().toUpperCase() || null,
    trigger_id: input.triggerId ?? null,
    direction,
    max_depth: maxDepth,
    affected_count: scored.length,
    critical_affected_count: criticalAffected.length,
    risk_score: aggregateRisk,
    confidence: aggregateConfidence,
    summary,
    evidence: {
      graph_provider: graphProvider.providerKey,
      graph_truncated: neighborhood.truncated,
      graph_exhausted: neighborhood.exhausted,
      graph_node_count: neighborhood.nodeCount,
      edge_count_examined: neighborhood.edgeCount,
      requested_depth: neighborhood.requestedDepth,
      max_edges: neighborhood.maxEdges,
      provider_limits: neighborhood.limits,
      root_risk_score: rootRisk,
      relationships: [...new Set(traversed.flatMap((node) => node.path.map((step) => text(step.relationship))).filter(Boolean))],
      generated_at: now,
    },
    updated_at: now,
  }).select('id').single()
  if (analysisError || !analysis) throw new Error(`Unable to persist lineage impact analysis: ${analysisError?.message ?? 'unknown error'}`)

  if (scored.length) {
    const rows = scored.map((node) => ({
      analysis_id: analysis.id,
      project_id: input.projectId,
      asset_type: node.assetType.toUpperCase(),
      asset_id: node.assetId,
      asset_name: node.assetName,
      distance: node.distance,
      path: node.path,
      criticality: node.criticality,
      certification_status: node.certificationStatus,
      risk_score: node.riskScore,
      confidence: node.confidence,
      evidence: {
        edge_evidence: node.edgeEvidence,
        business_description: node.businessDescription,
        graph_provider: graphProvider.providerKey,
        graph_truncated: neighborhood.truncated,
      },
    }))
    const { error: nodeError } = await admin.schema('governance').from('lineage_impact_nodes').insert(rows)
    if (nodeError) throw new Error(`Unable to persist lineage impact nodes: ${nodeError.message}`)
  }

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'AGENT',
    eventType: 'LINEAGE_IMPACT_ANALYZED',
    entityType: rootType,
    entityId: input.rootAssetId,
    correlationId: input.triggerId ?? null,
    metadata: {
      analysis_id: analysis.id,
      direction,
      max_depth: maxDepth,
      max_edges: maxEdges,
      graph_provider: graphProvider.providerKey,
      graph_truncated: neighborhood.truncated,
      affected_count: scored.length,
      critical_affected_count: criticalAffected.length,
      risk_score: aggregateRisk,
      confidence: aggregateConfidence,
      trigger_type: input.triggerType ?? null,
    },
  })

  return {
    analysisId: analysis.id as string,
    projectId: input.projectId,
    rootAssetType: rootType,
    rootAssetId: input.rootAssetId,
    direction,
    maxDepth,
    maxEdges,
    graphProvider: graphProvider.providerKey,
    truncated: neighborhood.truncated,
    exhausted: neighborhood.exhausted,
    affectedCount: scored.length,
    criticalAffectedCount: criticalAffected.length,
    riskScore: aggregateRisk,
    confidence: aggregateConfidence,
    summary,
    nodes: scored,
  }
}

export async function enrichObservabilityIncidentWithLineageImpact(input: {
  incidentId: string
  projectId: string
  datasetId: string
  severity?: string | null
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const severityRisk: Record<string, number> = { INFO: 0.25, LOW: 0.35, MEDIUM: 0.55, HIGH: 0.75, CRITICAL: 0.95 }
  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,name').eq('id', input.datasetId).eq('project_id', input.projectId).maybeSingle()
  if (datasetError || !dataset) throw new Error(`Unable to resolve incident dataset for lineage impact: ${datasetError?.message ?? 'not found'}`)

  const analysis = await analyzeLineageImpact({
    projectId: input.projectId,
    rootAssetType: 'DATASET',
    rootAssetId: input.datasetId,
    rootAssetName: dataset.name,
    triggerType: 'OBSERVABILITY_INCIDENT',
    triggerId: input.incidentId,
    direction: 'DOWNSTREAM',
    maxDepth: 4,
    maxEdges: 400,
    rootRiskScore: severityRisk[text(input.severity).toUpperCase()] ?? 0.65,
    actorUserId: input.actorUserId ?? null,
  })

  await admin.schema('governance').from('observability_incident_impacts').delete().eq('incident_id', input.incidentId)
  if (analysis.nodes.length) {
    const impactRows = analysis.nodes.slice(0, 500).map((node) => ({
      incident_id: input.incidentId,
      project_id: input.projectId,
      asset_type: node.assetType.toUpperCase(),
      asset_id: node.assetId,
      asset_name: node.assetName,
      impact_type: 'DOWNSTREAM_DEPENDENCY',
      distance: node.distance,
      risk_score: node.riskScore,
      confidence: node.confidence,
      evidence: {
        analysis_id: analysis.analysisId,
        path: node.path,
        criticality: node.criticality,
        certification_status: node.certificationStatus,
        graph_provider: analysis.graphProvider,
        graph_truncated: analysis.truncated,
      },
    }))
    const { error: impactError } = await admin.schema('governance').from('observability_incident_impacts').insert(impactRows)
    if (impactError) throw new Error(`Unable to persist incident lineage impacts: ${impactError.message}`)
  }

  const { data: incident, error: incidentError } = await admin.schema('governance').from('observability_incidents').select('evidence,risk').eq('id', input.incidentId).maybeSingle()
  if (incidentError || !incident) throw new Error(`Unable to update incident impact evidence: ${incidentError?.message ?? 'not found'}`)
  const evidence = object(incident.evidence)
  const risk = object(incident.risk)
  await admin.schema('governance').from('observability_incidents').update({
    evidence: {
      ...evidence,
      lineage_impact_analysis_id: analysis.analysisId,
      lineage_affected_count: analysis.affectedCount,
      lineage_critical_affected_count: analysis.criticalAffectedCount,
      lineage_graph_provider: analysis.graphProvider,
      lineage_graph_truncated: analysis.truncated,
    },
    risk: {
      ...risk,
      lineage_risk_score: analysis.riskScore,
      lineage_confidence: analysis.confidence,
      downstream_affected_count: analysis.affectedCount,
    },
    updated_at: new Date().toISOString(),
  }).eq('id', input.incidentId)

  return analysis
}
