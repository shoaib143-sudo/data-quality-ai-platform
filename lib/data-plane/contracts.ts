export type TenantScope = {
  organizationId?: string | null
  projectId: string
}

export type PageRequest = {
  limit?: number
  cursor?: string | null
}

export type PageResult<T> = {
  items: T[]
  nextCursor: string | null
  truncated?: boolean
}

export type KnowledgeObjectType =
  | 'DATASET'
  | 'COLUMN'
  | 'FINDING'
  | 'QUALITY_INCIDENT'
  | 'DOCUMENT'
  | 'DOCUMENT_CHUNK'
  | 'GLOSSARY_TERM'
  | 'POLICY'
  | 'DATA_CONTRACT'
  | 'CLASSIFICATION'
  | 'LINEAGE_TRANSFORMATION'
  | 'AGENT_MEMORY'
  | string

export type KnowledgeSearchRequest = TenantScope & PageRequest & {
  query: string
  objectTypes?: KnowledgeObjectType[]
  lexical?: boolean
  semantic?: boolean
  metadataFilters?: Record<string, string | number | boolean | null>
}

export type KnowledgeSearchResult = {
  objectType: KnowledgeObjectType
  objectId: string
  projectId: string
  label: string
  description: string | null
  score: number
  href?: string | null
  metadata: Record<string, unknown>
}

export type KnowledgeSearchResponse = PageResult<KnowledgeSearchResult> & {
  semanticStatus?: 'ENABLED' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'SKIPPED'
}

export interface KnowledgeSearchProvider {
  readonly providerKey: string
  search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse>
}

export type GraphDirection = 'UPSTREAM' | 'DOWNSTREAM' | 'BOTH'

export type GraphNodeRef = {
  type: string
  id: string
}

export type GraphNode = GraphNodeRef & {
  label: string
  metadata: Record<string, unknown>
}

export type GraphEdge = {
  id: string
  source: GraphNodeRef
  target: GraphNodeRef
  relationship: string
  transformationId?: string | null
  transformation?: Record<string, unknown> | null
  depth: number
  metadata: Record<string, unknown>
}

export type GraphNeighborhoodRequest = TenantScope & {
  anchor: GraphNodeRef
  direction?: GraphDirection
  depth?: number
  maxEdges?: number
}

export type GraphNeighborhoodResponse = {
  projectId: string
  anchor: GraphNodeRef
  direction: GraphDirection
  requestedDepth: number
  maxEdges: number
  nodeCount: number
  edgeCount: number
  truncated: boolean
  exhausted: boolean
  nodes: GraphNode[]
  edges: GraphEdge[]
  limits: {
    maxDepth: number
    maxEdges: number
    maxFrontierNodes?: number
  }
}

export interface GraphProvider {
  readonly providerKey: string
  neighborhood(request: GraphNeighborhoodRequest): Promise<GraphNeighborhoodResponse>
}

export type AnalyticsEvent = TenantScope & {
  eventId: string
  schemaVersion: number
  eventType: string
  occurredAt: string
  aggregateType: string
  aggregateId: string
  aggregateVersion?: string | number | null
  correlationId?: string | null
  causationId?: string | null
  actorType?: string | null
  actorId?: string | null
  payload: Record<string, unknown>
}

export interface AnalyticsEventProvider {
  readonly providerKey: string
  publish(events: AnalyticsEvent[]): Promise<void>
}

export type AnalyticsQueryRequest = TenantScope & {
  metric: string
  from?: string | null
  to?: string | null
  dimensions?: string[]
  filters?: Record<string, string | number | boolean | null>
  limit?: number
}

export type AnalyticsQueryRow = Record<string, string | number | boolean | null>

export interface AnalyticsQueryProvider {
  readonly providerKey: string
  query(request: AnalyticsQueryRequest): Promise<AnalyticsQueryRow[]>
}

export type ObjectStoreWriteRequest = TenantScope & {
  key: string
  contentType?: string | null
  bytes: Uint8Array
  metadata?: Record<string, string>
}

export type ObjectStoreObject = {
  key: string
  contentType: string | null
  size: number | null
  metadata: Record<string, string>
}

export interface ObjectStore {
  readonly providerKey: string
  put(request: ObjectStoreWriteRequest): Promise<ObjectStoreObject>
  get(scope: TenantScope, key: string): Promise<Uint8Array | null>
  delete(scope: TenantScope, key: string): Promise<void>
}

export type ProjectionEvent = AnalyticsEvent & {
  operation: 'UPSERT' | 'DELETE' | 'APPEND' | 'REBUILD'
}

export interface ProjectionPublisher {
  publish(event: ProjectionEvent): Promise<void>
  publishMany(events: ProjectionEvent[]): Promise<void>
}

export type ProjectionCheckpoint = {
  consumerKey: string
  lastCheckpoint: string | null
  lastSuccessAt: string | null
  lagSeconds: number | null
  lastError: string | null
  status: 'HEALTHY' | 'LAGGING' | 'FAILED' | 'PAUSED' | 'UNKNOWN'
}

export interface ProjectionCheckpointStore {
  read(consumerKey: string): Promise<ProjectionCheckpoint | null>
  write(checkpoint: ProjectionCheckpoint): Promise<void>
}
