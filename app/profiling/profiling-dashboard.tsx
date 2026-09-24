'use client'

import Link from 'next/link'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import type { PersonaSlug } from '@/lib/governance/personas'
import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Copy,
  Database,
  Eye,
  FileSearch,
  ShieldCheck,
  ShieldAlert,
  Table2,
  X,
} from 'lucide-react'

export type ProfilingDashboardRun = {
  id: string
  status: string
  row_count: number | null
  column_count: number | null
  started_at: string | null
  completed_at: string | null
  engine_name: string | null
  engine_version: string | null
}

export type ProfilingDashboardColumn = {
  id: string
  column_name: string
  source_type: string | null
  inferred_type: string | null
  semantic_type: string | null
  nullable: boolean | null
  total_count: number | null
  non_null_count: number | null
  null_count: number | null
  distinct_count: number | null
  distinct_percentage: number | null
}

export type ProfilingDashboardMetric = {
  profile_column_id: string | null
  metric_key: string
  numeric_value: number | null
  text_value: string | null
  boolean_value: boolean | null
  json_value: unknown
}

export type ProfilingDashboardDistribution = {
  profile_column_id: string | null
  distribution_type: string
  distribution: unknown
}

export type ProfilingDashboardFinding = {
  id: string
  profile_column_id: string | null
  finding_type: string
  severity: string
  title: string
  description: string
  confidence: number | null
}

export type ProfilingDashboardSample = {
  index: number
  content: string
  character_count: number | null
}

type Drilldown =
  | { kind: 'column'; columnId: string }
  | { kind: 'duplicates' }
  | { kind: 'sensitive' }
  | { kind: 'outliers' }
  | { kind: 'sample' }
  | null

type Props = {
  run: ProfilingDashboardRun
  datasetName: string
  datasetSubtitle: string | null
  columns: ProfilingDashboardColumn[]
  metrics: ProfilingDashboardMetric[]
  distributions: ProfilingDashboardDistribution[]
  findings: ProfilingDashboardFinding[]
  samples: ProfilingDashboardSample[]
  persona: PersonaSlug
  organizationRole?: string | null
  canMonitoring: boolean
  canQuality: boolean
  canExplorer: boolean
}

function number(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function rate(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return value > 1 ? value / 100 : value
}

function percent(value: number | null | undefined, digits = 1) {
  const normalized = rate(value)
  return normalized === null ? 'N/A' : `${(normalized * 100).toFixed(digits)}%`
}

function compact(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'N/A'
    : Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function metricValue(metrics: ProfilingDashboardMetric[], key: string) {
  return metrics.find((metric) => metric.metric_key === key)?.numeric_value ?? null
}

function duration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return 'N/A'
  const seconds = Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

function histogramValues(distribution: unknown) {
  if (!Array.isArray(distribution)) return [] as number[]
  return distribution.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const count = number((item as Record<string, unknown>).count)
    return count === null ? [] : [count]
  })
}

function MiniHistogram({ values }: { values: number[] }) {
  if (!values.length) return <span className="text-[10px] text-slate-400">No distribution</span>
  const bars = values.slice(0, 14)
  const max = Math.max(...bars, 1)
  return <div className="flex h-9 items-end gap-[2px]" aria-label="Persisted distribution histogram">
    {bars.map((value, index) => <span key={`${index}:${value}`} className="w-1.5 rounded-t bg-blue-500/80" style={{ height: `${Math.max(12, (value / max) * 100)}%` }} />)}
  </div>
}

function Card({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  if (!onClick) return <section className={`rounded-2xl border border-white/[0.08] bg-[#0a1d33] shadow-[0_10px_28px_rgba(0,0,0,.18)] ${className}`}>{children}</section>
  return <button type="button" onClick={onClick} className={`rounded-2xl border border-white/[0.08] bg-[#0a1d33] text-left shadow-[0_10px_28px_rgba(0,0,0,.18)] transition hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-[#0b2038] ${className}`}>{children}</button>
}

const DOCUMENT_TECHNICAL_FIELDS = new Set(['chunk_index', 'file_name', 'content_type', 'text_extraction_method'])

export default function ProfilingDashboard({ run, datasetName, datasetSubtitle, columns, metrics, distributions, findings, samples, persona, organizationRole, canMonitoring, canQuality, canExplorer }: Props) {
  const [drilldown, setDrilldown] = useState<Drilldown>(null)

  const metricsByColumn = useMemo(() => {
    const map = new Map<string, ProfilingDashboardMetric[]>()
    for (const metric of metrics) {
      if (!metric.profile_column_id) continue
      const current = map.get(metric.profile_column_id) ?? []
      current.push(metric)
      map.set(metric.profile_column_id, current)
    }
    return map
  }, [metrics])

  const distributionsByColumn = useMemo(() => {
    const map = new Map<string, ProfilingDashboardDistribution[]>()
    for (const distribution of distributions) {
      if (!distribution.profile_column_id) continue
      const current = map.get(distribution.profile_column_id) ?? []
      current.push(distribution)
      map.set(distribution.profile_column_id, current)
    }
    return map
  }, [distributions])

  const datasetMetrics = metrics.filter((metric) => !metric.profile_column_id)
  const duplicateCount = metricValue(datasetMetrics, 'duplicate_row_count') ?? 0
  const duplicateRate = metricValue(datasetMetrics, 'duplicate_row_rate')
  const uniqueRows = Math.max(0, Number(run.row_count ?? 0) - Number(duplicateCount ?? 0))

  const columnRows = columns.map((column) => {
    const columnMetrics = metricsByColumn.get(column.id) ?? []
    const nullRate = metricValue(columnMetrics, 'null_rate') ?? (column.total_count ? Number(column.null_count ?? 0) / column.total_count : null)
    const uniqueRate = metricValue(columnMetrics, 'unique_rate') ?? (column.total_count ? Number(column.distinct_count ?? 0) / column.total_count : null)
    const sensitiveRate = metricValue(columnMetrics, 'sensitive_match_rate')
    const sensitiveTypes = columnMetrics.find((metric) => metric.metric_key === 'sensitive_match_rate')?.text_value ?? null
    const outlierRate = metricValue(columnMetrics, 'outlier_rate')
    return { column, columnMetrics, nullRate, uniqueRate, sensitiveRate, sensitiveTypes, outlierRate }
  })

  const documentMode = columns.some((column) => ['text', 'text_extraction_method'].includes(column.column_name.toLowerCase())) || /\.pdf\b/i.test(datasetSubtitle ?? '')
  const documentRows = columnRows.filter((row) => !DOCUMENT_TECHNICAL_FIELDS.has(row.column.column_name.toLowerCase()))
  const visibleColumns = (documentMode && documentRows.length ? documentRows : columnRows).slice(0, 8)
  const sensitiveColumns = columnRows.filter((row) => Number(rate(row.sensitiveRate) ?? 0) > 0)
  const outlierColumns = columnRows.filter((row) => Number(rate(row.outlierRate) ?? 0) > 0)
  const selectedColumn = drilldown?.kind === 'column' ? columnRows.find((row) => row.column.id === drilldown.columnId) ?? null : null
  const extractionUnavailable = samples.some((sample) => /binary glyph streams are intentionally hidden|readable text is not available/i.test(sample.content))

  const runComplete = ['COMPLETED', 'SUCCEEDED'].includes(run.status.toUpperCase())

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#050b17] text-slate-100">
    <div className="mx-auto max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8">
      <GlobalUtilityBar persona={persona} organizationRole={organizationRole} roleLabel="Profiling" contextLabel={datasetName} homeHref="/home" />
      <header className="relative mt-4 overflow-hidden rounded-[26px] border border-cyan-300/12 bg-[#09192d] p-5 shadow-[0_20px_60px_rgba(0,0,0,.24)] sm:p-6">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/[0.07] blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 max-w-4xl">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">Datasets <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> Profiling evidence</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="truncate text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">{datasetName}</h1>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${runComplete ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200' : 'border-amber-300/20 bg-amber-300/[0.08] text-amber-200'}`}>{run.status}</span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{datasetSubtitle ?? 'Governed profiling evidence for the selected dataset version.'}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span className="rounded-lg border border-white/[0.07] bg-[#061321] px-2.5 py-1.5">{run.engine_name ?? 'Profiling engine'}{run.engine_version ? ` ${run.engine_version}` : ''}</span>
              <span className="rounded-lg border border-white/[0.07] bg-[#061321] px-2.5 py-1.5">{run.started_at ? new Date(run.started_at).toLocaleString() : 'Start time unavailable'}</span>
              <span className="rounded-lg border border-white/[0.07] bg-[#061321] px-2.5 py-1.5">Run {run.id.slice(0, 8)}</span>
            </div>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:min-w-[440px]">
            <div className="rounded-2xl border border-white/[0.07] bg-[#061321] p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-600">{documentMode ? 'Chunks' : 'Rows'}</p><p className="mt-1 text-xl font-black text-white">{compact(run.row_count)}</p></div>
            <div className="rounded-2xl border border-white/[0.07] bg-[#061321] p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-600">{documentMode ? 'Fields' : 'Columns'}</p><p className="mt-1 text-xl font-black text-white">{compact(run.column_count)}</p></div>
            <div className="rounded-2xl border border-white/[0.07] bg-[#061321] p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-600">Findings</p><p className="mt-1 text-xl font-black text-white">{findings.length}</p></div>
          </div>
        </div>
        {canExplorer ? <div className="relative mt-5 flex justify-end"><Link href={`/profiling/explorer?runId=${encodeURIComponent(run.id)}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-sm font-black text-white shadow-[0_0_18px_rgba(34,211,238,.10)]">Full profiling report <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div> : null}
      </header>

      <nav className="mt-4 grid gap-3 md:grid-cols-3" aria-label="Data analysis workspaces">
        <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.07] p-4 shadow-[0_0_20px_rgba(34,211,238,.04)]">
          <div className="flex items-center gap-3"><div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.08] p-2 text-cyan-300"><BarChart3 className="h-5 w-5" aria-hidden="true" /></div><div><div className="font-black text-cyan-100">Data Profiling</div><div className="text-xs text-cyan-200/60">Structure, statistics and patterns</div></div></div>
        </div>
        {canMonitoring ? <Link href="/monitoring" className="rounded-2xl border border-white/[0.08] bg-[#09192d] p-4 transition hover:border-cyan-300/25 hover:bg-[#0b2038]">
          <div className="flex items-center gap-3"><div className="rounded-xl border border-white/[0.07] bg-[#061321] p-2 text-cyan-300"><Activity className="h-5 w-5" aria-hidden="true" /></div><div><div className="font-black text-slate-100">Data Observability</div><div className="text-xs text-slate-500">Health, freshness and execution</div></div></div>
        </Link> : null}
        {canQuality ? <Link href="/data-quality" className="rounded-2xl border border-white/[0.08] bg-[#09192d] p-4 transition hover:border-cyan-300/25 hover:bg-[#0b2038]">
          <div className="flex items-center gap-3"><div className="rounded-xl border border-white/[0.07] bg-[#061321] p-2 text-cyan-300"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div><div><div className="font-black text-slate-100">Data Quality</div><div className="text-xs text-slate-500">Controls, findings and remediation</div></div></div>
        </Link> : null}
      </nav>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-300">Profile evidence</p><h2 className="mt-1 text-2xl font-black text-white">Data Profiling</h2><p className="text-sm text-slate-500">{documentMode ? 'Document-aware analysis of extracted content, structure and statistical evidence.' : 'Comprehensive analysis of structure, content and statistical properties.'} Select any card or chart to drill down.</p></div>
        {canExplorer ? <Link href={`/profiling/explorer?runId=${encodeURIComponent(run.id)}`} className="text-sm font-bold text-blue-700 hover:text-blue-900">View full profiling report →</Link> : null}
      </div>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 font-black"><FileSearch className="h-5 w-5 text-blue-600" /> Profiling Summary</div>
          <div className="mt-4 grid grid-cols-[1.2fr_0.8fr] gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className={`flex items-center gap-2 text-lg font-black ${runComplete ? 'text-emerald-600' : 'text-amber-600'}`}><CheckCircle2 className="h-6 w-6" /> {run.status}</div><div className="mt-4 text-xs text-slate-500">Completed</div><div className="text-sm font-semibold">{run.completed_at ? new Date(run.completed_at).toLocaleString() : 'In progress'}</div><div className="mt-2 text-xs text-slate-500">Duration</div><div className="text-sm font-semibold">{duration(run.started_at, run.completed_at)}</div></div>
            <dl className="space-y-3 text-sm"><div><dt className="text-xs text-slate-500">{documentMode ? 'Chunks Processed' : 'Rows Processed'}</dt><dd className="text-lg font-black">{compact(run.row_count)}</dd></div><div><dt className="text-xs text-slate-500">{documentMode ? 'Document Fields' : 'Columns Analyzed'}</dt><dd className="text-lg font-black">{compact(run.column_count)}</dd></div><div><dt className="text-xs text-slate-500">Findings</dt><dd className="text-lg font-black">{findings.length}</dd></div></dl>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black"><BarChart3 className="h-5 w-5 text-blue-600" /> {documentMode ? 'Document Statistics' : 'Column Statistics'}</div><span className="text-xs text-slate-400">Null % / Unique %</span></div>
          <div className="mt-5 space-y-3">
            {visibleColumns.slice(0, 6).map((row) => <button key={row.column.id} type="button" onClick={() => setDrilldown({ kind: 'column', columnId: row.column.id })} className="grid w-full grid-cols-[minmax(80px,1fr)_2fr] items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-slate-50">
              <span className="truncate text-xs font-semibold">{row.column.column_name}</span>
              <div className="space-y-1"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-500" style={{ width: `${Math.max(1, Number(rate(row.nullRate) ?? 0) * 100)}%` }} /></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${Math.max(1, Number(rate(row.uniqueRate) ?? 0) * 100)}%` }} /></div></div>
            </button>)}
          </div>
        </Card>

        <Card className="p-5" onClick={() => setDrilldown({ kind: 'duplicates' })}>
          <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black"><Copy className="h-5 w-5 text-blue-600" /> Duplicate Analysis</div><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-600">{percent(duplicateRate)}</span></div>
          <div className="mt-5 divide-y divide-slate-100 text-sm"><div className="flex justify-between py-2"><span className="text-slate-500">Total {documentMode ? 'Chunks' : 'Rows'}</span><strong>{compact(run.row_count)}</strong></div><div className="flex justify-between py-2"><span className="text-slate-500">Duplicate {documentMode ? 'Chunks' : 'Rows'}</span><strong>{compact(duplicateCount)}</strong></div><div className="flex justify-between py-2"><span className="text-slate-500">Duplicate Percentage</span><strong>{percent(duplicateRate)}</strong></div></div>
          <div className="mt-4 flex h-24 items-end gap-10 border-b border-slate-200 px-8"><div className="flex flex-1 flex-col items-center"><div className="w-2/3 bg-blue-500" style={{ height: `${Math.max(12, Math.min(82, uniqueRows > 0 ? 82 : 12))}px` }} /><span className="mt-1 text-[10px] text-slate-500">Unique</span></div><div className="flex flex-1 flex-col items-center"><div className="w-2/3 bg-red-400" style={{ height: `${Math.max(4, Math.min(82, Number(rate(duplicateRate) ?? 0) * 82))}px` }} /><span className="mt-1 text-[10px] text-slate-500">Duplicate</span></div></div>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4"><div className="flex items-center gap-2 font-black"><Database className="h-5 w-5 text-blue-600" /> Schema Overview</div>{canExplorer ? <Link href={`/profiling/explorer?runId=${encodeURIComponent(run.id)}`} className="text-xs font-bold text-blue-700">View all {columns.length} fields →</Link> : null}</div>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-100 text-slate-500"><tr><th className="px-4 py-2">Field Name</th><th className="px-4 py-2">Data Type</th><th className="px-4 py-2">Null %</th><th className="px-4 py-2">Unique %</th></tr></thead><tbody>{visibleColumns.slice(0, 5).map((row) => <tr key={row.column.id} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50" onClick={() => setDrilldown({ kind: 'column', columnId: row.column.id })}><td className="px-4 py-2 font-semibold">{row.column.column_name}</td><td className="px-4 py-2">{row.column.inferred_type ?? row.column.source_type ?? 'unknown'}</td><td className="px-4 py-2">{percent(row.nullRate)}</td><td className="px-4 py-2">{percent(row.uniqueRate)}</td></tr>)}</tbody></table></div>
        </Card>

        <Card className="overflow-hidden" onClick={() => setDrilldown({ kind: 'sensitive' })}>
          <div className="flex items-center justify-between px-5 py-4"><div className="flex items-center gap-2 font-black"><ShieldAlert className="h-5 w-5 text-blue-600" /> Sensitive Data Detection</div><span className={`rounded-full px-2 py-1 text-xs font-bold ${extractionUnavailable ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>{extractionUnavailable ? 'Not assessed' : `${sensitiveColumns.length} detected`}</span></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-100 text-slate-500"><tr><th className="px-4 py-2">Field Name</th><th className="px-4 py-2">Detected Type</th><th className="px-4 py-2">Confidence</th></tr></thead><tbody>{sensitiveColumns.slice(0, 5).map((row) => <tr key={row.column.id} className="border-t border-slate-100"><td className="px-4 py-2 font-semibold">{row.column.column_name}</td><td className="px-4 py-2">{row.sensitiveTypes ?? row.column.semantic_type ?? 'Sensitive pattern'}</td><td className="px-4 py-2">{percent(row.sensitiveRate, 0)}</td></tr>)}{!sensitiveColumns.length ? <tr><td colSpan={3} className="px-4 py-5 text-center text-slate-500">{extractionUnavailable ? 'Readable PDF text was unavailable, so sensitive-data detection is not reported as a false zero. Re-run profiling after readable extraction succeeds.' : 'No sensitive data was detected in the readable governed evidence.'}</td></tr> : null}</tbody></table></div>
        </Card>

        <Card className="overflow-hidden" onClick={() => setDrilldown({ kind: 'outliers' })}>
          <div className="flex items-center justify-between px-5 py-4"><div className="flex items-center gap-2 font-black"><Activity className="h-5 w-5 text-blue-600" /> Outlier Detection</div><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{outlierColumns.length} fields</span></div>
          <div className="divide-y divide-slate-100">{outlierColumns.slice(0, 4).map((row) => { const histogram = distributionsByColumn.get(row.column.id)?.find((item) => item.distribution_type.toUpperCase() === 'HISTOGRAM'); return <div key={row.column.id} className="grid grid-cols-[1fr_auto_120px] items-center gap-3 px-5 py-3 text-xs"><strong className="truncate">{row.column.column_name}</strong><span>{percent(row.outlierRate)}</span><MiniHistogram values={histogramValues(histogram?.distribution)} /></div> })}{!outlierColumns.length ? <div className="px-5 py-6 text-center text-sm text-slate-500">No persisted outlier evidence detected.</div> : null}</div>
        </Card>
      </section>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><div className="flex items-center gap-2 font-black"><Table2 className="h-5 w-5 text-blue-600" /> Sample Data Preview</div><p className="mt-1 text-xs text-slate-500">Readable governed evidence only. Binary PDF glyph streams are never presented as sample text.</p></div><button type="button" onClick={() => setDrilldown({ kind: 'sample' })} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700">View full preview <Eye className="h-4 w-4" /></button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-100 text-slate-500"><tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Readable sample content</th><th className="px-4 py-2">Characters</th></tr></thead><tbody>{samples.slice(0, 7).map((sample) => <tr key={sample.index} className="border-t border-slate-100"><td className="px-4 py-2 font-semibold">{sample.index}</td><td className="max-w-[1000px] truncate px-4 py-2">{sample.content}</td><td className="px-4 py-2">{compact(sample.character_count)}</td></tr>)}{!samples.length ? <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">No readable governed sample evidence was persisted for this source.</td></tr> : null}</tbody></table></div>
      </Card>
    </div>

    {drilldown ? <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Profiling drill-down">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close drill-down" onClick={() => setDrilldown(null)} />
      <aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Profiling drill-down</div><h3 className="mt-1 text-2xl font-black">{drilldown.kind === 'column' ? selectedColumn?.column.column_name ?? 'Field' : drilldown.kind === 'duplicates' ? 'Duplicate Analysis' : drilldown.kind === 'sensitive' ? 'Sensitive Data Detection' : drilldown.kind === 'outliers' ? 'Outlier Detection' : 'Sample Data Preview'}</h3></div><button type="button" onClick={() => setDrilldown(null)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-5 w-5" /></button></div>

        {selectedColumn ? <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Type', selectedColumn.column.inferred_type ?? selectedColumn.column.source_type ?? 'unknown'], ['Null', percent(selectedColumn.nullRate)], ['Unique', percent(selectedColumn.uniqueRate)], ['Rows', compact(selectedColumn.column.total_count)]].map(([name, value]) => <div key={name} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] text-slate-500">{name}</div><div className="mt-1 font-black">{value}</div></div>)}</div>
          <div><h4 className="font-black">Persisted metrics</h4><div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">{selectedColumn.columnMetrics.map((metric) => <div key={metric.metric_key} className="flex items-start justify-between gap-5 px-4 py-3 text-sm"><span className="text-slate-500">{metric.metric_key.replaceAll('_', ' ')}</span><strong className="max-w-[55%] break-all text-right">{metric.numeric_value !== null ? compact(metric.numeric_value) : metric.text_value ?? (metric.boolean_value === null ? JSON.stringify(metric.json_value) : String(metric.boolean_value))}</strong></div>)}</div></div>
          {canExplorer ? <Link href={`/profiling/explorer?runId=${encodeURIComponent(run.id)}&columnId=${encodeURIComponent(selectedColumn.column.id)}`} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Open full field explorer <ArrowRight className="h-4 w-4" /></Link> : null}
        </div> : null}

        {drilldown.kind === 'duplicates' ? <div className="mt-6 space-y-4"><div className="grid grid-cols-3 gap-3">{[['Total', compact(run.row_count)], ['Duplicates', compact(duplicateCount)], ['Duplicate rate', percent(duplicateRate)]].map(([name, value]) => <div key={name} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">{name}</div><div className="mt-1 text-xl font-black">{value}</div></div>)}</div><p className="text-sm leading-6 text-slate-600">This panel uses the persisted dataset-level duplicate metrics from this exact profiling run. It does not infer duplicate evidence from the UI.</p></div> : null}

        {drilldown.kind === 'sensitive' ? <div className="mt-6 space-y-3">{sensitiveColumns.map((row) => <button key={row.column.id} type="button" onClick={() => setDrilldown({ kind: 'column', columnId: row.column.id })} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50"><div><div className="font-black">{row.column.column_name}</div><div className="text-xs text-slate-500">{row.sensitiveTypes ?? row.column.semantic_type ?? row.column.inferred_type ?? 'Sensitive pattern'}</div></div><div className="font-black text-red-600">{percent(row.sensitiveRate)}</div></button>)}{!sensitiveColumns.length ? <p className="text-sm text-slate-500">{extractionUnavailable ? 'Sensitive-data detection is not assessed because this PDF run has no readable text evidence.' : 'No sensitive-data evidence is present in this run.'}</p> : null}</div> : null}

        {drilldown.kind === 'outliers' ? <div className="mt-6 space-y-3">{outlierColumns.map((row) => { const histogram = distributionsByColumn.get(row.column.id)?.find((item) => item.distribution_type.toUpperCase() === 'HISTOGRAM'); return <button key={row.column.id} type="button" onClick={() => setDrilldown({ kind: 'column', columnId: row.column.id })} className="grid w-full grid-cols-[1fr_auto_150px] items-center gap-4 rounded-xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50"><div><div className="font-black">{row.column.column_name}</div><div className="text-xs text-slate-500">{row.column.inferred_type ?? row.column.source_type ?? 'unknown'}</div></div><strong>{percent(row.outlierRate)}</strong><MiniHistogram values={histogramValues(histogram?.distribution)} /></button> })}{!outlierColumns.length ? <p className="text-sm text-slate-500">No persisted outlier evidence is present in this run.</p> : null}</div> : null}

        {drilldown.kind === 'sample' ? <div className="mt-6 space-y-3">{samples.map((sample) => <article key={sample.index} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between text-xs text-slate-500"><span>Sample {sample.index}</span><span>{compact(sample.character_count)} characters</span></div><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">{sample.content}</pre></article>)}{!samples.length ? <p className="text-sm text-slate-500">No readable governed sample evidence was persisted for this source.</p> : null}</div> : null}
      </aside>
    </div> : null}
  </main>
}