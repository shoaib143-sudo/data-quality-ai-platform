import { createAdminClient } from '@/lib/supabase/admin'
import type {
  GraphDirection,
  GraphEdge,
  GraphNeighborhoodRequest,
  GraphNeighborhoodResponse,
  GraphNode,
  GraphNodeRef,
  GraphProvider,
} from '@/lib/data-plane/contracts'

const MAX_DEPTH = 4
const DEFAULT_DEPTH = 2
const MAX_EDGES = 400
const DEFAULT_MAX_EDGES = 200
const MAX_FRONTIER_NODES = 200

const ALLOWED_TYPES = new Set([
  'DATA_SOURCE',
  'DATASET',
  'DATASET_VERSION',
  'PROFILE_RUN',
  'AGENT_RUN',
  'EXTERNAL_ASSET',
])

type EdgeRow = {
  id: string
  project_id: string
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  relationship: string
  transformation_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type TraversedEdge = EdgeRow & { depth: number }

function nodeKey(node: GraphNodeRef) {
  return `${node.type}:${node.id}`
}

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value as number)))
}

function normalizeDirection(value: GraphDirection | undefined): GraphDirection {
  return value && ['UPSTREAM', 'DOWNSTREAM', 'BOTH'].includes(value) ? value : 'BOTH'
}

function groupFrontier(frontier: GraphNodeRef[]) {
  const grouped = new Map<string, string[]>()
  for (const node of frontier.slice(0, MAX_FRONTIER_NODES)) {
    const ids = grouped.get(node.type) ?? []
    ids.push(node.id)
    grouped.set(node.type, ids)
  }
  return grouped
}

async function fetchAdjacentEdges(
  projectId: string,
  frontier: GraphNodeRef[],
  side: 'source' | 'target',
  remaining: number,
) {
  const admin = createAdminClient()
  const rows: EdgeRow[] = []
  for (const [type, ids] of groupFrontier(frontier)) {
    if (rows.length >= remaining) break
    const { data, error } = await admin
      .schema('governance')
      .from('lineage_edges')
      .select('id,project_id,source_type,source_id,target_type,target_id,relationship,transformation_id,metadata,created_at')
      .eq('project_id', projectId)
      .eq(`${side}_type`, type)
      .in(`${side}_id`, ids)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, remaining - rows.length))
    if (error) throw new Error(`Unable to traverse ${side}-side lineage: ${error.message}`)
    rows.push(...((data ?? []) as EdgeRow[]))
  }
  return rows
}

function genericNode(type: string, id: string): GraphNode {
  return {
    type,
    id,
    label: `${type.replaceAll('_', ' ')} ${id.slice(0, 8)}`,
    metadata: {},
  }
}

async function resolveNodeLabels(projectId: string, refs: GraphNodeRef[]) {
  const admin = createAdminClient()
  const grouped = groupFrontier(refs)
  const nodes = new Map<string, GraphNode>()

  for (const ref of refs) nodes.set(nodeKey(ref), genericNode(ref.type, ref.id))

  const sourceIds = grouped.get('DATA_SOURCE') ?? []
  if (sourceIds.length) {
    const { data, error } = await admin
      .schema('catalog')
      .from('data_sources')
      .select('id,name,source_type')
      .eq('project_id', projectId)
      .in('id', sourceIds)
    if (error) throw new Error(`Unable to resolve lineage data sources: ${error.message}`)
    for (const row of data ?? []) {
      nodes.set(`DATA_SOURCE:${row.id}`, {
        type: 'DATA_SOURCE',
        id: row.id,
        label: row.name,
        metadata: { sourceType: row.source_type },
      })
    }
  }

  const datasetIds = grouped.get('DATASET') ?? []
  if (datasetIds.length) {
    const { data, error } = await admin
      .schema('catalog')
      .from('datasets')
      .select('id,name,source_identifier,data_source_id')
      .eq('project_id', projectId)
      .in('id', datasetIds)
    if (error) throw new Error(`Unable to resolve lineage datasets: ${error.message}`)
    for (const row of data ?? []) {
      nodes.set(`DATASET:${row.id}`, {
        type: 'DATASET',
        id: row.id,
        label: row.name,
        metadata: { sourceIdentifier: row.source_identifier, dataSourceId: row.data_source_id },
      })
    }
  }

  const versionIds = grouped.get('DATASET_VERSION') ?? []
  if (versionIds.length) {
    const { data: versions, error: versionError } = await admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id,dataset_id,version_number,status')
      .in('id', versionIds)
    if (versionError) throw new Error(`Unable to resolve dataset versions: ${versionError.message}`)

    const parentIds = [...new Set((versions ?? []).map((row) => row.dataset_id))]
    const { data: parents, error: parentError } = parentIds.length
      ? await admin.schema('catalog').from('datasets').select('id,name').eq('project_id', projectId).in('id', parentIds)
      : { data: [], error: null }
    if (parentError) throw new Error(`Unable to resolve dataset version parents: ${parentError.message}`)
    const parentNames = new Map((parents ?? []).map((row) => [row.id, row.name]))

    for (const row of versions ?? []) {
      const parent = parentNames.get(row.dataset_id)
      if (!parent) continue
      nodes.set(`DATASET_VERSION:${row.id}`, {
        type: 'DATASET_VERSION',
        id: row.id,
        label: `${parent} v${row.version_number}`,
        metadata: { datasetId: row.dataset_id, versionNumber: row.version_number, status: row.status },
      })
    }
  }

  const runIds = grouped.get('PROFILE_RUN') ?? []
  if (runIds.length) {
    const { data: runs, error: runError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .select('id,dataset_version_id,status,started_at,completed_at')
      .in('id', runIds)
    if (runError) throw new Error(`Unable to resolve profile runs: ${runError.message}`)

    const runVersionIds = [...new Set((runs ?? []).map((row) => row.dataset_version_id).filter(Boolean))] as string[]
    const { data: versions, error: versionError } = runVersionIds.length
      ? await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').in('id', runVersionIds)
      : { data: [], error: null }
    if (versionError) throw new Error(`Unable to resolve profile run dataset versions: ${versionError.message}`)

    const runDatasetIds = [...new Set((versions ?? []).map((row) => row.dataset_id))]
    const { data: datasets, error: datasetError } = runDatasetIds.length
      ? await admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).in('id', runDatasetIds)
      : { data: [], error: null }
    if (datasetError) throw new Error(`Unable to resolve profile run project scope: ${datasetError.message}`)

    const allowedDatasetIds = new Set((datasets ?? []).map((row) => row.id))
    const versionDataset = new Map((versions ?? []).map((row) => [row.id, row.dataset_id]))

    for (const row of runs ?? []) {
      const datasetId = row.dataset_version_id ? versionDataset.get(row.dataset_version_id) : null
      if (!datasetId || !allowedDatasetIds.has(datasetId)) continue
      nodes.set(`PROFILE_RUN:${row.id}`, {
        type: 'PROFILE_RUN',
        id: row.id,
        label: `Profile ${row.id.slice(0, 8)}`,
        metadata: {
          datasetVersionId: row.dataset_version_id,
          status: row.status,
          startedAt: row.started_at,
          completedAt: row.completed_at,
        },
      })
    }
  }

  const assetIds = grouped.get('EXTERNAL_ASSET') ?? []
  if (assetIds.length) {
    const { data, error } = await admin
      .schema('governance')
      .from('lineage_assets')
      .select('id,namespace,name,asset_type,dataset_id')
      .eq('project_id', projectId)
      .in('id', assetIds)
    if (error) throw new Error(`Unable to resolve external lineage assets: ${error.message}`)
    for (const row of data ?? []) {
      nodes.set(`EXTERNAL_ASSET:${row.id}`, {
        type: 'EXTERNAL_ASSET',
        id: row.id,
        label: row.namespace ? `${row.namespace} · ${row.name}` : row.name,
        metadata: { assetType: row.asset_type, datasetId: row.dataset_id },
      })
    }
  }

  return [...nodes.values()]
}

async function resolveTransformations(ids: string[]) {
  const transformations = new Map<string, Record<string, unknown>>()
  if (!ids.length) return transformations

  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('governance')
    .from('lineage_transformations')
    .select('id,name,operation,logic_language,source_system')
    .in('id', ids)
  if (error) throw new Error(`Unable to resolve lineage transformations: ${error.message}`)

  for (const row of data ?? []) {
    transformations.set(row.id, {
      name: row.name,
      operation: row.operation,
      logicLanguage: row.logic_language,
      sourceSystem: row.source_system,
    })
  }
  return transformations
}

export class PostgresGraphProvider implements GraphProvider {
  readonly providerKey = 'postgres'

  async neighborhood(request: GraphNeighborhoodRequest): Promise<GraphNeighborhoodResponse> {
    const projectId = request.projectId
    const anchor = { type: request.anchor.type.toUpperCase(), id: request.anchor.id }
    if (!ALLOWED_TYPES.has(anchor.type)) {
      throw new Error(`Unsupported anchor type. Allowed values: ${[...ALLOWED_TYPES].join(', ')}`)
    }

    const direction = normalizeDirection(request.direction)
    const depth = clamp(request.depth, DEFAULT_DEPTH, 1, MAX_DEPTH)
    const maxEdges = clamp(request.maxEdges, DEFAULT_MAX_EDGES, 10, MAX_EDGES)

    const seenNodes = new Map<string, GraphNodeRef>([[nodeKey(anchor), anchor]])
    const seenEdges = new Map<string, TraversedEdge>()
    let frontier: GraphNodeRef[] = [anchor]
    let exhausted = false

    for (let currentDepth = 1; currentDepth <= depth && frontier.length && seenEdges.size < maxEdges; currentDepth += 1) {
      const remaining = maxEdges - seenEdges.size
      const requests: Promise<EdgeRow[]>[] = []
      if (direction === 'DOWNSTREAM' || direction === 'BOTH') requests.push(fetchAdjacentEdges(projectId, frontier, 'source', remaining))
      if (direction === 'UPSTREAM' || direction === 'BOTH') requests.push(fetchAdjacentEdges(projectId, frontier, 'target', remaining))
      const adjacent = (await Promise.all(requests)).flat()
      const next = new Map<string, GraphNodeRef>()

      for (const edge of adjacent) {
        if (seenEdges.size >= maxEdges) break
        if (!seenEdges.has(edge.id)) seenEdges.set(edge.id, { ...edge, depth: currentDepth })
        const source = { type: edge.source_type, id: edge.source_id }
        const target = { type: edge.target_type, id: edge.target_id }
        for (const node of [source, target]) {
          const key = nodeKey(node)
          if (!seenNodes.has(key)) {
            seenNodes.set(key, node)
            next.set(key, node)
          }
        }
      }

      frontier = [...next.values()].slice(0, MAX_FRONTIER_NODES)
      if (!adjacent.length) exhausted = true
    }

    const nodes = await resolveNodeLabels(projectId, [...seenNodes.values()])
    const transformationIds = [...new Set([...seenEdges.values()].map((edge) => edge.transformation_id).filter(Boolean))] as string[]
    const transformations = await resolveTransformations(transformationIds)

    const edges: GraphEdge[] = [...seenEdges.values()].map((edge) => ({
      id: edge.id,
      source: { type: edge.source_type, id: edge.source_id },
      target: { type: edge.target_type, id: edge.target_id },
      relationship: edge.relationship,
      transformationId: edge.transformation_id,
      transformation: edge.transformation_id ? transformations.get(edge.transformation_id) ?? null : null,
      depth: edge.depth,
      metadata: edge.metadata ?? {},
    }))

    return {
      projectId,
      anchor,
      direction,
      requestedDepth: depth,
      maxEdges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      truncated: edges.length >= maxEdges || frontier.length >= MAX_FRONTIER_NODES,
      exhausted,
      nodes,
      edges,
      limits: { maxDepth: MAX_DEPTH, maxEdges: MAX_EDGES, maxFrontierNodes: MAX_FRONTIER_NODES },
    }
  }
}
