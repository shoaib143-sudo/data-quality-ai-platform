import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const DEFAULT_EMBEDDING_MODEL = 'all-MiniLM-L6-v2'
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

function embeddingModel(model?: string) {
  return model?.trim() || process.env.GOVERNANCE_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL
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

export function toPgVectorLiteral(values: number[]) {
  return `[${validateEmbedding(values).join(',')}]`
}

export async function embedGovernanceText(text: string, model?: string) {
  const input = text.trim()
  if (!input) throw new Error('Text is required for embedding')

  const url = embeddingProviderUrl()
  if (!url) {
    const error = new Error('GOVERNANCE_EMBEDDING_URL is not configured')
    error.name = 'EmbeddingProviderNotConfiguredError'
    throw error
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const apiKey = process.env.GOVERNANCE_EMBEDDING_API_KEY?.trim()
  if (apiKey) headers.authorization = `Bearer ${apiKey}`

  const selectedModel = embeddingModel(model)
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input, model: selectedModel, text: input }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`Embedding provider failed with HTTP ${response.status}`)
  }

  return validateEmbedding(parseEmbeddingPayload(await response.json()))
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
  const vector = await embedGovernanceText(content, model)
  const contentHash = createHash('sha256').update(content).digest('hex')
  const admin = createAdminClient()

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
  return data
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
