import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TYPES = new Set([
  'DATA_SOURCE',
  'DATASET',
  'DATASET_VERSION',
  'PROFILE_RUN',
  'AGENT_RUN',
  'EXTERNAL_ASSET',
])

const MAX_DEPTH = 4
const DEFAULT_DEPTH = 2
const MAX_EDGES = 400
const DEFAULT_MAX_EDGES = 200
const MAX_FRONTIER_NODES = 200

type Direction = 'UPSTREAM' | 'DOWNSTREAM' | 'BOTH'
type NodeRef = { type: string; id: string }
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

function nodeKey(node: NodeRef) {
  return `${node.type}:${node.id}`
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function groupFrontier(frontier: NodeRef[]) {
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
  frontier: NodeRef[],
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

async function resolveNodeLabels(projectId: string, refs: NodeRef[]) {
  const admin = createAdminClient()
  const grouped = groupFrontier(refs)
  const nodes = new Map<string, { type: string; id: string; label: string; metadata: Record<string, unknown> }>()
  const generic = (type: string, id: string) => nodes.set(`${type}:${id}`, { type, id, label: `${type.replaceAll('_', ' ')} ${id.slice(0, 8)}`, metadata: {} })
  for (const ref of refs) generic(ref.type, ref.id)

  const sourceIds = grouped.get('DATA_SOURCE') ?? []
  if (sourceIds.length) {
    const { data, error } = await admin.schema('catalog').from('data_sources').select('id,name,source_type').eq('project_id', projectId).in('id', sourceIds)
    if (error) throw new Error(`Unable to resolve lineage data sources: ${error.message}`)
    for (const row of data ?? []) nodes.set(`DATA_SOURCE:${row.id}`, { type: 'DATA_SOURCE', id: row.id, label: row.name, metadata: { sourceType: row.source_type } })
  }

  const datasetIds = grouped.get('DATASET') ?? []
  if (datasetIds.length) {
    const { data, error } = await admin.schema('catalog').from('datasets').select('id,name,source_identifier,data_source_id').eq('project_id', projectId).in('id', datasetIds)
    if (error) throw new Error(`Unable to resolve lineage datasets: ${error.message}`)
    for (const row of data ?? []) nodes.set(`DATASET:${row.id}`, { type: 'DATASET', id: row.id, label: row.name, metadata: { sourceIdentifier: row.source_identifier, dataSourceId: row.data_source_id } })
  }

  const versionIds = grouped.get('DATASET_VERSION') ?? []
  if (versionIds.length) {
    const { data, error } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status').in('id', versionIds)
    if (error) throw new Error(`Unable to resolve dataset versions: ${error.message}`)
    const missingDatasetIds = [...new Set((data ?? []).map((row) => row.dataset_id).filter((id) => !nodes.has(`DATASET:${id}`)))]
    const datasetNames = new Map<string, string>()
    if (missingDatasetIds.length) {
      const { data: parents, error: parentError } = await admin.schema('catalog').from('datasets').select('id,name').eq('project_id', projectId).in('id', missingDatasetIds)
      if (parentError) throw new Error(`Unable to resolve dataset version parents: ${parentError.message}`)
      for (const parent of parents ?? []) datasetNames.set(parent.id, parent.name)
    }
    for (const row of data ?? []) {
      const parent = nodes.get(`DATASET:${row.dataset_id}`)?.label ?? datasetNames.get(row.dataset_id) ?? 'Dataset'
      nodes.set(`DATASET_VERSION:${row.id}`, { type: 'DATASET_VERSION', id: row.id, label: `${parent} v${row.version_number}`, metadata: { datasetId: row.dataset_id, versionNumber: row.version_number, status: row.status } })
    }
  }

  const runIds = grouped.get('PROFILE_RUN') ?? []
  if (runIds.length) {
    const { data, error } = await admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,started_at,completed_at').in('id', runIds)
    if (error) throw new Error(`Unable to resolve profile runs: ${error.message}`)
    for (const row of data ?? []) nodes.set(`PROFILE_RUN:${row.id}`, { type: 'PROFILE_RUN', id: row.id, label: `Profile ${row.id.slice(0, 8)}`, metadata: { datasetVersionId: row.dataset_version_id, status: row.status, startedAt: row.started_at, completedAt: row.completed_at } })
  }

  const assetIds = grouped.get('EXTERNAL_ASSET') ?? []
  if (assetIds.length) {
    const { data, error } = await admin.schema('governance').from('lineage_assets').select('id,namespace,name,asset_type,dataset_id').eq('project_id', projectId).in('id', assetIds)
    if (error) throw new Error(`Unable to resolve external lineage assets: ${error.message}`)
    for (const row of data ?? []) nodes.set(`EXTERNAL_ASSET:${row.id}`, { type: 'EXTERNAL_ASSET', id: row.id, label: row.namespace ? `${row.namespace} · ${row.name}` : row.name, metadata: { assetType: row.asset_type, datasetId: row.dataset_id } })
  }

  return [...nodes.values()]
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = (url.searchParams.get('projectId') ?? '').trim()
    const anchorType = (url.searchParams.get('anchorType') ?? '').trim().toUpperCase()
    const anchorId = (url.searchParams.get('anchorId') ?? '').trim()
    const directionRaw = (url.searchParams.get('direction') ?? 'BOTH').trim().toUpperCase()
    const direction: Direction = ['UPSTREAM', 'DOWNSTREAM', 'BOTH'].includes(directionRaw) ? directionRaw as Direction : 'BOTH'
    const depth = parseBoundedInt(url.searchParams.get('depth'), DEFAULT_DEPTH, 1, MAX_DEPTH)
    const maxEdges = parseBoundedInt(url.searchParams.get('maxEdges'), DEFAULT_MAX_EDGES, 10, MAX_EDGES)

    if (!validUuid(projectId) || !validUuid(anchorId)) return NextResponse.json({ error: 'Valid projectId and anchorId UUIDs are required.' }, { status: 400 })
    if (!ALLOWED_TYPES.has(anchorType)) return NextResponse.json({ error: `Unsupported anchorType. Allowed values: ${[...ALLOWED_TYPES].join(', ')}` }, { status: 400 })

    await authorizeProject(user.id, projectId, 'lineage.read')

    const anchor = { type: anchorType, id: anchorId }
    const seenNodes = new Map<string, NodeRef>([[nodeKey(anchor), anchor]])
    const seenEdges = new Map<string, TraversedEdge>()
    let frontier: NodeRef[] = [anchor]
    let exhausted = false

    for (let currentDepth = 1; currentDepth <= depth && frontier.length && seenEdges.size < maxEdges; currentDepth += 1) {
      const remaining = maxEdges - seenEdges.size
      const requests: Promise<EdgeRow[]>[] = []
      if (direction === 'DOWNSTREAM' || direction === 'BOTH') requests.push(fetchAdjacentEdges(projectId, frontier, 'source', remaining))
      if (direction === 'UPSTREAM' || direction === 'BOTH') requests.push(fetchAdjacentEdges(projectId, frontier, 'target', remaining))
      const adjacent = (await Promise.all(requests)).flat()
      const next = new Map<string, NodeRef>()

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

    const nodeRefs = [...seenNodes.values()]
    const nodes = await resolveNodeLabels(projectId, nodeRefs)
    const transformationIds = [...new Set([...seenEdges.values()].map((edge) => edge.transformation_id).filter(Boolean))] as string[]
    const transformations = new Map<string, Record<string, unknown>>()
    if (transformationIds.length) {
      const admin = createAdminClient()
      const { data, error } = await admin.schema('governance').from('lineage_transformations').select('id,name,operation,logic_language,source_system').in('id', transformationIds)
      if (error) throw new Error(`Unable to resolve lineage transformations: ${error.message}`)
      for (const row of data ?? []) transformations.set(row.id, { name: row.name, operation: row.operation, logicLanguage: row.logic_language, sourceSystem: row.source_system })
    }

    const edges = [...seenEdges.values()].map((edge) => ({
      id: edge.id,
      source: { type: edge.source_type, id: edge.source_id },
      target: { type: edge.target_type, id: edge.target_id },
      relationship: edge.relationship,
      transformationId: edge.transformation_id,
      transformation: edge.transformation_id ? transformations.get(edge.transformation_id) ?? null : null,
      depth: edge.depth,
      metadata: edge.metadata ?? {},
    }))

    return NextResponse.json({
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
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    console.error('Lineage neighborhood query failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to query lineage neighborhood.' }, { status: 500 })
  }
}
