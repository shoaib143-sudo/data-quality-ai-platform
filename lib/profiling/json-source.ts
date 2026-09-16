export type ParsedJsonSource = {
  rows: Record<string, unknown>[]
  rowCount: number
  warnings: string[]
}

export function normalizeJsonRow(value: unknown, index: number): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { record_index: index + 1, ...value as Record<string, unknown> }
    : { record_index: index + 1, value }
}

export function parseJson(input: string, maxRows: number): ParsedJsonSource {
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch (error) {
    throw new Error(`Invalid JSON source: ${error instanceof Error ? error.message : 'parse failed'}`)
  }

  const rawRows = Array.isArray(value) ? value : [value]
  const rows = rawRows.map((item, index) => normalizeJsonRow(item, index))
  const warnings: string[] = []
  if (rows.length > maxRows) warnings.push(`JSON source contains ${rows.length} records; ${maxRows} were selected for profiling.`)
  return { rows: rows.slice(0, maxRows), rowCount: rows.length, warnings }
}

export function parseJsonLines(input: string, maxRows: number): ParsedJsonSource {
  const sourceLines = input.split(/\r?\n/)
  const records = sourceLines.flatMap((line, sourceIndex) => line.trim() ? [{ line, sourceLine: sourceIndex + 1 }] : [])
  const rows = records.map(({ line, sourceLine }, recordIndex) => {
    try {
      return normalizeJsonRow(JSON.parse(line), recordIndex)
    } catch (error) {
      throw new Error(`Invalid JSONL source at line ${sourceLine}: ${error instanceof Error ? error.message : 'parse failed'}`)
    }
  })
  const warnings: string[] = []
  if (rows.length > maxRows) warnings.push(`JSONL source contains ${rows.length} records; ${maxRows} were selected for profiling.`)
  return { rows: rows.slice(0, maxRows), rowCount: rows.length, warnings }
}
