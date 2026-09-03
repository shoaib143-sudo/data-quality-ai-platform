import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

export type FileSourceConfig = {
  sourceUri?: string | null
  executionConfig?: Record<string, unknown> | null
}

export type FileSourceResult = {
  rows: Record<string, unknown>[]
  rowCount: number
  contentHash: string
  sourceUri: string
  contentType: string | null
  format: 'csv' | 'json' | 'jsonl' | 'text' | 'binary'
  metadata: Record<string, unknown>
  warnings: string[]
}

const DEFAULT_MAX_ROWS = 1000
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'log', 'html', 'htm', 'xml', 'yaml', 'yml', 'sql', 'ini', 'cfg', 'conf'])
const BINARY_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip', 'gz', 'parquet', 'avro'])

export async function loadFileSource(
  supabase: SupabaseClient,
  config: FileSourceConfig,
  options: { maxRows?: number; maxBytes?: number } = {},
): Promise<FileSourceResult> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const executionConfig = config.executionConfig ?? {}
  const sourceUri = config.sourceUri?.trim() || null

  const url = getString(executionConfig, ['url', 'source_url', 'sourceUrl'])
    ?? (sourceUri && /^https?:\/\//i.test(sourceUri) ? sourceUri : null)

  let bytes: Uint8Array
  let resolvedSourceUri: string
  let contentType: string | null = null

  if (url) {
    const response = await fetch(url, {
      headers: { accept: 'text/csv,text/plain,application/json,application/octet-stream;q=0.9,*/*;q=0.8' },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Unable to load FILE source: HTTP ${response.status} ${response.statusText}`)
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error(`FILE source exceeds the configured ${maxBytes} byte limit`)
    bytes = new Uint8Array(await response.arrayBuffer())
    resolvedSourceUri = url
    contentType = response.headers.get('content-type')
  } else {
    const bucket = getString(executionConfig, ['bucket', 'bucket_id', 'bucketId', 'storage_bucket', 'storageBucket'])
    const path = getString(executionConfig, ['path', 'storage_path', 'storagePath', 'object_path', 'objectPath']) ?? sourceUri
    if (!bucket || !path) {
      throw new Error(`FILE source "${sourceUri ?? '(missing source_uri)'}" has no executable location. Provide execution_config.url or execution_config.bucket + execution_config.path.`)
    }
    const { data, error } = await supabase.storage.from(bucket).download(path)
    if (error) throw new Error(`Unable to download FILE source ${bucket}/${path}: ${error.message}`)
    bytes = new Uint8Array(await data.arrayBuffer())
    resolvedSourceUri = `storage://${bucket}/${path}`
    contentType = data.type || null
  }

  if (bytes.byteLength > maxBytes) throw new Error(`FILE source exceeds the configured ${maxBytes} byte limit`)

  const contentHash = createHash('sha256').update(bytes).digest('hex')
  const fileName = sourceName(resolvedSourceUri)
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const format = detectFormat(decoded, contentType, extension)
  const metadata = {
    file_name: fileName,
    extension: extension || null,
    content_type: contentType,
    byte_size: bytes.byteLength,
    sha256: contentHash,
    source_uri: resolvedSourceUri,
  }

  if (format === 'csv') {
    const parsed = parseCsv(decoded, maxRows)
    return { rows: parsed.rows, rowCount: parsed.rowCount, contentHash, sourceUri: resolvedSourceUri, contentType, format, metadata, warnings: parsed.warnings }
  }

  if (format === 'json') {
    const parsed = parseJson(decoded, maxRows)
    return { rows: parsed.rows, rowCount: parsed.rowCount, contentHash, sourceUri: resolvedSourceUri, contentType, format, metadata, warnings: parsed.warnings }
  }

  if (format === 'jsonl') {
    const parsed = parseJsonLines(decoded, maxRows)
    return { rows: parsed.rows, rowCount: parsed.rowCount, contentHash, sourceUri: resolvedSourceUri, contentType, format, metadata, warnings: parsed.warnings }
  }

  if (format === 'text') {
    const parsed = parseTextDocument(decoded, maxRows, metadata)
    return { rows: parsed.rows, rowCount: parsed.rowCount, contentHash, sourceUri: resolvedSourceUri, contentType, format, metadata, warnings: parsed.warnings }
  }

  return {
    rows: [{
      document_index: 1,
      file_name: fileName,
      extension: extension || null,
      content_type: contentType,
      byte_size: bytes.byteLength,
      sha256: contentHash,
      text_extraction_supported: false,
    }],
    rowCount: 1,
    contentHash,
    sourceUri: resolvedSourceUri,
    contentType,
    format: 'binary',
    metadata,
    warnings: ['Binary file metadata was scanned successfully. Content extraction for this file type is not enabled in the current runtime.'],
  }
}

function detectFormat(content: string, contentType: string | null, extension: string): FileSourceResult['format'] {
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (extension === 'csv' || mediaType === 'text/csv') return 'csv'
  if (extension === 'json' || mediaType === 'application/json') return 'json'
  if (['jsonl', 'ndjson'].includes(extension) || mediaType === 'application/x-ndjson') return 'jsonl'
  if (TEXT_EXTENSIONS.has(extension) || mediaType.startsWith('text/') || ['application/xml', 'application/yaml', 'application/x-yaml'].includes(mediaType)) return 'text'
  if (BINARY_EXTENSIONS.has(extension) || mediaType.startsWith('image/') || mediaType.startsWith('audio/') || mediaType.startsWith('video/') || mediaType === 'application/pdf') return 'binary'
  const trimmed = content.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { JSON.parse(trimmed); return 'json' } catch {}
  }
  if (trimmed && !trimmed.includes('\u0000')) return 'text'
  return 'binary'
}

function sourceName(uri: string) {
  const clean = uri.split('?')[0].replace(/\/$/, '')
  const value = clean.split('/').pop()
  return value || 'file'
}

function getString(record: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = record[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function parseJson(input: string, maxRows: number) {
  let value: unknown
  try { value = JSON.parse(input) } catch (error) { throw new Error(`Invalid JSON source: ${error instanceof Error ? error.message : 'parse failed'}`) }
  const rawRows = Array.isArray(value) ? value : [value]
  const rows = rawRows.map((item, index) => normalizeJsonRow(item, index))
  const warnings: string[] = []
  if (rows.length > maxRows) warnings.push(`JSON source contains ${rows.length} records; only the first ${maxRows} were loaded for profiling.`)
  return { rows: rows.slice(0, maxRows), rowCount: rows.length, warnings }
}

function parseJsonLines(input: string, maxRows: number) {
  const lines = input.split(/\r?\n/).filter((line) => line.trim())
  const rows = lines.map((line, index) => {
    try { return normalizeJsonRow(JSON.parse(line), index) } catch (error) { throw new Error(`Invalid JSONL source at line ${index + 1}: ${error instanceof Error ? error.message : 'parse failed'}`) }
  })
  const warnings: string[] = []
  if (rows.length > maxRows) warnings.push(`JSONL source contains ${rows.length} records; only the first ${maxRows} were loaded for profiling.`)
  return { rows: rows.slice(0, maxRows), rowCount: rows.length, warnings }
}

function normalizeJsonRow(value: unknown, index: number): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { record_index: index + 1, ...(value as Record<string, unknown>) }
  return { record_index: index + 1, value }
}

function parseTextDocument(input: string, maxRows: number, metadata: Record<string, unknown>) {
  const normalized = input.replace(/\r\n/g, '\n')
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((value) => value.trim())
    .filter(Boolean)
  const chunks = paragraphs.length ? paragraphs : normalized.split('\n').map((value) => value.trim()).filter(Boolean)
  const rows = chunks.map((text, index) => ({
    chunk_index: index + 1,
    text,
    character_count: text.length,
    word_count: text.split(/\s+/).filter(Boolean).length,
    line_count: text.split('\n').length,
    file_name: metadata.file_name,
    content_type: metadata.content_type,
  }))
  const warnings: string[] = []
  if (rows.length > maxRows) warnings.push(`Text source contains ${rows.length} chunks; only the first ${maxRows} were loaded for profiling.`)
  return { rows: rows.slice(0, maxRows), rowCount: rows.length, warnings }
}

function parseCsv(input: string, maxRows: number): { rows: Record<string, unknown>[]; rowCount: number; warnings: string[] } {
  const records = parseCsvRecords(input)
  const warnings: string[] = []
  if (records.length === 0) return { rows: [], rowCount: 0, warnings }
  const headers = records[0].map((header, index) => header.trim().replace(/^\uFEFF/, '') || `column_${index + 1}`)
  const rows = records.slice(1).map((record) => {
    const row: Record<string, unknown> = {}
    headers.forEach((header, index) => { row[header] = record[index] ?? null })
    return row
  })
  if (rows.length > maxRows) warnings.push(`FILE source contains ${rows.length} data rows; only the first ${maxRows} rows were loaded for profiling.`)
  return { rows: rows.slice(0, maxRows), rowCount: rows.length, warnings }
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; index += 1; continue }
      if (char === '"') { quoted = false; continue }
      field += char
      continue
    }
    if (char === '"' && field.length === 0) { quoted = true; continue }
    if (char === ',') { record.push(field); field = ''; continue }
    if (char === '\n') { record.push(field.replace(/\r$/, '')); records.push(record); record = []; field = ''; continue }
    field += char
  }
  if (quoted) throw new Error('Invalid CSV source: unterminated quoted field')
  if (field.length > 0 || record.length > 0) { record.push(field.replace(/\r$/, '')); records.push(record) }
  return records.filter((row) => row.some((value) => value.trim() !== ''))
}
