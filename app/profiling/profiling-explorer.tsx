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
}

export type ExplorerMetric = {
  profile_column_id: string | null
  metric_key: string
  numeric_value: number | null
  text_value: string | null
  boolean_value: boolean | null
  json_value: unknown
}

function percent(value: number | null) {
  return value === null ? 'N/A' : `${Math.round(value * 100)}%`
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

export default function ProfilingExplorer({
  findings,
  columns,
  metrics,
}: {
  findings: ExplorerFinding[]
  columns: ExplorerColumn[]
  metrics: ExplorerMetric[]
}) {
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('ALL')
  const [findingType, setFindingType] = useState('ALL')
  const [columnId, setColumnId] = useState('ALL')

  const findingTypes = useMemo(() => Array.from(new Set(findings.map((finding) => finding.finding_type))).sort(), [findings])
  const severities = useMemo(() => Array.from(new Set(findings.map((finding) => finding.severity))).sort(), [findings])
  const filteredFindings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return findings.filter((finding) => {
      if (severity !== 'ALL' && finding.severity !== severity) return false
      if (findingType !== 'ALL' && finding.finding_type !== findingType) return false
      if (columnId !== 'ALL' && finding.profile_column_id !== columnId) return false
      if (!normalizedQuery) return true
      return [finding.title, finding.description, finding.finding_type, finding.severity]
        .some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))
    })
  }, [findings, query, severity, findingType, columnId])

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

  const selectedColumn = columnId !== 'ALL' ? columns.find((column) => column.id === columnId) : null
  const selectedMetrics = selectedColumn ? metricsByColumn.get(selectedColumn.id) ?? [] : []

  return (
    <section className="rounded-xl border p-6">
      <div>
        <h2 className="font-semibold">Interactive Findings & Drill-down</h2>
        <p className="mt-1 text-sm text-muted-foreground">Filter persisted governance findings and inspect the exact metric evidence for a selected column.</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search findings"
          className="rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="Search findings"
        />
        <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Filter by severity">
          <option value="ALL">All severities</option>
          {severities.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <select value={findingType} onChange={(event) => setFindingType(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Filter by finding type">
          <option value="ALL">All finding types</option>
          {findingTypes.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <select value={columnId} onChange={(event) => setColumnId(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Drill down to column">
          <option value="ALL">All columns</option>
          {columns.map((column) => <option key={column.id} value={column.id}>{column.column_name}</option>)}
        </select>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">Filtered Findings</h3>
            <span className="text-xs text-muted-foreground">{filteredFindings.length} of {findings.length}</span>
          </div>
          <div className="mt-3 max-h-96 space-y-2 overflow-auto">
            {filteredFindings.length ? filteredFindings.map((finding) => (
              <article key={finding.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <strong>{finding.title}</strong>
                  <span className="rounded-full border px-2 py-0.5 text-xs">{finding.severity}</span>
                </div>
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
              <div className="mt-1 text-xs text-muted-foreground">{selectedColumn.column_name} · {selectedColumn.inferred_type ?? selectedColumn.source_type ?? 'unknown type'}</div>
              <div className="mt-3 max-h-96 space-y-2 overflow-auto">
                {selectedMetrics.length ? selectedMetrics.map((metric) => (
                  <div key={`${metric.profile_column_id}:${metric.metric_key}`} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <span>{label(metric.metric_key)}</span>
                    <span className="font-medium">
                      {metric.numeric_value !== null ? String(metric.numeric_value)
                        : metric.text_value !== null ? metric.text_value
                          : metric.boolean_value !== null ? String(metric.boolean_value)
                            : metric.json_value !== null ? JSON.stringify(metric.json_value)
                              : 'N/A'}
                    </span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No persisted metrics are available for this column.</p>}
              </div>
            </>
          ) : <p className="mt-2 text-sm text-muted-foreground">Select a column to inspect its persisted metric evidence.</p>}
        </div>
      </div>
    </section>
  )
}
