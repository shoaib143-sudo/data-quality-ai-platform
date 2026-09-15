import Link from 'next/link'
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, FileWarning, Gauge, ShieldAlert, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ColumnMetricsExplorer, type ColumnMetricRow } from './column-metrics-explorer'

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function scorePercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'
  return `${Math.round(value * 100)}%`
}

function statusClass(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === 'SUCCEEDED' || normalized === 'COMPLETED') return 'dn-status-good'
  if (normalized === 'FAILED' || normalized === 'CANCELLED') return 'dn-status-risk'
  return 'dn-status-warn'
}

function scoreClass(value: number | null | undefined) {
  if (value === null || value === undefined) return 'text-slate-400'
  if (value >= 0.9) return 'text-emerald-300'
  if (value >= 0.75) return 'text-cyan-300'
  if (value >= 0.6) return 'text-amber-300'
  return 'text-rose-300'
}

export default async function ProfilingPage() {
  await requireUser()
  const supabase = await createClient()

  const { data: runs } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id,status,engine_name,engine_version,row_count,column_count,started_at,completed_at,summary,error_code,error_message')
    .order('started_at', { ascending: false })
    .limit(10)

  const latestRun = runs?.[0]
  const investigation = latestRun?.summary && typeof latestRun.summary === 'object' && !Array.isArray(latestRun.summary)
    ? (latestRun.summary as Record<string, unknown>).investigation as Record<string, unknown> | null
    : null

  const [{ data: scores }, { data: findings }, { data: profileColumns }, { data: metrics }] = latestRun
    ? await Promise.all([
        supabase.schema('profiling').from('data_quality_scores').select('overall_score,completeness_score,validity_score,uniqueness_score,accuracy_score').eq('profile_run_id', latestRun.id).limit(1),
        supabase.schema('profiling').from('profile_findings').select('id,profile_column_id,finding_type,severity,title,description,confidence,evidence,recommendation,created_at').eq('profile_run_id', latestRun.id).order('created_at', { ascending: false }).limit(50),
        supabase.schema('profiling').from('profile_columns').select('id,column_name,source_type,inferred_type').eq('profile_run_id', latestRun.id).order('column_name'),
        supabase.schema('profiling').from('profile_metrics').select('profile_column_id,metric_key,numeric_value,text_value,boolean_value,json_value').eq('profile_run_id', latestRun.id).order('metric_key').limit(500),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const score = scores?.[0]
  const metricsByColumn = new Map<string, typeof metrics>()
  for (const metric of metrics ?? []) {
    if (!metric.profile_column_id) continue
    const current = metricsByColumn.get(metric.profile_column_id) ?? []
    current.push(metric)
    metricsByColumn.set(metric.profile_column_id, current)
  }

  const columnRows: ColumnMetricRow[] = (profileColumns ?? []).map((column) => {
    const columnMetrics = metricsByColumn.get(column.id) ?? []
    const value = (metricKey: string) => {
      const metric = columnMetrics.find((item) => item.metric_key === metricKey)?.numeric_value
      return metric === null || metric === undefined ? null : Number(metric)
    }
    return {
      id: column.id,
      name: column.column_name,
      type: column.inferred_type ?? column.source_type ?? 'unknown type',
      metricCount: columnMetrics.length,
      nullRate: value('null_rate'),
      distinctRate: value('distinct_rate'),
      uniqueRate: value('unique_rate'),
      sensitiveRate: value('sensitive_match_rate'),
    }
  })

  const severityCounts = (findings ?? []).reduce<Record<string, number>>((counts, finding) => {
    const severity = String(finding.severity ?? 'INFO').toUpperCase()
    counts[severity] = (counts[severity] ?? 0) + 1
    return counts
  }, {})
  const criticalCount = (findings ?? []).filter((finding) => String(finding.severity).toUpperCase() === 'CRITICAL').length
  const priorityCount = (findings ?? []).filter((finding) => ['HIGH', 'CRITICAL'].includes(String(finding.severity).toUpperCase())).length
  const completed = latestRun?.status === 'COMPLETED'

  return (
    <main className="min-h-screen px-4 py-4 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[86rem] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"><ArrowLeft className="h-4 w-4" /> Executive summary</Link>
          <Link href="/datasets" className="dn-control px-3 py-2 text-xs font-semibold text-slate-300 hover:text-cyan-200">Datasets & Connections</Link>
        </div>

        <header className="dn-workspace-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/10 bg-cyan-400/5 px-3 py-1.5 text-xs font-bold text-cyan-300"><Sparkles className="h-3.5 w-3.5" /> Profiling intelligence</div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-50">Turn data into decision confidence</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Profiling provides evidence behind data quality, risk and governance decisions. Incomplete runs stay visible and are never presented as trusted results.</p>
            </div>
            <div className="dn-workspace-inset px-4 py-3 text-right">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Latest outcome</div>
              <span className={`mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${latestRun ? statusClass(latestRun.status) : 'border-slate-700 text-slate-400'}`}>{latestRun?.status ?? 'NO RUN'}</span>
            </div>
          </div>
        </header>

        {latestRun ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ['Rows', latestRun.row_count ?? 0],
                ['Columns', latestRun.column_count ?? 0],
                ['Metrics', metrics?.length ?? 0],
                ['Findings', findings?.length ?? 0],
                ['Started', latestRun.started_at ? new Date(latestRun.started_at).toLocaleString() : 'N/A'],
              ].map(([name, value]) => <div key={name} className="dn-workspace-panel p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{name}</div><div className="mt-1.5 text-xl font-black text-slate-100">{String(value)}</div></div>)}
            </section>

            {latestRun.error_message ? <section className="dn-workspace-panel border-rose-400/20 p-4 text-sm text-rose-200"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>{latestRun.error_code ?? 'Profiling error'}:</strong> {latestRun.error_message}</div></div></section> : null}

            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="dn-workspace-panel p-5">
                <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-emerald-300" /><h2 className="text-lg font-bold">Quality confidence</h2></div><p className="mt-1 text-sm text-slate-500">Deterministic scores from persisted profiling evidence.</p></div><div className={`text-4xl font-black ${scoreClass(score?.overall_score)}`}>{scorePercent(score?.overall_score)}</div></div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {([['Completeness', score?.completeness_score], ['Validity', score?.validity_score], ['Uniqueness', score?.uniqueness_score], ['Accuracy', score?.accuracy_score], ['Overall', score?.overall_score]] as const).map(([name, value]) => <div key={name} className="dn-workspace-inset p-3"><div className="text-xs font-semibold text-slate-500">{name}</div><div className={`mt-1 text-lg font-black ${scoreClass(value)}`}>{scorePercent(value)}</div></div>)}
                </div>
              </div>
              <div className="dn-workspace-panel p-5"><div className="flex items-center gap-2"><FileWarning className="h-5 w-5 text-amber-300" /><h2 className="text-lg font-bold">Governance exposure</h2></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="dn-workspace-inset p-3"><div className="text-xs font-semibold text-slate-500">Critical</div><div className="mt-1 text-2xl font-black text-rose-300">{criticalCount}</div></div><div className="dn-workspace-inset p-3"><div className="text-xs font-semibold text-slate-500">High or critical</div><div className="mt-1 text-2xl font-black text-amber-300">{priorityCount}</div></div></div><p className="mt-3 text-sm leading-6 text-slate-400">{completed ? 'These findings are persisted evidence from the completed run.' : 'The run is not complete. Findings and scores must not be treated as final until the run completes.'}</p></div>
            </section>

            {investigation ? <section className="dn-workspace-panel p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet-300/15 bg-violet-400/10 text-violet-300"><Sparkles className="h-4 w-4" /></div><div><h2 className="text-lg font-bold">Governance insight</h2><p className="mt-1 text-sm text-slate-500">Evidence-first interpretation of the persisted profile.</p></div></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{[['Business issue', investigation.business_issue], ['Business impact', investigation.business_impact], ['Technical evidence', investigation.technical_summary], ['Confidence', scorePercent(Number(investigation.confidence ?? 0))]].map(([name, value]) => <div key={String(name)} className="dn-workspace-inset p-4"><div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{String(name)}</div><p className="mt-2 text-sm leading-6 text-slate-300">{String(value ?? 'N/A')}</p></div>)}</div></section> : null}

            <section className="dn-workspace-panel p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-300" /><h2 className="text-lg font-bold">Findings and priority actions</h2></div><p className="mt-1 text-sm text-slate-500">Observed issues ready for governance or remediation.</p></div><div className="flex flex-wrap gap-2 text-xs">{Object.entries(severityCounts).map(([severity, count]) => <span key={severity} className="dn-control px-2.5 py-1 font-semibold text-slate-300">{severity}: {count}</span>)}</div></div>{findings?.length ? <div className="mt-4 space-y-2">{findings.map((finding) => <article key={finding.id} className="dn-workspace-inset p-4 transition hover:border-cyan-300/25"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-100">{finding.title}</h3><div className="mt-1 text-xs font-medium text-slate-500">{finding.severity} · {label(finding.finding_type)} · confidence {scorePercent(finding.confidence)}</div></div>{finding.created_at ? <time className="text-xs text-slate-500">{new Date(finding.created_at).toLocaleString()}</time> : null}</div><p className="mt-2 text-sm leading-6 text-slate-300">{finding.description}</p>{finding.recommendation ? <div className="mt-3 rounded-lg border border-cyan-300/10 bg-cyan-400/5 p-3 text-sm text-slate-300"><span className="font-bold text-cyan-200">Recommended action:</span>{' '}{typeof finding.recommendation === 'object' && finding.recommendation !== null ? Object.entries(finding.recommendation).map(([key, value]) => `${label(key)}: ${String(value)}`).join(' · ') : String(finding.recommendation)}</div> : null}</article>)}</div> : <div className="mt-4 rounded-lg border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-emerald-200"><CheckCircle2 className="mr-2 inline h-4 w-4" /> No findings were generated for this run.</div>}</section>

            <section className="dn-workspace-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-300" /><h2 className="text-lg font-bold">Column metrics</h2></div><p className="mt-1 text-sm text-slate-500">Aligned, sortable and filterable persisted evidence for this run.</p></div>
                <span className="dn-control px-3 py-1.5 text-xs font-semibold text-slate-400">{columnRows.length} columns</span>
              </div>
              {columnRows.length ? <ColumnMetricsExplorer rows={columnRows} /> : <p className="mt-4 text-sm text-slate-500">No profiled columns are available.</p>}
            </section>
          </>
        ) : (
          <section className="dn-workspace-panel p-10 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-400/5 text-cyan-300"><Activity className="h-6 w-6" /></div><h2 className="mt-4 text-xl font-bold">No profiling evidence yet</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Connect a ready source, register a dataset and run profiling. Until evidence exists, the platform will not present derived profiling results as trusted.</p><Link href="/datasets" className="mt-4 inline-flex rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/15">Go to Datasets & Connections</Link></section>
        )}
      </div>
    </main>
  )
}
