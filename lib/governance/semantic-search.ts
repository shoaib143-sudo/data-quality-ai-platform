import { createHash } from 'node:crypto'
import { headers as requestHeaders } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const DEFAULT_EMBEDDING_MODEL = 'all-MiniLM-L6-v2'
export const DEFAULT_SUPABASE_EMBEDDING_MODEL = 'gte-small'
export const DEFAULT_GATEWAY_EMBEDDING_MODEL = 'openai/text-embedding-3-small'
export const VERCEL_AI_GATEWAY_EMBEDDING_URL = 'https://ai-gateway.vercel.sh/v1/embeddings'
export const EMBEDDING_DIMENSIONS = 384

export type GovernanceEmbeddingSpaceIdentity = {
  providerId: string
  model: string
  revision: string
  dimensions: number
  distanceMetric: 'COSINE'
  normalization: 'L2'
}

export type GovernanceEmbeddingEvidence = {
  embedding: number[]
  embeddingSpaceId: string
  identity: GovernanceEmbeddingSpaceIdentity
}

type SupabaseLike = {
  schema(name: string): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
  }
}

export type SemanticObjectType =
  | 'DATASET'
  | 'COLUMN'
  | 'GLOSSARY_TERM'
  | 'POLICY'
  | 'FINDING'
  | 'DOCUMENT'
  | 'DOCUMENT_CHUNK'
  | 'LINEAGE_TRANSFORMATION'
  | 'QUALITY_INCIDENT'
  | string

export type SemanticMatch = {
  id: string
  object_type: string
  object_key: string
  object_id: string | null
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

export type SemanticIndexInput = {
  projectId: string
  objectType: SemanticObjectType
  objectKey: string
  objectId?: string | null
  content: string
  metadata?: Record<string, unknown>
  embeddingModel?: string
  embeddingVersion?: string
}

function embeddingProviderUrl() {
  return process.env.GOVERNANCE_EMBEDDING_URL?.trim() || null
}

function supabaseNativeEmbeddingConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  )
}

async function gatewayApiKey() {
  const configured = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim()
  if (configured) return configured
  if (process.env.VERCEL !== '1') return null

  try {
    const incoming = await requestHeaders()
    return incoming.get('x-vercel-oidc-token')?.trim() || null
  } catch {
    return null
  }
}

function embeddingModel(model?: string) {
  const requested = model?.trim()
  if (requested) return requested
  if (embeddingProviderUrl()) return process.env.GOVERNANCE_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL
  if (supabaseNativeEmbeddingConfigured()) return DEFAULT_SUPABASE_EMBEDDING_MODEL
  return process.env.GOVERNANCE_EMBEDDING_MODEL?.trim() || DEFAULT_GATEWAY_EMBEDDING_MODEL
}

function embeddingProviderId() {
  if (embeddingProviderUrl()) return process.env.GOVERNANCE_EMBEDDING_PROVIDER_ID?.trim() || 'custom_http'
  if (supabaseNativeEmbeddingConfigured()) return 'supabase_ai'
  return 'vercel_ai_gateway'
}

export function governanceEmbeddingSpaceIdentity(model?: string, revision?: string): GovernanceEmbeddingSpaceIdentity {
  return {
    providerId: embeddingProviderId(),
    model: embeddingModel(model),
    revision: revision?.trim() || process.env.GOVERNANCE_EMBEDDING_REVISION?.trim() || '1',
    dimensions: EMBEDDING_DIMENSIONS,
    distanceMetric: 'COSINE',
    normalization: 'L2',
  }
}

function parseEmbeddingPayload(payload: unknown): number[] {
  if (Array.isArray(payload)) return payload.map(Number)

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.embedding)) return record.embedding.map(Number)
    if (Array.isArray(record.embeddings) && Array.isArray(record.embeddings[0])) {
      return (record.embeddings[0] as unknown[]).map(Number)
    }
    if (Array.isArray(record.data)) {
      const first = record.data[0]
      if (first && typeof first === 'object' && Array.isArray((first as Record<string, unknown>).embedding)) {
        return ((first as Record<string, unknown>).embedding as unknown[]).map(Number)
      }
    }
  }

  throw new Error('Embedding provider returned an unsupported response shape')
}

export function validateEmbedding(values: number[]) {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding provider returned ${values.length} dimensions; expected ${EMBEDDING_DIMENSIONS}`)
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Embedding provider returned non-finite values')
  }
  return values
}

export function normalizeEmbedding(values: number[]) {
  const valid = validateEmbedding(values)
  const norm = Math.sqrt(valid.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(norm) || norm <= Number.EPSILON) {
    throw new Error('Embedding provider returned a zero or invalid vector')
  }
  return valid.map((value) => value / norm)
}

export function toPgVectorLiteral(values: number[]) {
  return `[${normalizeEmbedding(values).join(',')}]`
}

async function embedWithSupabaseNative(input: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.functions.invoke('governance-embed', {
    body: { input },
  })
  if (error) {
    throw new Error(`Supabase governance embedding failed: ${error.message}`)
  }
  return normalizeEmbedding(parseEmbeddingPayload(data))
}

async function generateGovernanceEmbedding(text: string, model?: string, revision?: string) {
  const input = text.trim()
  if (!input) throw new Error('Text is required for embedding')
  const identity = governanceEmbeddingSpaceIdentity(model, revision)

  const customUrl = embeddingProviderUrl()
  if (!customUrl && supabaseNativeEmbeddingConfigured()) {
    return { embedding: await embedWithSupabaseNative(input), identity }
  }

  let url: string
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  let body: Record<string, unknown>

  if (customUrl) {
    url = customUrl
    const apiKey = process.env.GOVERNANCE_EMBEDDING_API_KEY?.trim()
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    body = { input, model: identity.model, text: input }
  } else {
    const apiKey = await gatewayApiKey()
    if (!apiKey) {
      const error = new Error('No governance embedding provider is configured')
      error.name = 'EmbeddingProviderNotConfiguredError'
      throw error
    }
    url = VERCEL_AI_GATEWAY_EMBEDDING_URL
    headers.authorization = `Bearer ${apiKey}`
    body = {
      input,
      model: identity.model,
      dimensions: identity.dimensions,
      encoding_format: 'float',
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const providerMessage = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 500)
    throw new Error(`Embedding provider failed with HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`)
  }

  return { embedding: normalizeEmbedding(parseEmbeddingPayload(await response.json())), identity }
}

export async function ensureGovernanceEmbeddingSpace(identity: GovernanceEmbeddingSpaceIdentity) {
  const admin = createAdminClient()
  const find = () => admin
    .schema('governance')
    .from('embedding_spaces')
    .select('id')
    .eq('provider_id', identity.providerId)
    .eq('model_name', identity.model)
    .eq('model_revision', identity.revision)
    .eq('dimensions', identity.dimensions)
    .eq('distance_metric', identity.distanceMetric)
    .eq('normalization', identity.normalization)
    .maybeSingle()

  const existing = await find()
  if (existing.error) throw new Error(`Unable to resolve embedding space: ${existing.error.message}`)
  if (existing.data?.id) return String(existing.data.id)

  const inserted = await admin
    .schema('governance')
    .from('embedding_spaces')
    .insert({
      provider_id: identity.providerId,
      model_name: identity.model,
      model_revision: identity.revision,
      dimensions: identity.dimensions,
      distance_metric: identity.distanceMetric,
      normalization: identity.normalization,
      evidence: { authority: 'runtime_declared_embedding_identity' },
    })
    .select('id')
    .single()

  if (!inserted.error && inserted.data?.id) return String(inserted.data.id)

  const raced = await find()
  if (raced.error || !raced.data?.id) {
    throw new Error(`Unable to register embedding space: ${inserted.error?.message ?? raced.error?.message ?? 'unknown error'}`)
  }
  return String(raced.data.id)
}

export async function embedGovernanceText(text: string, model?: string) {
  return (await generateGovernanceEmbedding(text, model)).embedding
}

export async function embedGovernanceTextWithEvidence(text: string, model?: string, revision?: string): Promise<GovernanceEmbeddingEvidence> {
  const generated = await generateGovernanceEmbedding(text, model, revision)
  const embeddingSpaceId = await ensureGovernanceEmbeddingSpace(generated.identity)
  return { ...generated, embeddingSpaceId }
}

export async function semanticSearchByEmbedding(
  supabase: SupabaseLike,
  input: {
    projectId: string
    embedding: number[]
    embeddingSpaceId: string
    objectTypes?: SemanticObjectType[] | null
    threshold?: number
    limit?: number
  },
): Promise<SemanticMatch[]> {
  const embeddingSpaceId = input.embeddingSpaceId.trim()
  if (!embeddingSpaceId) throw new Error('embeddingSpaceId is required for semantic search')
  const threshold = Math.max(-1, Math.min(1, input.threshold ?? 0.35))
  const limit = Math.max(1, Math.min(100, input.limit ?? 25))
  const { data, error } = await supabase.schema('governance').rpc('match_semantic_embeddings_in_space', {
    p_project_id: input.projectId,
    p_embedding_space_id: embeddingSpaceId,
    p_query_embedding: toPgVectorLiteral(input.embedding),
    p_object_types: input.objectTypes?.length ? input.objectTypes : null,
    p_match_threshold: threshold,
    p_match_count: limit,
  })

  if (error) throw new Error(`Semantic search failed: ${error.message}`)
  return (Array.isArray(data) ? data : []) as SemanticMatch[]
}

export async function semanticSearch(
  supabase: SupabaseLike,
  input: {
    projectId: string
    query: string
    objectTypes?: SemanticObjectType[] | null
    threshold?: number
    limit?: number
  },
): Promise<SemanticMatch[]> {
  const evidence = await embedGovernanceTextWithEvidence(input.query)
  return semanticSearchByEmbedding(supabase, {
    ...input,
    embedding: evidence.embedding,
    embeddingSpaceId: evidence.embeddingSpaceId,
  })
}

export async function indexSemanticObject(input: SemanticIndexInput) {
  const content = input.content.trim()
  if (!content) throw new Error('Semantic object content is required')

  const model = embeddingModel(input.embeddingModel)
  const version = input.embeddingVersion?.trim() || process.env.GOVERNANCE_EMBEDDING_REVISION?.trim() || '1'
  const contentHash = createHash('sha256').update(content).digest('hex')
  const evidence = await embedGovernanceTextWithEvidence(content, model, version)
  const admin = createAdminClient()
  const existing = await admin
    .schema('governance')
    .from('semantic_embeddings')
    .select('id,project_id,object_type,object_key,object_id,content_hash,embedding_model,embedding_version,embedding_space_id,updated_at')
    .eq('project_id', input.projectId)
    .eq('object_type', input.objectType)
    .eq('object_key', input.objectKey)
    .eq('embedding_space_id', evidence.embeddingSpaceId)
    .maybeSingle()

  if (existing.error) throw new Error(`Unable to inspect semantic object: ${existing.error.message}`)

  if (existing.data?.content_hash === contentHash) {
    const { data, error } = await admin
      .schema('governance')
      .from('semantic_embeddings')
      .update({
        object_id: input.objectId ?? null,
        content,
        metadata: input.metadata ?? {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.data.id)
      .select('id,project_id,object_type,object_key,object_id,content_hash,embedding_model,embedding_version,embedding_space_id,updated_at')
      .single()
    if (error) throw new Error(`Unable to refresh unchanged semantic object: ${error.message}`)
    return { ...data, unchanged: true as const }
  }

  const { data, error } = await admin
    .schema('governance')
    .from('semantic_embeddings')
    .upsert(
      {
        project_id: input.projectId,
        object_type: input.objectType,
        object_key: input.objectKey,
        object_id: input.objectId ?? null,
        content,
        content_hash: contentHash,
        embedding: toPgVectorLiteral(evidence.embedding),
        embedding_model: evidence.identity.model,
        embedding_version: evidence.identity.revision,
        embedding_space_id: evidence.embeddingSpaceId,
        metadata: input.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,object_type,object_key,embedding_space_id' },
    )
    .select('id,project_id,object_type,object_key,object_id,content_hash,embedding_model,embedding_version,embedding_space_id,updated_at')
    .single()

  if (error) throw new Error(`Unable to index semantic object: ${error.message}`)
  return { ...data, unchanged: false as const }
}

export async function deleteSemanticObject(input: {
  projectId: string
  objectType: SemanticObjectType
  objectKey: string
}) {
  const admin = createAdminClient()
  const { error } = await admin
    .schema('governance')
    .from('semantic_embeddings')
    .delete()
    .eq('project_id', input.projectId)
    .eq('object_type', input.objectType)
    .eq('object_key', input.objectKey)

  if (error) throw new Error(`Unable to delete semantic object: ${error.message}`)
}
