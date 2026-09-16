export type DocumentEvidenceState = 'READABLE' | 'UNREADABLE' | 'EMPTY'

const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const REPLACEMENT_CHARACTER = /\uFFFD/g

export function normalizeDocumentEvidence(value: unknown) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARACTER, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function documentEvidenceState(value: unknown): DocumentEvidenceState {
  if (typeof value !== 'string' || !value.trim()) return 'EMPTY'
  const raw = value.trim()
  const replacementCount = (raw.match(REPLACEMENT_CHARACTER) ?? []).length
  const suspiciousCount = [...raw].filter((char) => {
    const code = char.charCodeAt(0)
    return code < 32 && !['\n', '\r', '\t'].includes(char)
  }).length
  const letterOrDigitCount = (raw.match(/[\p{L}\p{N}]/gu) ?? []).length
  const printableCount = [...raw].filter((char) => {
    const code = char.charCodeAt(0)
    return code === 9 || code === 10 || code === 13 || code >= 32
  }).length
  const length = Math.max(raw.length, 1)
  if (replacementCount / length > 0.01) return 'UNREADABLE'
  if (suspiciousCount / length > 0.01) return 'UNREADABLE'
  if (printableCount / length < 0.9) return 'UNREADABLE'
  if (letterOrDigitCount / length < 0.25) return 'UNREADABLE'
  return 'READABLE'
}

export function readableDocumentEvidence(value: unknown) {
  if (documentEvidenceState(value) !== 'READABLE') return null
  const normalized = normalizeDocumentEvidence(value)
  return normalized || null
}

export function summarizeDocumentEvidence(values: unknown[]) {
  const readable = values.flatMap((value) => {
    const normalized = readableDocumentEvidence(value)
    return normalized ? [normalized] : []
  })
  const states = values.map(documentEvidenceState)
  const hasNonEmpty = states.some((state) => state !== 'EMPTY')
  return {
    state: readable.length ? 'READABLE' as const : hasNonEmpty ? 'UNREADABLE' as const : 'EMPTY' as const,
    readable,
  }
}

export function detectSensitiveTextEvidence(values: string[]) {
  const joined = values.join('\n')
  const patterns = [
    { type: 'Email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { type: 'Phone Number', regex: /(?:\+?\d[\d().\-\s]{7,}\d)/g },
  ]
  return patterns.flatMap(({ type, regex }) => {
    const matches = joined.match(regex) ?? []
    return matches.length ? [{ type, count: matches.length }] : []
  })
}
