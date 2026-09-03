import { createHash } from 'node:crypto'
import { inflateRawSync, inflateSync } from 'node:zlib'

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
const OFFICE_ZIP_EXTENSIONS = new Set(['docx', 'pptx', 'xlsx'])
const MAX_EXTRACTED_ENTRY_BYTES = 20 * 1024 * 1024
const MAX_EXTRACTED_TOTAL_BYTES = 40 * 1024 * 1024

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
      headers: { accept: 'text/csv,text/plain,application/json,application/pdf,application/octet-stream;q=0.9,*/*;q=0.8' },
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
  const metadata: Record<string, unknown> = {
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

  const extracted = extractUnstructuredDocumentText(bytes, extension)
  if (extracted.text.trim()) {
    const extractedMetadata = {
      ...metadata,
      text_extraction_supported: true,
      text_extraction_method: extracted.method,
      extracted_character_count: extracted.text.length,
    }
    const parsed = parseTextDocument(extracted.text, maxRows, extractedMetadata)
    return {
      rows: parsed.rows,
      rowCount: parsed.rowCount,
      contentHash,
      sourceUri: resolvedSourceUri,
      contentType,
      format: 'text',
      metadata: extractedMetadata,
      warnings: [...extracted.warnings, ...parsed.warnings],
    }
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
    warnings: [...extracted.warnings, 'Binary file metadata was scanned successfully. Content extraction is not available for this file encoding or media type.'],
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
    text_extraction_method: metadata.text_extraction_method ?? 'native_text',
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

function extractUnstructuredDocumentText(bytes: Uint8Array, extension: string) {
  if (extension === 'pdf') return extractPdfText(bytes)
  if (OFFICE_ZIP_EXTENSIONS.has(extension)) return extractOfficeZipText(bytes, extension)
  if (extension === 'doc' || extension === 'ppt' || extension === 'xls') {
    return { text: '', method: 'legacy_office_metadata_only', warnings: ['Legacy binary Microsoft Office formats are metadata-only. Convert to DOCX, PPTX or XLSX for governed content extraction.'] }
  }
  return { text: '', method: 'metadata_only', warnings: [] as string[] }
}

function extractOfficeZipText(bytes: Uint8Array, extension: string) {
  try {
    const entries = readZipEntries(bytes)
    const selected = entries.filter((entry) => {
      if (extension === 'docx') return /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(entry.name)
      if (extension === 'pptx') return /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/i.test(entry.name)
      return /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(entry.name)
    })
    const parts = selected.map((entry) => xmlVisibleText(entry.data.toString('utf8'))).filter(Boolean)
    return {
      text: parts.join('\n\n'),
      method: `${extension}_openxml`,
      warnings: parts.length ? [`Extracted governed text from ${parts.length} Open XML document part${parts.length === 1 ? '' : 's'}.`] : [`No readable Open XML text parts were found in the ${extension.toUpperCase()} package.`],
    }
  } catch (error) {
    return { text: '', method: `${extension}_openxml`, warnings: [`Open XML extraction could not complete: ${error instanceof Error ? error.message : 'unknown error'}`] }
  }
}

function readZipEntries(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes)
  let eocd = -1
  const floor = Math.max(0, buffer.length - 65_557)
  for (let index = buffer.length - 22; index >= floor; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break }
  }
  if (eocd < 0) throw new Error('ZIP central directory was not found')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries: Array<{ name: string; data: Buffer }> = []
  let totalExpanded = 0
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIP central directory entry is invalid')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    offset += 46 + nameLength + extraLength + commentLength
    if (!/\.(xml|rels)$/i.test(name) || uncompressedSize > MAX_EXTRACTED_ENTRY_BYTES) continue
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) continue
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    let data: Buffer
    if (method === 0) data = Buffer.from(compressed)
    else if (method === 8) data = Buffer.from(inflateRawSync(compressed))
    else continue
    totalExpanded += data.byteLength
    if (totalExpanded > MAX_EXTRACTED_TOTAL_BYTES) throw new Error('Expanded Office document content exceeds the safe extraction limit')
    entries.push({ name, data })
  }
  return entries
}

function xmlVisibleText(xml: string) {
  const normalized = xml
    .replace(/<w:tab\s*\/>/gi, '\t')
    .replace(/<(?:w:br|a:br)\s*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<\/a:p>/gi, '\n')
  const values: string[] = []
  const regex = /<(?:w:t|a:t|t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t|t)>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(normalized))) values.push(decodeXmlEntities(match[1]))
  return values.join(' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function extractPdfText(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes)
  const binary = buffer.toString('latin1')
  const parts: string[] = []
  let cursor = 0
  let processedStreams = 0
  while (cursor < binary.length && processedStreams < 500) {
    const marker = binary.indexOf('stream', cursor)
    if (marker < 0) break
    const end = binary.indexOf('endstream', marker + 6)
    if (end < 0) break
    const dictionary = binary.slice(Math.max(0, marker - 1500), marker)
    let start = marker + 6
    if (binary[start] === '\r' && binary[start + 1] === '\n') start += 2
    else if (binary[start] === '\n' || binary[start] === '\r') start += 1
    let raw = buffer.subarray(start, end)
    while (raw.length && (raw[raw.length - 1] === 10 || raw[raw.length - 1] === 13)) raw = raw.subarray(0, raw.length - 1)
    try {
      if (/\/FlateDecode/.test(dictionary)) raw = Buffer.from(inflateSync(raw))
      const stream = raw.toString('latin1')
      for (const block of stream.match(/BT[\s\S]*?ET/g) ?? []) {
        const text = extractPdfTextOperators(block)
        if (text) parts.push(text)
      }
    } catch {}
    processedStreams += 1
    cursor = end + 9
  }
  const text = parts.join('\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return {
    text,
    method: 'pdf_content_streams',
    warnings: text
      ? ['Extracted text from PDF content streams. Scanned-image PDFs still require OCR and remain metadata-only when no text layer exists.']
      : ['No extractable PDF text layer was found. Scanned-image PDFs require OCR and were retained as metadata-only.'],
  }
}

function extractPdfTextOperators(block: string) {
  const parts: string[] = []
  const regex = /\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]{2,})>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(block))) {
    if (match[0].startsWith('(')) parts.push(decodePdfLiteral(match[0].slice(1, -1)))
    else if (match[1]) {
      const hex = match[1].replace(/\s+/g, '')
      if (hex.length % 2 === 0) {
        try { parts.push(Buffer.from(hex, 'hex').toString('utf8').replace(/\u0000/g, '')) } catch {}
      }
    }
  }
  return parts.join(' ').trim()
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([0-7]{1,3})/g, (_m, octal) => String.fromCharCode(Number.parseInt(octal, 8)))
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\b/g, '\b').replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
}
