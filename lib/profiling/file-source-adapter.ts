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
  warnings: string[]
}

const DEFAULT_MAX_ROWS = 1000
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

/**
 * Resolves FILE execution sources without coupling the profiling engine to a
 * particular storage provider. Supported forms are:
 *   1. execution_config.url / source_uri as an HTTP(S) URL
 *   2. execution_config.bucket + execution_config.path in Supabase Storage
 *
 * A bare filename such as "demo.csv" is intentionally rejected until the
 * ingestion layer supplies a physical location. This prevents a successful
 * profiling run from silently producing metadata-only or empty metrics.
 */
export async function loadFileSource(
  supabase: SupabaseClient,
  config: FileSourceConfig,
  options: {
    maxRows?: number
    maxBytes?: number
  } = {},
): Promise<FileSourceResult> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const executionConfig = config.executionConfig ?? {}
  const sourceUri = config.sourceUri?.trim() || null

  const url = getString(executionConfig, ['url', 'source_url', 'sourceUrl'])
    ?? (sourceUri && /^https?:\/\//i.test(sourceUri) ? sourceUri : null)

  let content: string
  let resolvedSourceUri: string
  let contentType: string | null = null

  if (url) {
    const response = await fetch(url, {
      headers: {
        accept: 'text/csv,text/plain,application/octet-stream;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `Unable to load FILE source: HTTP ${response.status} ${response.statusText}`,
      )
    }

    const lengthHeader = response.headers.get('content-length')
    const declaredLength = lengthHeader ? Number(lengthHeader) : null

    if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(
        `FILE source exceeds the configured ${maxBytes} byte limit`,
      )
    }

    const bytes = new Uint8Array(await response.arrayBuffer())

    if (bytes.byteLength > maxBytes) {
      throw new Error(
        `FILE source exceeds the configured ${maxBytes} byte limit`,
      )
    }

    content = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    resolvedSourceUri = url
    contentType = response.headers.get('content-type')
  } else {
    const bucket = getString(executionConfig, [
      'bucket',
      'bucket_id',
      'bucketId',
      'storage_bucket',
      'storageBucket',
    ])
    const path = getString(executionConfig, [
      'path',
      'storage_path',
      'storagePath',
      'object_path',
      'objectPath',
    ]) ?? sourceUri

    if (!bucket || !path) {
      throw new Error(
        `FILE source "${sourceUri ?? '(missing source_uri)'}" has no executable location. ` +
        'Provide execution_config.url or execution_config.bucket + execution_config.path.',
      )
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path)

    if (error) {
      throw new Error(
        `Unable to download FILE source ${bucket}/${path}: ${error.message}`,
      )
    }

    const bytes = new Uint8Array(await data.arrayBuffer())

    if (bytes.byteLength > maxBytes) {
      throw new Error(
        `FILE source exceeds the configured ${maxBytes} byte limit`,
      )
    }

    content = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    resolvedSourceUri = `storage://${bucket}/${path}`
    contentType = data.type || null
  }

  const contentHash = createHash('sha256')
    .update(content, 'utf8')
    .digest('hex')

  const parsed = parseCsv(content, maxRows)

  return {
    rows: parsed.rows,
    rowCount: parsed.rowCount,
    contentHash,
    sourceUri: resolvedSourceUri,
    contentType,
    warnings: parsed.warnings,
  }
}

function getString(
  record: Record<string, unknown>,
  fields: string[],
): string | null {
  for (const field of fields) {
    const value = record[field]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function parseCsv(
  input: string,
  maxRows: number,
): {
  rows: Record<string, unknown>[]
  rowCount: number
  warnings: string[]
} {
  const records = parseCsvRecords(input)
  const warnings: string[] = []

  if (records.length === 0) {
    return { rows: [], rowCount: 0, warnings }
  }

  const headers = records[0].map((header, index) => {
    const normalized = header.trim().replace(/^\uFEFF/, '')
    return normalized || `column_${index + 1}`
  })

  const rows = records.slice(1).map((record) => {
    const row: Record<string, unknown> = {}

    headers.forEach((header, index) => {
      row[header] = record[index] ?? null
    })

    return row
  })

  const sampledRows = rows.slice(0, maxRows)

  if (rows.length > maxRows) {
    warnings.push(
      `FILE source contains ${rows.length} data rows; only the first ${maxRows} rows were loaded for profiling.`,
    )
  }

  return {
    rows: sampledRows,
    rowCount: rows.length,
    warnings,
  }
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
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
        continue
      }

      if (char === '"') {
        quoted = false
        continue
      }

      field += char
      continue
    }

    if (char === '"' && field.length === 0) {
      quoted = true
      continue
    }

    if (char === ',') {
      record.push(field)
      field = ''
      continue
    }

    if (char === '\n') {
      record.push(field.replace(/\r$/, ''))
      records.push(record)
      record = []
      field = ''
      continue
    }

    field += char
  }

  if (quoted) {
    throw new Error('Invalid CSV source: unterminated quoted field')
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ''))
    records.push(record)
  }

  return records.filter((row) => row.some((value) => value.trim() !== ''))
}
