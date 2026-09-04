import { createAdminClient } from '@/lib/supabase/admin'
import { indexSemanticObject } from '@/lib/governance/semantic-search'

type DocumentRow = {
  id: string
  dataset_id: string
  dataset_version_id: string
  profile_run_id: string | null
  source_uri: string
  file_name: string | null
  file_type: string
  content_type: string | null
  content_hash: string
  extraction_method: string | null
  character_count: number
  chunk_count: number
  metadata: Record<string, unknown> | null
}

type ChunkRow = {
  id: string
  document_id: string
  chunk_index: number
  content: string
  content_hash: string
  character_count: number
  metadata: Record<string, unknown> | null
}

type SemanticCandidate = {
  objectType: 'DOCUMENT' | 'DOCUMENT_CHUNK'
  objectKey: string
  objectId: string
  content: string
  metadata: Record<string, unknown>
}

const FILTER_BATCH_SIZE = 100

function batches<T>(values: T[], size = FILTER_BATCH_SIZE) {
  const groups: T[][] = []
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size))
  return groups
}

function compact(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join('\n')
}

async function collectDocumentCandidates(projectId: string): Promise<SemanticCandidate[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('governance')
    .from('documents')
    .select('id,dataset_id,dataset_version_id,profile_run_id,source_uri,file_name,file_type,content_type,content_hash,extraction_method,character_count,chunk_count,metadata')
    .eq('project_id', projectId)
  if (error) throw new Error(`Unable to collect semantic documents: ${error.message}`)

  const documents = (data ?? []) as DocumentRow[]
  const chunks: ChunkRow[] = []
  for (const documentIds of batches(documents.map((document) => document.id))) {
    const result = await admin
      .schema('governance')
      .from('document_chunks')
      .select('id,document_id,chunk_index,content,content_hash,character_count,metadata')
      .in('document_id', documentIds)
      .order('chunk_index')
    if (result.error) throw new Error(`Unable to collect semantic document chunks: ${result.error.message}`)
    chunks.push(...((result.data ?? []) as ChunkRow[]))
  }

  const documentById = new Map(documents.map((document) => [document.id, document]))
  return [
    ...documents.map((document): SemanticCandidate => ({
      objectType: 'DOCUMENT',
      objectKey: document.id,
      objectId: document.id,
      content: compact([
        document.file_name ?? 'Governed document',
        `File type: ${document.file_type}`,
        document.content_type ? `Content type: ${document.content_type}` : null,
        document.extraction_method ? `Extraction method: ${document.extraction_method}` : null,
        `Source: ${document.source_uri}`,
        `Extracted characters: ${document.character_count}`,
        `Chunks: ${document.chunk_count}`,
      ]),
      metadata: {
        dataset_id: document.dataset_id,
        dataset_version_id: document.dataset_version_id,
        profile_run_id: document.profile_run_id,
        source_uri: document.source_uri,
        file_name: document.file_name,
        file_type: document.file_type,
        content_type: document.content_type,
        content_hash: document.content_hash,
        extraction_method: document.extraction_method,
        character_count: document.character_count,
        chunk_count: document.chunk_count,
        ...(document.metadata ?? {}),
      },
    })),
    ...chunks.map((chunk): SemanticCandidate => {
      const document = documentById.get(chunk.document_id)
      return {
        objectType: 'DOCUMENT_CHUNK',
        objectKey: chunk.id,
        objectId: chunk.id,
        content: chunk.content,
        metadata: {
          document_id: chunk.document_id,
          dataset_id: document?.dataset_id ?? null,
          dataset_version_id: document?.dataset_version_id ?? null,
          profile_run_id: document?.profile_run_id ?? null,
          source_uri: document?.source_uri ?? null,
          file_name: document?.file_name ?? null,
          file_type: document?.file_type ?? null,
          chunk_index: chunk.chunk_index,
          content_hash: chunk.content_hash,
          character_count: chunk.character_count,
          ...(chunk.metadata ?? {}),
        },
      }
    }),
  ]
}

async function pruneStaleDocumentEmbeddings(projectId: string, candidates: SemanticCandidate[]) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('governance')
    .from('semantic_embeddings')
    .select('id,object_type,object_key')
    .eq('project_id', projectId)
    .in('object_type', ['DOCUMENT','DOCUMENT_CHUNK'])
  if (error) throw new Error(`Unable to inspect stale document embeddings: ${error.message}`)

  const active = new Set(candidates.map((candidate) => `${candidate.objectType}:${candidate.objectKey}`))
  const staleIds = (data ?? [])
    .filter((row) => !active.has(`${row.object_type}:${row.object_key}`))
    .map((row) => row.id)

  for (const ids of batches(staleIds)) {
    const { error: deleteError } = await admin
      .schema('governance')
      .from('semantic_embeddings')
      .delete()
      .in('id', ids)
    if (deleteError) throw new Error(`Unable to prune stale document embeddings: ${deleteError.message}`)
  }
  return staleIds.length
}

export async function reindexProjectDocumentSemanticObjects(
  projectId: string,
  options: { concurrency?: number } = {},
) {
  const candidates = await collectDocumentCandidates(projectId)
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 3))
  const results: Array<{ objectType: string; objectKey: string; status: 'INDEXED' | 'UNCHANGED' | 'FAILED'; error?: string }> = []
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= candidates.length) return
      const candidate = candidates[index]
      try {
        const indexed = await indexSemanticObject({ projectId, ...candidate })
        results[index] = {
          objectType: candidate.objectType,
          objectKey: candidate.objectKey,
          status: indexed.unchanged ? 'UNCHANGED' : 'INDEXED',
        }
      } catch (error) {
        results[index] = {
          objectType: candidate.objectType,
          objectKey: candidate.objectKey,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, candidates.length)) }, () => worker()))
  const pruned = await pruneStaleDocumentEmbeddings(projectId, candidates)

  return {
    projectId,
    total: candidates.length,
    indexed: results.filter((result) => result.status === 'INDEXED').length,
    unchanged: results.filter((result) => result.status === 'UNCHANGED').length,
    failed: results.filter((result) => result.status === 'FAILED').length,
    pruned,
    results,
  }
}
