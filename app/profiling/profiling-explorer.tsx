'use client'

import { useMemo, useState } from 'react'

export type ExplorerFinding = {
  id: string
  profile_column_id: string | null
  finding_type: string
  severity: string
  title: string
  description: string
  confidence: number | null
}

export type ExplorerColumn = {
  id: string
  column_name: string
  source_type: string | null
  inferred_type: string | null
  semantic_type: string | null
  nullable: boolean | null
  confidence: number | null
  is_candidate_key: boolean
  key_confidence: number | null
  total_count: number | null
  non_null_count: number | null
  null_count: number | null
  blank_count: number | null
  zero_count: number | null
  distinct_count: number | null
  distinct_percentage: number | null
}

export type ExplorerMetric = {
  profile_column_id: string | null
  metric_key: string
  numeric_value: number | null
  text_value: string | null
  boolean_value: boolean | null
  json_value: unknown
}

export type ExplorerDistribution = {
  profile_column_id: string | null
  distribution_type: string
  distribution: unknown
}

type HistogramBucket = { min: number; max: number; count: number }

function percent(value: number | null) {
  return value === null ? 'N/A' : `${Math.round(value * 100)}%`
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function number(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function ratio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return null
  return numerator / denominator
}

function compactNumber(value: number | null) {
  if (value === null) return 'N/A'
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function histogramBuckets(value: unknown): HistogramBucket[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const min = number(row.min)
    const max = number(row.max)
    const count = number(row.count)
    return min === null || max === null || count === null ? [] : [{ min, max, count }]
  })
}

function quantiles(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const order = ['p01','p05','p25','p50','p75','p95','p99']
  const row = value as Record<string, unknown>
  return order.flatMap((key) => {
    const parsed = number(row[key])
    return parsed === null ? [] : [{ key, value: parsed }]
  })
}

export default function ProfilingExplorer({
  findings,
  columns,
  metrics,
  distributions,
  initialColumnId = null,
  initialFindingId = null,
}: {
  findings: ExplorerFinding[]
  columns: ExplorerColumn[]
  metrics: ExplorerMetric[]
  distributions: ExplorerDistribution[]
  initialColumnId?: string | null
  initialFindingId?: string | null
}) {
  const validInitialColumn = initialColumnId && columns.some((column) => column.id === initialColumnId) ? initialColumnId : 'ALL'
  const validInitialFinding = initialFindingId && findings.some((finding) => finding.id === initialFindingId) ? initialFindingId : null
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('ALL')
  const [findingType, setFindingType] = useState('ALL')
  const [columnId, setColumnId] = useState(validInitialColumn)
  const [focusedFindingId, setFocusedFindingId] = useState<string | null>(validInitialFinding)

  function clearSemanticFocus() {
    if (focusedFindingId) setFocusedFindingId(null)
  }

  const findingTypes = useMemo(() => Array.from(new Set(findings.map((finding) => finding.finding_type))).sort(), [findings])
  const severities = useMemo(() => Array.from(new Set(findings.map((finding) => finding.severity))).sort(), [findings])
  const filteredFindings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return findings.filter((finding) => {
      if (focusedFindingId && finding.id !== focusedFindingId) return false
      if (severity !== 'ALL' && finding.severity !== severity) return false
      if (findingType !== 'ALL' && finding.finding_type !== findingType) return false
      if (columnId !== 'ALL' && finding.profile_column_id !== columnId) return false
      if (!normalizedQuery) return true
      return [finding.title, finding.description, finding.finding_type, finding.severity]
        .some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))
    })
  }, [findings, query, severity, findingType, columnId, focusedFindingId])

  const metricsByColumn = useMemo(() => {
    const map = new Map<string, ExplorerMetric[]>()
    for (const metric of metrics) {
      if (!metric.profile_column_id) continue
      const current = map.get(metric.profile_column_id) ?? []
      current.push(metric)
      map.set(metric.profile_column_id, current)
    }
    return map
  }, [metrics])

  const distributionsByColumn = useMemo(() => {
    const map = new Map<string, Map<string, unknown>>()
    for (const distribution of distributions) {
      if (!distribution.profile_column_id) continue
      const current = map.get(distribution.profile_column_id) ?? new Map<string, unknown>()
      current.set(distribution.distribution_type.toUpperCase(), distribution.distribution)
      map.set(distribution.profile_column_id, current)
    }
    return map
  }, [distributions])

  const selectedColumn = columnId !== 'ALL' ? columns.find((column) => column.id === columnId) : null
  const selectedMetrics = selectedColumn ? metricsByColumn.get(selectedColumn.id) ?? [] : []
  const selectedDistributions = selectedColumn ? distributionsByColumn.get(selectedColumn.id) ?? new Map<string, unknown>() : new Map<string, unknown>()
  const histogram = histogramBuckets(selectedDistributions.get('HISTOGRAM'))
  const percentileRows = quantiles(selectedDistributions.get('QUANTILES'))
  const histogramMax = histogram.length ? Math.max(...histogram.map((bucket) => bucket.count), 1) : 1

  const selectedStats = selectedColumn ? [
    { label: 'Rows', value: compactNumber(number(selectedColumn.total_count)) },
    { label: 'Non-null', value: compactNumber(number(selectedColumn.non_null_count)) },
    { label: 'Null rate', value: percent(ratio(number(selectedColumn.null_count), number(selectedColumn.total_count))) },
    { label: 'Blank rate', value: percent(ratio(number(selectedColumn.blank_count), number(selectedColumn.total_count))) },
    { label: 'Zero rate', value: percent(ratio(number(selectedColumn.zero_count), number(selectedColumn.total_count))) },
    { label: 'Distinct', value: compactNumber(number(selectedColumn.distinct_count)) },
    { label: 'Distinct %', value: selectedColumn.distinct_percentage === null ? 'N/A' : `${compactNumber(number(selectedColumn.distinct_percentage))}%` },
    { label: 'Type confidence', value: percent(number(selectedColumn.confidence)) },
  ] : []

  return (
    <section className="rounded-xl border p-6">
      <div>
        <h2 className="font-semibold">Interactive Findings & Column Metrics Drill-down</h2>
        <p className="mt-1 text-sm text-muted-foreground">Filter persisted findings and inspect exact metric evidence, column statistics, histograms and quantiles from the selected profiling run.</p>
      </div>

      {focusedFindingId ? (
        <div className="mt-4 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <span>Focused on the finding selected from semantic search.</span>
          <button type="button" onClick={() => setFocusedFindingId(null)} className="font-semibold underline">Show all findings</button>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <input value={query} onChange={(event) => { clearSemanticFocus(); setQuery(event.target.value) }} placeholder="Search findings" className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Search findings" />
        <select value={severity} onChange={(event) => { clearSemanticFocus(); setSeverity(event.target.value) }} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Filter by severity">
          <option value="ALL">All severities</option>{severities.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <select value={findingType} onChange={(event) => { clearSemanticFocus(); setFindingType(event.target.value) }} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Filter by finding type">
          <option value="ALL">All finding types</option>{findingTypes.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <select value={columnId} onChange={(event) => { clearSemanticFocus(); setColumnId(event.target.value) }} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Drill down to column">
          <option value="ALL">All columns</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.column_name}</option>)}
        </select>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="font-medium">Filtered Findings</h3><span className="text-xs text-muted-foreground">{filteredFindings.length} of {findings.length}</span></div>
          <div className="mt-3 max-h-96 space-y-2 overflow-auto">
            {filteredFindings.length ? filteredFindings.map((finding) => (
              <article key={finding.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-start justify-between gap-3"><strong>{finding.title}</strong><span className="rounded-full border px-2 py-0.5 text-xs">{finding.severity}</span></div>
                <div className="mt-1 text-xs text-muted-foreground">{label(finding.finding_type)} · confidence {percent(finding.confidence)}</div>
                <p className="mt-2 text-muted-foreground">{finding.description}</p>
              </article>
            )) : <p className="text-sm text-muted-foreground">No findings match the active filters.</p>}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Column Evidence</h3>
          {selectedColumn ? (
            <>
              <div className="mt-1 text-xs text-muted-foreground">{selectedColumn.column_name} · {selectedColumn.inferred_type ?? selectedColumn.source_type ?? 'unknown type'}{selectedColumn.semantic_type ? ` · ${selectedColumn.semantic_type}` : ''}{selectedColumn.is_candidate_key ? ` · candidate key ${percent(selectedColumn.key_confidence)}` : ''}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {selectedStats.map((stat) => <div key={stat.label} className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">{stat.label}</div><div className="mt-1 text-sm font-semibold">{stat.value}</div></div>)}
              </div>
              <div className="mt-4 max-h-72 space-y-2 overflow-auto">
                {selectedMetrics.length ? selectedMetrics.map((metric) => (
                  <div key={`${metric.profile_column_id}:${metric.metric_key}`} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <span>{label(metric.metric_key)}</span>
                    <span className="max-w-[55%] break-all text-right font-medium">{metric.numeric_value !== null ? String(metric.numeric_value) : metric.text_value !== null ? metric.text_value : metric.boolean_value !== null ? String(metric.boolean_value) : metric.json_value !== null ? JSON.stringify(metric.json_value) : 'N/A'}</span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No persisted metrics are available for this column.</p>}
              </div>
            </>
          ) : <p className="mt-2 text-sm text-muted-foreground">Select a column to inspect its persisted metric evidence and distributions.</p>}
        </div>
      </div>

      {selectedColumn ? <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="font-medium">Histogram</h3><span className="text-xs text-muted-foreground">persisted distribution</span></div>
          {histogram.length ? <div className="mt-4 space-y-3">{histogram.map((bucket, index) => (
            <div key={`${bucket.min}:${bucket.max}:${index}`}>
              <div className="flex justify-between gap-3 text-xs"><span>{compactNumber(bucket.min)} – {compactNumber(bucket.max)}</span><span className="font-medium">{compactNumber(bucket.count)}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(2, (bucket.count / histogramMax) * 100)}%` }} /></div>
            </div>
          ))}</div> : <p className="mt-3 text-sm text-muted-foreground">No populated histogram is available for this column.</p>}
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="font-medium">Quantiles</h3><span className="text-xs text-muted-foreground">p01 → p99</span></div>
          {percentileRows.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{percentileRows.map((item) => <div key={item.key} className="rounded-md border p-3"><div className="text-[11px] uppercase text-muted-foreground">{item.key}</div><div className="mt-1 font-semibold">{compactNumber(item.value)}</div></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No populated quantiles are available for this column.</p>}
        </div>
      </div> : null}
    </section>
  )
}