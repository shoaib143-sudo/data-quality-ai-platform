import type { SupabaseClient } from '@supabase/supabase-js'

import {
  detectSensitiveTextEvidence,
  readableDocumentEvidence,
  summarizeDocumentEvidence,
  type DocumentEvidenceState,
} from '@/lib/profiling/document-evidence'
import { loadGovernedFileSource } from '@/lib/profiling/governed-file-source'
import type { FileSourceConfig } from '@/lib/profiling/file-source-adapter'

export type PersistedDocumentChunk = {
  chunk_index: number | null
  content: unknown
  character_count?: number | null
}

export type CanonicalPreviewSample = {
  index: number
  content: string
  character_count: number | null
}

export type CanonicalDocumentPreview = {
  evidenceState: DocumentEvidenceState
  samples: CanonicalPreviewSample[]
  readableText: string[]
  sensitiveEvidence: ReturnType<typeof detectSensitiveTextEvidence>
  source?: 'PERSISTED_DOCUMENT_EVIDENCE' | 'GOVERNED_SOURCE_READER'
  extractionMethod?: string | null
  warnings?: string[]
}

// Keep this wording aligned with the dashboard's existing fail-closed extraction-unavailable
// detector until the dashboard carries DocumentEvidenceState as a first-class prop.
const UNREADABLE_PLACEHOLDER = 'Readable text is unavailable from the governed document representation. Binary glyph streams are intentionally hidden, including encoded glyph streams; re-run extraction/OCR to refresh readable evidence.'
const EMPTY_PLACEHOLDER = 'No readable text sample was persisted for this document.'

export function canonicalizeDocumentPreview(
  chunks: PersistedDocumentChunk[],
  options: { documentPresent?: boolean; maxSamples?: number } = {},
): CanonicalDocumentPreview {
  const maxSamples = Math.max(1, options.maxSamples ?? 50)
  const evidence = summarizeDocumentEvidence(chunks.map((chunk) => chunk.content))
  const readableSamples = chunks.flatMap((chunk, offset) => {
    const readable = readableDocumentEvidence(chunk.content)
    if (!readable) return []
    return [{
      index: Number.isFinite(Number(chunk.chunk_index)) ? Number(chunk.chunk_index) : offset + 1,
      content: readable,
      character_count: readable.length,
    }]
  }).slice(0, maxSamples)

  const samples = readableSamples.length
    ? readableSamples
    : options.documentPresent
      ? [{
          index: 1,
          content: evidence.state === 'UNREADABLE' ? UNREADABLE_PLACEHOLDER : EMPTY_PLACEHOLDER,
          character_count: null,
        }]
      : []

  return {
    evidenceState: evidence.state,
    samples,
    readableText: evidence.readable,
    sensitiveEvidence: detectSensitiveTextEvidence(evidence.readable),
    source: 'PERSISTED_DOCUMENT_EVIDENCE',
  }
}

export async function loadCanonicalDocumentPreviewFromSource(
  supabase: SupabaseClient,
  config: FileSourceConfig,
  options: { maxSamples?: number; maxBytes?: number } = {},
): Promise<CanonicalDocumentPreview> {
  const maxSamples = Math.max(1, options.maxSamples ?? 50)
  const loaded = await loadGovernedFileSource(supabase, config, {
    maxRows: maxSamples,
    maxBytes: options.maxBytes,
  })
  const candidateText = loaded.rows.map((row) => row.text)
  const evidence = summarizeDocumentEvidence(candidateText)
  const samples = loaded.rows.flatMap((row, offset) => {
    const readable = readableDocumentEvidence(row.text)
    if (!readable) return []
    const index = Number(row.chunk_index ?? row.document_index ?? offset + 1)
    return [{
      index: Number.isFinite(index) ? index : offset + 1,
      content: readable,
      character_count: readable.length,
    }]
  }).slice(0, maxSamples)

  return {
    evidenceState: evidence.state,
    samples: samples.length ? samples : [{
      index: 1,
      content: evidence.state === 'UNREADABLE' ? UNREADABLE_PLACEHOLDER : EMPTY_PLACEHOLDER,
      character_count: null,
    }],
    readableText: evidence.readable,
    sensitiveEvidence: detectSensitiveTextEvidence(evidence.readable),
    source: 'GOVERNED_SOURCE_READER',
    extractionMethod: typeof loaded.metadata.text_extraction_method === 'string' ? loaded.metadata.text_extraction_method : null,
    warnings: loaded.warnings,
  }
}

function sanitizePresentationValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return readableDocumentEvidence(value) ?? (value.trim() ? '[Unreadable binary/glyph evidence hidden]' : value)
  }
  if (Array.isArray(value)) return value.map(sanitizePresentationValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, sanitizePresentationValue(nested)]))
  }
  return value
}

export function sanitizePersistedMetricForPresentation<T extends {
  text_value: string | null
  json_value: unknown
}>(metric: T): T {
  return {
    ...metric,
    text_value: metric.text_value === null ? null : String(sanitizePresentationValue(metric.text_value)),
    json_value: sanitizePresentationValue(metric.json_value),
  }
}
