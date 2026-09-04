import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FileSourceResult } from '@/lib/profiling/file-source-adapter'

const GOVERNED_DOCUMENT_EXTENSIONS = new Set([
  'txt','md','markdown','html','htm','xml','yaml','yml','sql',
  'pdf','doc','docx','xls','xlsx','ppt','pptx',
  'png','jpg','jpeg','gif','webp','bmp','tif','tiff',
])
const MAX_SEMANTIC_CHUNK_CHARACTERS = 4000
const CHUNK_INSERT_BATCH_SIZE = 200
const URI_METADATA_FIELDS = new Set([
  'source_uri','sourceUri','url','source_url','sourceUrl','download_url','downloadUrl',
])

type PersistDocumentInput = {
  projectId: string
  datasetId: string
  datasetVersionId: string
  profileRunId: string
  loaded: FileSourceResult
}

type NormalizedChunk = {
  content: string
  contentHash: string
  characterCount: number
  metadata: Record<string, unknown>
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function sanitizePersistedDocumentUri(value: string) {
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return trimmed

  try {
    const url = new URL(trimmed)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return trimmed.split('#', 1)[0].split('?', 1)[0]
  }
}

function sanitizeMetadata(metadata: Record<string, unknown>, sourceUri: string) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (URI_METADATA_FIELDS.has(key) && typeof value === 'string') {
        return [key, sanitizePersistedDocumentUri(value)]
      }
      return [key, value]
    }),
  ) as Record<string, unknown> & { source_uri: string }
}

function extensionOf(loaded: FileSourceResult) {
  const value = text(loaded.metadata.extension)
  if (value) return value.toLowerCase()
  const fileName = text(loaded.metadata.file_name)
  return fileName?.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
}

function splitLongText(value: string) {
  if (value.length <= MAX_SEMANTIC_CHUNK_CHARACTERS) return [value]
  const chunks: string[] = []
  let remaining = value
  while (remaining.length > MAX_SEMANTIC_CHUNK_CHARACTERS) {
    const candidate = remaining.slice(0, MAX_SEMANTIC_CHUNK_CHARACTERS)
    const breakAt = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf('. '), candidate.lastIndexOf(' '))
    const cut = breakAt >= Math.floor(MAX_SEMANTIC_CHUNK_CHARACTERS * 0.6)
      ? breakAt + (candidate[breakAt] === '.' ? 1 : 0)
      : MAX_SEMANTIC_CHUNK_CHARACTERS
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks.filter(Boolean)
}

function rowContent(row: Record<string, unknown>) {
  const direct = text(row.text) ?? text(row.content) ?? text(row.value)
  if (direct) return direct

  const meaningful = Object.fromEntries(
    Object.entries(row).filter(([key, value]) => {
      if (['chunk_index','document_index','character_count','word_count','line_count','file_name','content_type','text_extraction_method'].includes(key)) return false
      return value !== null && value !== undefined && String(value).trim() !== ''
    }),
  )
  return Object.keys(meaningful).length ? JSON.stringify(meaningful) : null
}

function normalizeChunks(loaded: FileSourceResult): NormalizedChunk[] {
  const result: NormalizedChunk[] = []
  for (const [rowIndex, row] of loaded.rows.entries()) {
    const content = rowContent(row)
    if (!content) continue
    const pieces = splitLongText(content)
    for (const [pieceIndex, piece] of pieces.entries()) {
      result.push({
        content: piece,
        contentHash: hash(piece),
        characterCount: piece.length,
        metadata: {
          source_row_index: rowIndex + 1,
          source_chunk_index: row.chunk_index ?? null,
          split_part: pieceIndex + 1,
          split_parts: pieces.length,
          word_count: piece.split(/\s+/).filter(Boolean).length,
        },
      })
    }
  }
  return result
}

function batches<T>(values: T[], size: number) {
  const groups: T[][] = []
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size))
  return groups
}

export function isGovernedDocumentSource(loaded: FileSourceResult) {
  return GOVERNED_DOCUMENT_EXTENSIONS.has(extensionOf(loaded))
}

export async function persistGovernedDocumentContent(
  supabase: SupabaseClient,
  input: PersistDocumentInput,
) {
  const { loaded } = input
  if (!isGovernedDocumentSource(loaded)) return null

  const chunks = normalizeChunks(loaded)
  const extension = extensionOf(loaded) || 'unknown'
  const fileName = text(loaded.metadata.file_name)
  const extractionMethod = text(loaded.metadata.text_extraction_method)
  const characterCount = chunks.reduce((total, chunk) => total + chunk.characterCount, 0)
  const now = new Date().toISOString()
  const sourceUri = sanitizePersistedDocumentUri(loaded.sourceUri)
  const sanitizedMetadata = sanitizeMetadata(loaded.metadata, sourceUri)
  sanitizedMetadata.source_uri = sourceUri

  const { data: document, error: documentError } = await supabase
    .schema('governance')
    .from('documents')
    .upsert({
      project_id: input.projectId,
      dataset_id: input.datasetId,
      dataset_version_id: input.datasetVersionId,
      profile_run_id: input.profileRunId,
      source_uri: sourceUri,
      file_name: fileName,
      file_type: extension,
      content_type: loaded.contentType,
      content_hash: loaded.contentHash,
      extraction_method: extractionMethod,
      character_count: characterCount,
      chunk_count: chunks.length,
      metadata: {
        ...sanitizedMetadata,
        source_row_count: loaded.rowCount,
        persisted_source_rows: loaded.rows.length,
        content_truncated_by_execution_ceiling: loaded.rowCount > loaded.rows.length,
        extraction_warnings: loaded.warnings,
      },
      updated_at: now,
    }, { onConflict: 'project_id,dataset_version_id,source_uri' })
    .select('id,project_id,dataset_id,dataset_version_id,profile_run_id,source_uri,file_name,file_type,content_hash,chunk_count,character_count')
    .single()

  if (documentError) throw new Error(`Unable to persist governed document: ${documentError.message}`)

  const { error: deleteError } = await supabase
    .schema('governance')
    .from('document_chunks')
    .delete()
    .eq('document_id', document.id)
  if (deleteError) throw new Error(`Unable to reset governed document chunks: ${deleteError.message}`)

  const chunkRows = chunks.map((chunk, index) => ({
    project_id: input.projectId,
    document_id: document.id,
    chunk_index: index + 1,
    content: chunk.content,
    content_hash: chunk.contentHash,
    character_count: chunk.characterCount,
    metadata: chunk.metadata,
    updated_at: now,
  }))

  for (const group of batches(chunkRows, CHUNK_INSERT_BATCH_SIZE)) {
    const { error } = await supabase.schema('governance').from('document_chunks').insert(group)
    if (error) throw new Error(`Unable to persist governed document chunks: ${error.message}`)
  }

  return {
    document,
    persistedChunks: chunks.length,
    sourceRows: loaded.rowCount,
    persistedSourceRows: loaded.rows.length,
    truncated: loaded.rowCount > loaded.rows.length,
  }
}
