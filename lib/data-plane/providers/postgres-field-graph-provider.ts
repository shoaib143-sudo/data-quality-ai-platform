import { createAdminClient } from '@/lib/supabase/admin'
import type { GraphDirection } from '@/lib/data-plane/contracts'
import type {
  FieldGraphEdge,
  FieldGraphNeighborhoodRequest,
  FieldGraphNeighborhoodResponse,
  FieldGraphNode,
  FieldGraphNodeRef,
  FieldGraphProvider,
} from '@/lib/data-plane/field-graph-contracts'

const MAX_DEPTH = 4
const DEFAULT_DEPTH = 2
const MAX_EDGES = 300
const DEFAULT_MAX_EDGES = 120
const MAX_FRONTIER_NODES = 150

type MappingRow = {
  id: string
  project_id: string
  transformation_id: string
  source_asset_id: string | null
  source_column: string | null
  target_asset_id: string | null
  target_column: string | null
  operation: string | null
  expression: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type TraversedMapping = MappingRow & { depth: number }

function normalizeColumn(value: string) {
  return value.trim().toLowerCase()
}

function nodeKey(ref: FieldGraphNodeRef) {
  return `${ref.assetId}:${normalizeColumn(ref.columnName)}`
}

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value as number)))
}

function direction(value: GraphDirection | undefined): GraphDirection {
  return value && ['UPSTREAM', 'DOWNSTREAM', 'BOTH'].includes(value) ? value : 'BOTH'
}

function groupByAsset(frontier: FieldGraphNodeRef[]) {
  const grouped = new Map<string, string[]>()
  for (const ref of frontier.slice(0, MAX_FRONTIER_NODES)) {
    const columns = grouped.get(ref.assetId) ?? []
    if (!columns.includes(ref.columnName)) columns.push(ref.columnName)
    grouped.set(ref.assetId, columns)
  }
  return grouped
}

async function fetchAdjacentMappings(
  projectId: string,
  frontier: FieldGraphNodeRef[],
  side: 'source' | 'target',
  remaining: number,
) {
  const admin = createAdminClient()
  const rows: MappingRow[] = []
  for (const [assetId, columns] of groupByAsset(frontier)) {
    if (rows.length >= remaining) break
    const { data, error } = await admin
      .schema('governance')
      .from('lineage_column_mappings')
      .select('id,project_id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression,metadata,created_at')
      .eq('project_id', projectId)
      .eq(`${side}_asset_id`, assetId)
      .in(`${side}_column`, columns)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, remaining - rows.length))
    if (error) throw new Error(`Unable to traverse ${side}-side field lineage: ${error.message}`)
    rows.push(...((data ?? []) as MappingRow[]))
  }
  return rows
}

async function resolveFieldNodes(projectId: string, refs: FieldGraphNodeRef[]): Promise<FieldGraphNode[]> {
  const admin = createAdminClient()
  const assetIds = [...new Set(refs.map((ref) => ref.assetId))]
  const { data, error } = assetIds.length
    ? await admin
      .schema('governance')
      .from('lineage_assets')
      .select('id,namespace,name,asset_type,dataset_id,metadata')
      .eq('project_id', projectId)
      .in('id', assetIds)
    : { data: [], error: null }
  if (error) throw new Error(`Unable to resolve field lineage assets: ${error.message}`)

  const assets = new Map((data ?? []).map((row) => [row.id, row]))
  return refs.map((ref) => {
    const asset = assets.get(ref.assetId)
    const assetLabel = asset ? (asset.namespace ? `${asset.namespace} · ${asset.name}` : asset.name) : `Asset ${ref.assetId.slice(0, 8)}`
    return {
      ...ref,
      label: `${assetLabel}.${ref.columnName}`,
      datasetId: asset?.dataset_id ?? null,
      assetType: asset?.asset_type ?? null,
      metadata: asset?.metadata && typeof asset.metadata === 'object' ? asset.metadata as Record<string, unknown> : {},
    }
  })
}

async function resolveTransformations(projectId: string, ids: string[]) {
  const admin = createAdminClient()
  const map = new Map<string, Record<string, unknown>>()
  if (!ids.length) return map
  const { data, error } = await admin
    .schema('governance')
    .from('lineage_transformations')
    .select('id,name,operation,logic_language,source_system')
    .eq('project_id', projectId)
    .in('id', ids)
  if (error) throw new Error(`Unable to resolve field lineage transformations: ${error.message}`)
  for (const row of data ?? []) {
    map.set(row.id, {
      name: row.name,
      operation: row.operation,
      logicLanguage: row.logic_language,
      sourceSystem: row.source_system,
    })
  }
  return map
}

export class PostgresFieldGraphProvider implements FieldGraphProvider {
  readonly providerKey = 'postgres'

  async fieldNeighborhood(request: FieldGraphNeighborhoodRequest): Promise<FieldGraphNeighborhoodResponse> {
    const projectId = request.projectId
    const anchor = {
      assetId: request.anchor.assetId,
      columnName: request.anchor.columnName.trim(),
    }
    if (!anchor.assetId || !anchor.columnName) throw new Error('Field lineage anchor requires assetId and columnName.')

    const requestedDirection = direction(request.direction)
    const requestedDepth = clamp(request.depth, DEFAULT_DEPTH, 1, MAX_DEPTH)
    const maxEdges = clamp(request.maxEdges, DEFAULT_MAX_EDGES, 10, MAX_EDGES)

    const seenNodes = new Map<string, FieldGraphNodeRef>([[nodeKey(anchor), anchor]])
    const seenEdges = new Map<string, TraversedMapping>()
    let frontier: FieldGraphNodeRef[] = [anchor]
    let exhausted = false
    let frontierTruncated = false

    for (let currentDepth = 1; currentDepth <= requestedDepth && frontier.length && seenEdges.size < maxEdges; currentDepth += 1) {
      const remaining = maxEdges - seenEdges.size
      const requests: Promise<MappingRow[]>[] = []
      if (requestedDirection === 'DOWNSTREAM' || requestedDirection === 'BOTH') requests.push(fetchAdjacentMappings(projectId, frontier, 'source', remaining))
      if (requestedDirection === 'UPSTREAM' || requestedDirection === 'BOTH') requests.push(fetchAdjacentMappings(projectId, frontier, 'target', remaining))
      const adjacent = (await Promise.all(requests)).flat()
      const next = new Map<string, FieldGraphNodeRef>()

      for (const row of adjacent) {
        if (seenEdges.size >= maxEdges) break
        if (!row.source_asset_id || !row.source_column || !row.target_asset_id || !row.target_column) continue
        if (!seenEdges.has(row.id)) seenEdges.set(row.id, { ...row, depth: currentDepth })

        const source = { assetId: row.source_asset_id, columnName: row.source_column }
        const target = { assetId: row.target_asset_id, columnName: row.target_column }
        for (const node of [source, target]) {
          const key = nodeKey(node)
          if (!seenNodes.has(key)) {
            seenNodes.set(key, node)
            next.set(key, node)
          }
        }
      }

      const nextValues = [...next.values()]
      if (nextValues.length > MAX_FRONTIER_NODES) frontierTruncated = true
      frontier = nextValues.slice(0, MAX_FRONTIER_NODES)
      if (!adjacent.length) exhausted = true
    }

    const nodes = await resolveFieldNodes(projectId, [...seenNodes.values()])
    const transformationIds = [...new Set([...seenEdges.values()].map((row) => row.transformation_id).filter(Boolean))]
    const transformations = await resolveTransformations(projectId, transformationIds)

    const edges: FieldGraphEdge[] = [...seenEdges.values()].map((row) => ({
      id: row.id,
      source: { assetId: row.source_asset_id!, columnName: row.source_column! },
      target: { assetId: row.target_asset_id!, columnName: row.target_column! },
      operation: row.operation,
      expression: row.expression,
      transformationId: row.transformation_id,
      transformation: transformations.get(row.transformation_id) ?? null,
      depth: row.depth,
      metadata: row.metadata ?? {},
    }))

    return {
      projectId,
      anchor,
      direction: requestedDirection,
      requestedDepth,
      maxEdges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      truncated: edges.length >= maxEdges || frontierTruncated,
      exhausted,
      nodes,
      edges,
      limits: { maxDepth: MAX_DEPTH, maxEdges: MAX_EDGES, maxFrontierNodes: MAX_FRONTIER_NODES },
    }
  }
}
