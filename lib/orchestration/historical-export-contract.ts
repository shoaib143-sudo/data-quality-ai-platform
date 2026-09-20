export const HISTORICAL_EXPORT_KINDS = [
  'AUDIT_EVENTS',
  'ANALYTICS_EVENTS',
  'GOVERNANCE_OUTCOME_REPORTS',
] as const

export type HistoricalExportKind = typeof HISTORICAL_EXPORT_KINDS[number]

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalTimestamp(value: unknown, name: string) {
  const normalized = text(value)
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be a valid timestamp.`)
  return parsed.toISOString()
}

function safeFilterToken(value: unknown, name: string) {
  const normalized = text(value)
  if (!normalized) return null
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(normalized)) {
    throw new Error(`${name} contains unsupported characters.`)
  }
  return normalized
}

export function normalizeHistoricalExportKind(value: unknown): HistoricalExportKind {
  const normalized = text(value).toUpperCase()
  if (!HISTORICAL_EXPORT_KINDS.includes(normalized as HistoricalExportKind)) {
    throw new Error(`Unsupported historical export kind: ${normalized || String(value)}`)
  }
  return normalized as HistoricalExportKind
}

export function normalizeHistoricalExportFilters(
  kindValue: HistoricalExportKind | string,
  input: Record<string, unknown> | null | undefined,
) {
  const kind = normalizeHistoricalExportKind(kindValue)
  const source = input ?? {}
  const from = optionalTimestamp(source.from, 'from')
  const to = optionalTimestamp(source.to, 'to')
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
    throw new Error('from must be earlier than or equal to to.')
  }

  if (kind === 'AUDIT_EVENTS') {
    const actorType = text(source.actorType).toUpperCase() || null
    if (actorType && !['USER', 'SYSTEM', 'AGENT'].includes(actorType)) {
      throw new Error('actorType must be USER, SYSTEM or AGENT.')
    }
    return {
      from,
      to,
      actorType,
      eventPrefix: safeFilterToken(source.eventPrefix, 'eventPrefix'),
      entityType: safeFilterToken(source.entityType, 'entityType'),
    }
  }

  if (kind === 'ANALYTICS_EVENTS') {
    return {
      from,
      to,
      eventPrefix: safeFilterToken(source.eventPrefix, 'eventPrefix'),
      aggregateType: safeFilterToken(source.aggregateType, 'aggregateType'),
    }
  }

  const persona = text(source.persona).toUpperCase() || null
  const depth = text(source.depth).toUpperCase() || null
  if (persona && !['EXECUTIVE', 'GOVERNANCE_COUNCIL', 'DATA_STEWARD', 'AUDIT'].includes(persona)) {
    throw new Error('persona is unsupported.')
  }
  if (depth && !['EXECUTIVE', 'GOVERNANCE', 'AUDIT'].includes(depth)) {
    throw new Error('depth is unsupported.')
  }
  return { from, to, persona, depth }
}

export function boundHistoricalExportChunkSize(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 500
  return Math.max(100, Math.min(2000, Math.trunc(numeric)))
}

export function boundHistoricalExportRetentionDays(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 7
  return Math.max(1, Math.min(90, Math.trunc(numeric)))
}

export function planHistoricalExportChunk(input: {
  offset: number
  partCount: number
  rowsExported: number
  chunkSize: number
  rowCount: number
}) {
  const offset = Math.max(0, Math.trunc(input.offset))
  const partCount = Math.max(0, Math.trunc(input.partCount))
  const rowsExported = Math.max(0, Math.trunc(input.rowsExported))
  const chunkSize = Math.max(1, Math.trunc(input.chunkSize))
  const rowCount = Math.max(0, Math.trunc(input.rowCount))
  if (rowCount > chunkSize) throw new Error('Historical export page exceeds configured chunk size.')
  return {
    partNumber: rowCount > 0 ? partCount + 1 : null,
    nextOffset: offset + rowCount,
    nextRowsExported: rowsExported + rowCount,
    complete: rowCount < chunkSize,
  }
}
