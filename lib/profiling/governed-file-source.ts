import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { documentEvidenceState } from '@/lib/profiling/document-evidence'
import { loadFileSource, type FileSourceConfig, type FileSourceResult } from '@/lib/profiling/file-source-adapter'
import { extractWithOcrSpace } from '@/lib/profiling/ocr-space'
import { safeRemoteFileFetch } from '@/lib/profiling/safe-remote-file'
import { resolveProviderNeutralFileConfig, sanitizeProviderNeutralFileResult } from '@/lib/profiling/provider-neutral-file-source'

const OCR_EXTENSIONS = new Set(['pdf','png','jpg','jpeg','gif','webp','bmp','tif','tiff'])

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function getString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function assertOriginalBytes(bytes: Uint8Array, expectedContentHash: string, maxBytes: number | null) {
  if (maxBytes !== null && bytes.byteLength > maxBytes) {
    throw new Error(`OCR source exceeds the governed technical safety ceiling of ${maxBytes} bytes.`)
  }
  const contentHash = createHash('sha256').update(bytes).digest('hex')
  if (contentHash !== expectedContentHash) {
    throw new Error('OCR source bytes changed after the governed source-read step; refusing time-of-check/time-of-use drift.')
  }
}

async function loadOriginalBytes(
  supabase: SupabaseClient,
  config: FileSourceConfig,
  expectedContentHash: string,
  maxBytes: number | null,
) {
  const executionConfig = record(config.executionConfig)
  const sourceUri = config.sourceUri?.trim() || null
  const url = getString(executionConfig, ['url','source_url','sourceUrl']) ?? (sourceUri && /^https?:\/\//i.test(sourceUri) ? sourceUri : null)
  if (url) {
    const response = await safeRemoteFileFetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Unable to load file for OCR: HTTP ${response.status} ${response.statusText}`)
    const declaredLength = Number(response.headers.get('content-length'))
    if (maxBytes !== null && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`OCR source exceeds the governed technical safety ceiling of ${maxBytes} bytes.`)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    assertOriginalBytes(bytes, expectedContentHash, maxBytes)
    return { bytes, contentType: response.headers.get('content-type') }
  }
  const bucket = getString(executionConfig, ['bucket','bucket_id','bucketId','storage_bucket','storageBucket'])
  const path = getString(executionConfig, ['path','storage_path','storagePath','object_path','objectPath']) ?? sourceUri
  if (!bucket || !path) throw new Error('OCR fallback could not resolve the original FILE source location.')
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw new Error(`Unable to download FILE source for OCR: ${error.message}`)
  const bytes = new Uint8Array(await data.arrayBuffer())
  assertOriginalBytes(bytes, expectedContentHash, maxBytes)
  return { bytes, contentType: data.type || null }
}

function chunkOcrText(text: string, maxRows: number, metadata: Record<string, unknown>) {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  const blocks = normalized.split(/\n\s*\n+/).map((value) => value.trim()).filter(Boolean)
  const chunks = blocks.length ? blocks : normalized.split('\n').map((value) => value.trim()).filter(Boolean)
  const rows = chunks.map((value, index) => ({
    chunk_index: index + 1,
    text: value,
    character_count: value.length,
    word_count: value.split(/\s+/).filter(Boolean).length,
    line_count: value.split('\n').length,
    file_name: metadata.file_name,
    content_type: metadata.content_type,
    text_extraction_method: 'ocr_space',
  }))
  return {
    rows: rows.slice(0, maxRows),
    rowCount: rows.length,
    warnings: rows.length > maxRows ? [`OCR produced ${rows.length} text chunks; ${maxRows} chunks were selected for this profiling execution.`] : [],
  }
}

function nativeTextIsReadable(loaded: FileSourceResult) {
  const textRows = loaded.rows
    .map((row) => typeof row.text === 'string' ? row.text : null)
    .filter((value): value is string => Boolean(value?.trim()))
  if (!textRows.length) return false
  const states = textRows.slice(0, 25).map(documentEvidenceState)
  return states.some((state) => state === 'READABLE') && states.filter((state) => state === 'UNREADABLE').length <= Math.max(1, Math.floor(states.length * 0.2))
}

function metadataOnlyFallback(loaded: FileSourceResult): FileSourceResult {
  const fileName = String(loaded.metadata.file_name ?? 'file')
  return {
    ...loaded,
    format: 'binary',
    rowCount: 1,
    rows: [{
      document_index: 1,
      file_name: fileName,
      extension: loaded.metadata.extension ?? null,
      content_type: loaded.contentType,
      byte_size: loaded.metadata.byte_size ?? null,
      sha256: loaded.contentHash,
      text_extraction_supported: false,
    }],
    metadata: {
      ...loaded.metadata,
      text_extraction_supported: false,
      native_text_rejected_as_unreadable: true,
    },
    warnings: [...loaded.warnings, 'Native document text was rejected because it resembled encoded PDF glyph/binary content rather than readable text.'],
  }
}

export async function loadGovernedFileSource(
  supabase: SupabaseClient,
  config: FileSourceConfig,
  options: { maxRows?: number; maxBytes?: number } = {},
): Promise<FileSourceResult> {
  const resolved = await resolveProviderNeutralFileConfig(config)
  const rawLoaded = await loadFileSource(supabase, resolved.config, options)
  const loaded = sanitizeProviderNeutralFileResult(rawLoaded, resolved.canonicalSourceUri, resolved.provider)
  const extension = String(loaded.metadata.extension ?? '').toLowerCase()
  const canOcr = OCR_EXTENSIONS.has(extension)
  const observationScope = String(loaded.metadata.source_observation_scope ?? 'FULL_OBJECT_BYTES')
  if (observationScope === 'METADATA_ONLY') return loaded

  if (loaded.format !== 'binary') {
    if (!canOcr || nativeTextIsReadable(loaded)) return loaded
  }
  if (!canOcr) return loaded

  const fallback = loaded.format === 'binary' ? loaded : metadataOnlyFallback(loaded)

  try {
    const initialByteSize = Number(loaded.metadata.byte_size)
    const maxBytes = Number.isFinite(options.maxBytes)
      ? Number(options.maxBytes)
      : Number.isFinite(initialByteSize) && initialByteSize >= 0
        ? initialByteSize
        : null
    const original = await loadOriginalBytes(supabase, resolved.config, loaded.contentHash, maxBytes)
    const ocr = await extractWithOcrSpace({
      bytes: original.bytes,
      fileName: String(loaded.metadata.file_name ?? `document.${extension || 'bin'}`),
      contentType: original.contentType ?? loaded.contentType,
    })
    if (!ocr.text.trim() || documentEvidenceState(ocr.text) !== 'READABLE') {
      return {
        ...fallback,
        metadata: { ...fallback.metadata, ocr_provider: ocr.provider, ocr_configured: ocr.configured, ocr_pages: ocr.pages },
        warnings: [...fallback.warnings, ...ocr.warnings, ocr.text.trim() ? 'OCR output was rejected because it was not readable text.' : 'OCR did not return readable text.'],
      }
    }

    const metadata = {
      ...loaded.metadata,
      text_extraction_supported: true,
      text_extraction_method: 'ocr_space',
      ocr_provider: ocr.provider,
      ocr_configured: true,
      ocr_pages: ocr.pages,
      extracted_character_count: ocr.text.length,
    }
    const parsed = chunkOcrText(ocr.text, options.maxRows ?? 1000, metadata)
    return {
      ...loaded,
      rows: parsed.rows,
      rowCount: parsed.rowCount,
      format: 'text',
      metadata,
      warnings: [...loaded.warnings, 'Unreadable native text was replaced with governed OCR text.', ...ocr.warnings, ...parsed.warnings],
    }
  } catch (error) {
    return {
      ...fallback,
      metadata: { ...fallback.metadata, ocr_provider: 'OCR_SPACE', ocr_failed: true },
      warnings: [...fallback.warnings, `OCR fallback could not complete: ${error instanceof Error ? error.message : 'unknown OCR error'}`],
    }
  }
}