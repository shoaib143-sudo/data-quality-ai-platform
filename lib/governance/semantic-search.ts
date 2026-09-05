import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const DEFAULT_EMBEDDING_MODEL = 'all-MiniLM-L6-v2'
export const DEFAULT_GATEWAY_EMBEDDING_MODEL = 'openai/text-embedding-3-small'
export const VERCEL_AI_GATEWAY_EMBEDDING_URL = 'https://ai-gateway.vercel.sh/v1/embeddings'
export const EMBEDDING_DIMENSIONS = 384

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

function gatewayApiKey() {
  return process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || null
}

function embeddingModel(model?: string) {
  const selected = model?.trim() || process.env.GOVERNANCE_EMBEDDING_MODEL?.trim()
  if (selected) return selected
  return embeddingProviderUrl() ? DEFAULT_EMBEDDING_MODEL : DEFAULT_GATEWAY_EMBEDDING_MODEL
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

export async function embedGovernanceText(text: string, model?: string) {
  const input = text.trim()
  if (!input) throw new Error('Text is required for embedding')

  const customUrl = embeddingProviderUrl()
  const selectedModel = embeddingModel(model)
  let url: string
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  let body: Record<string, unknown>

  if (customUrl) {
    url = customUrl
    const apiKey = process.env.GOVERNANCE_EMBEDDING_API_KEY?.trim()
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    body = { input, model: selectedModel, text: input }
  } else {
    const apiKey = gatewayApiKey()
    if (!apiKey) {
      const error = new Error('No governance embedding provider is configured')
      error.name = 'EmbeddingProviderNotConfiguredError'
      throw error
    }
    url = VERCEL_AI_GATEWAY_EMBEDDING_URL
    headers.authorization = `Bearer ${apiKey}`
    body = {
      input,
      model: selectedModel,
      dimensions: EMBEDDING_DIMENSIONS,
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
    throw new Error(`Embedding provider failed with HTTP ${response.status}`)
  }

  return normalizeEmbedding(parseEmbeddingPayload(await response.json()))
}

export async function semanticSearchByEmbedding(
  supabase: SupabaseLike,
  input: {
    projectId: string
    embedding: number[]
    objectTypes?: SemanticObjectType[] | null
    threshold?: number
    limit?: number
  },
): Promise<SemanticMatch[]> {
  const threshold = Math.max(-1, Math.min(1, input.threshold ?? 0.35))
  const limit = Math.max(1, Math.min(100, input.limit ?? 25))
  const { data, error } = await supabase.schema('governance').rpc('match_semantic_embeddings', {
    p_project_id: input.projectId,
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
  const embedding = await embedGovernanceText(input.query)
  return semanticSearchByEmbedding(supabase, { ...input, embedding })
}

export async function indexSemanticObject(input: SemanticIndexInput) {
  const content = input.content.trim()
  if (!content) throw new Error('Semantic object content is required')

  const model = embeddingModel(input.embeddingModel)
  const version = input.embeddingVersion?.trim() || '1'
  const contentHash = createHash('sha256').update(content).digest('hex')
  const admin = createAdminClient()
  const existing = await admin
    .schema('governance')
    .from('semantic_embeddings')
    .select('id,project_id,object_type,object_key,object_id,content_hash,embedding_model,embedding_version,updated_at')
    .eq('project_id', input.projectId)
    .eq('object_type', input.objectType)
    .eq('object_key', input.objectKey)
    .eq('embedding_model', model)
    .eq('embedding_version', version)
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
      .select('id,project_id,object_type,object_key,object_id,content_hash,embedding_model,embedding_version,updated_at')
      .single()
    if (error) throw new Error(`Unable to refresh unchanged semantic object: ${error.message}`)
    return { ...data, unchanged: true as const }
  }

  const vector = await embedGovernanceText(content, model)
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
        embedding: toPgVectorLiteral(vector),
        embedding_model: model,
        embedding_version: version,
        metadata: input.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,object_type,object_key,embedding_model,embedding_version' },
    )
    .select('id,project_id,object_type,object_key,object_id,content_hash,embedding_model,embedding_version,updated_at')
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
