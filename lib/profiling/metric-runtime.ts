import { createHash } from 'node:crypto'

export type MetricDefinition = {
  id: string
  name: string
  type: string
  column?: string
}

export type MetricExecutionResult = {
  metric_definition_id: string
  metric_name: string
  value: unknown
  status: 'COMPLETED' | 'FAILED'
  error?: string
}

type Row = Record<string, unknown>
const RATE_SCALE = 4

function round(value: number, places = RATE_SCALE) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function isMissing(value: unknown) { return value === null || value === undefined }
function normalize(value: unknown) { return typeof value === 'string' ? value.trim() : value }

function valueKey(value: unknown): string {
  const normalized = normalize(value)
  if (isMissing(normalized)) return '__NULL__'
  if (typeof normalized === 'string') return normalized
  if (Array.isArray(normalized)) return JSON.stringify(normalized.map(valueKey))
  if (typeof normalized !== 'object') return JSON.stringify(normalized)
  return JSON.stringify(Object.fromEntries(Object.entries(normalized as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, valueKey(item)])))
}

function numericValues(values: unknown[]) { return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) }
function percentile(values: number[], p: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function numericStats(values: unknown[]) {
  const nums = numericValues(values)
  if (!nums.length) return { nums, min: null, max: null, mean: null, median: null, stddev: null, negative: 0, zero: 0, outlier: 0 }
  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length
  const variance = nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nums.length
  const q1 = percentile(nums, 0.25)!
  const q3 = percentile(nums, 0.75)!
  const iqr = q3 - q1
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  return {
    nums,
    min: Math.min(...nums),
    max: Math.max(...nums),
    mean,
    median: percentile(nums, 0.5),
    stddev: Math.sqrt(variance),
    negative: nums.filter((value) => value < 0).length,
    zero: nums.filter((value) => value === 0).length,
    outlier: nums.filter((value) => value < lower || value > upper).length,
  }
}

function emailMatch(value: unknown) { return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) }
function phoneMatch(value: unknown) { return typeof value === 'string' && /^[+()\d\s.-]{7,}$/.test(value.trim()) }
function ssnMatch(value: unknown) { return typeof value === 'string' && /^\d{3}-?\d{2}-?\d{4}$/.test(value.trim()) }

function patternMatch(column: string, value: unknown) {
  if (isMissing(value)) return false
  const name = column.toLowerCase()
  if (name.includes('email')) return emailMatch(value)
  if (name.includes('phone') || name.includes('mobile')) return phoneMatch(value)
  if (name.includes('ssn') || name.includes('national_id')) return ssnMatch(value)
  return true
}

function sensitiveMatch(column: string, value: unknown) {
  if (isMissing(value)) return false
  const name = column.toLowerCase()
  if (name.includes('email')) return emailMatch(value)
  if (name.includes('phone') || name.includes('mobile')) return phoneMatch(value)
  if (name.includes('ssn') || name.includes('national_id')) return ssnMatch(value)
  if (name.includes('address')) return typeof value === 'string' && value.trim().length >= 8
  return false
}

function duplicateRowCount(rows: Row[]) {
  const frequencies = new Map<string, number>()
  for (const row of rows) {
    const key = valueKey(row)
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1)
  }
  return Array.from(frequencies.values()).reduce((sum, count) => sum + (count > 1 ? count - 1 : 0), 0)
}

function histogram(values: number[]) {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [{ min: round(min), max: round(max), count: values.length }]
  const bins = Math.min(10, Math.max(2, Math.ceil(Math.sqrt(values.length))))
  const width = (max - min) / bins
  const result = Array.from({ length: bins }, (_, index) => ({ min: round(min + index * width), max: round(index === bins - 1 ? max : min + (index + 1) * width), count: 0 }))
  for (const value of values) result[Math.min(bins - 1, Math.floor((value - min) / width))].count += 1
  return result
}

function topValues(values: unknown[], limit = 10) {
  const counts = new Map<string, { value: unknown; count: number }>()
  for (const value of values.filter((item) => !isMissing(item))) {
    const key = valueKey(value)
    const current = counts.get(key)
    counts.set(key, { value, count: (current?.count ?? 0) + 1 })
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || valueKey(a.value).localeCompare(valueKey(b.value))).slice(0, limit)
}

function metricValue(type: string, column: string | undefined, rows: Row[]): unknown {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  if (type === 'row_count') return rows.length
  if (type === 'column_count') return columns.length
  if (type === 'duplicate_row_count') return duplicateRowCount(rows)
  if (type === 'duplicate_row_rate') return rows.length ? round(duplicateRowCount(rows) / rows.length) : 0
  if (type === 'schema_hash') return createHash('sha256').update(JSON.stringify(columns.sort())).digest('hex')
  if (!column) throw new Error('Metric column is required')

  const values = rows.map((row) => row[column])
  const nonNull = values.filter((value) => !isMissing(value))
  const nullCount = values.length - nonNull.length
  const distinctCount = new Set(nonNull.map(valueKey)).size
  const frequencies = new Map<string, number>()
  for (const value of nonNull) {
    const key = valueKey(value)
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1)
  }
  const uniqueCount = Array.from(frequencies.values()).filter((count) => count === 1).length
  const nullRate = values.length ? nullCount / values.length : 0
  const distinctRate = nonNull.length ? distinctCount / nonNull.length : 0
  const uniqueRate = nonNull.length ? uniqueCount / nonNull.length : 0
  const patternEligible = nonNull.length
  const patternCount = nonNull.filter((value) => patternMatch(column, value)).length
  const sensitiveCount = nonNull.filter((value) => sensitiveMatch(column, value)).length
  const stats = numericStats(values)
  const strings = nonNull.filter((value): value is string => typeof value === 'string')
  const lengths = strings.map((value) => value.length)

  switch (type) {
    case 'non_null_count': return nonNull.length
    case 'null_count': return nullCount
    case 'null_rate': return round(nullRate)
    case 'distinct_count': return distinctCount
    case 'distinct_rate': return round(distinctRate)
    case 'unique_count': return uniqueCount
    case 'unique_rate': return round(uniqueRate)
    case 'pattern_count': return patternCount
    case 'pattern_match_rate': return patternEligible ? round(patternCount / patternEligible) : null
    case 'sensitive_match_rate': return patternEligible ? round(sensitiveCount / patternEligible) : 0
    case 'candidate_key_confidence': return values.length ? round(uniqueRate * (1 - nullRate)) : 0
    case 'empty_string_count': return strings.filter((value) => value === '').length
    case 'whitespace_only_count': return strings.filter((value) => value.trim() === '').length
    case 'length_min': return lengths.length ? Math.min(...lengths) : null
    case 'length_max': return lengths.length ? Math.max(...lengths) : null
    case 'length_mean': return lengths.length ? round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length) : null
    case 'min': return stats.min === null ? null : round(stats.min)
    case 'max': return stats.max === null ? null : round(stats.max)
    case 'mean': return stats.mean === null ? null : round(stats.mean)
    case 'median': return stats.median === null ? null : round(stats.median)
    case 'stddev': return stats.stddev === null ? null : round(stats.stddev)
    case 'negative_count': return stats.negative
    case 'zero_count': return stats.zero
    case 'outlier_count': return stats.outlier
    case 'outlier_rate': return stats.nums.length ? round(stats.outlier / stats.nums.length) : null
    case 'histogram': return histogram(stats.nums)
    case 'quantiles': return { p25: percentile(stats.nums, 0.25), p50: percentile(stats.nums, 0.5), p75: percentile(stats.nums, 0.75), p90: percentile(stats.nums, 0.9), p95: percentile(stats.nums, 0.95), p99: percentile(stats.nums, 0.99) }
    case 'top_values': return topValues(values)
    default: throw new Error(`Unsupported metric type: ${type}`)
  }
}

export async function executeMetrics(definitions: MetricDefinition[], rows: Record<string, unknown>[]): Promise<MetricExecutionResult[]> {
  return definitions.map((metric) => {
    try {
      return { metric_definition_id: metric.id, metric_name: metric.name, value: metricValue(metric.type, metric.column, rows), status: 'COMPLETED' }
    } catch (error) {
      return { metric_definition_id: metric.id, metric_name: metric.name, value: null, status: 'FAILED', error: error instanceof Error ? error.message : 'Unknown metric error' }
    }
  })
}
