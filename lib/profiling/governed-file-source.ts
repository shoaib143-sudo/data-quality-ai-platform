import type { SupabaseClient } from '@supabase/supabase-js'
import { loadFileSource, type FileSourceConfig, type FileSourceResult } from '@/lib/profiling/file-source-adapter'
import { extractWithOcrSpace } from '@/lib/profiling/ocr-space'

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

async function loadOriginalBytes(supabase: SupabaseClient, config: FileSourceConfig) {
  const executionConfig = record(config.executionConfig)
  const sourceUri = config.sourceUri?.trim() || null
  const url = getString(executionConfig, ['url','source_url','sourceUrl']) ?? (sourceUri && /^https?:\/\//i.test(sourceUri) ? sourceUri : null)
  if (url) {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Unable to load file for OCR: HTTP ${response.status} ${response.statusText}`)
    return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') }
  }
  const bucket = getString(executionConfig, ['bucket','bucket_id','bucketId','storage_bucket','storageBucket'])
  const path = getString(executionConfig, ['path','storage_path','storagePath','object_path','objectPath']) ?? sourceUri
  if (!bucket || !path) throw new Error('OCR fallback could not resolve the original FILE source location.')
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw new Error(`Unable to download FILE source for OCR: ${error.message}`)
  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || null }
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

export async function loadGovernedFileSource(
  supabase: SupabaseClient,
  config: FileSourceConfig,
  options: { maxRows?: number; maxBytes?: number } = {},
): Promise<FileSourceResult> {
  const loaded = await loadFileSource(supabase, config, options)
  if (loaded.format !== 'binary') return loaded

  const extension = String(loaded.metadata.extension ?? '').toLowerCase()
  if (!OCR_EXTENSIONS.has(extension)) return loaded

  try {
    const original = await loadOriginalBytes(supabase, config)
    const ocr = await extractWithOcrSpace({
      bytes: original.bytes,
      fileName: String(loaded.metadata.file_name ?? `document.${extension || 'bin'}`),
      contentType: original.contentType ?? loaded.contentType,
    })
    if (!ocr.text.trim()) {
      return {
        ...loaded,
        metadata: { ...loaded.metadata, ocr_provider: ocr.provider, ocr_configured: ocr.configured, ocr_pages: ocr.pages },
        warnings: [...loaded.warnings, ...ocr.warnings],
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
      warnings: [...loaded.warnings, ...ocr.warnings, ...parsed.warnings],
    }
  } catch (error) {
    return {
      ...loaded,
      metadata: { ...loaded.metadata, ocr_provider: 'OCR_SPACE', ocr_failed: true },
      warnings: [...loaded.warnings, `OCR fallback could not complete: ${error instanceof Error ? error.message : 'unknown OCR error'}`],
    }
  }
}
