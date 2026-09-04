import type { GraphDirection, TenantScope } from '@/lib/data-plane/contracts'

export type FieldGraphNodeRef = {
  assetId: string
  columnName: string
}

export type FieldGraphNode = FieldGraphNodeRef & {
  label: string
  datasetId: string | null
  assetType: string | null
  metadata: Record<string, unknown>
}

export type FieldGraphEdge = {
  id: string
  source: FieldGraphNodeRef
  target: FieldGraphNodeRef
  operation: string | null
  expression: string | null
  transformationId: string | null
  transformation: Record<string, unknown> | null
  depth: number
  metadata: Record<string, unknown>
}

export type FieldGraphNeighborhoodRequest = TenantScope & {
  anchor: FieldGraphNodeRef
  direction?: GraphDirection
  depth?: number
  maxEdges?: number
}

export type FieldGraphNeighborhoodResponse = {
  projectId: string
  anchor: FieldGraphNodeRef
  direction: GraphDirection
  requestedDepth: number
  maxEdges: number
  nodeCount: number
  edgeCount: number
  truncated: boolean
  exhausted: boolean
  nodes: FieldGraphNode[]
  edges: FieldGraphEdge[]
  limits: {
    maxDepth: number
    maxEdges: number
    maxFrontierNodes: number
  }
}

export interface FieldGraphProvider {
  readonly providerKey: string
  fieldNeighborhood(request: FieldGraphNeighborhoodRequest): Promise<FieldGraphNeighborhoodResponse>
}
