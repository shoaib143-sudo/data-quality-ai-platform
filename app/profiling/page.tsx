import Link from 'next/link'
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, FileWarning, Gauge, ShieldAlert, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function scorePercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'
  return `${Math.round(value * 100)}%`
}

function statusClass(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === 'SUCCEEDED' || normalized === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (normalized === 'FAILED' || normalized === 'CANCELLED') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function scoreClass(value: number | null | undefined) {
  if (value === null || value === undefined) return 'text-slate-400'
  if (value >= 0.9) return 'text-emerald-600'
  if (value >= 0.75) return 'text-blue-600'
  if (value >= 0.6) return 'text-amber-600'
  return 'text-red-600'
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
    ? (latestRun.summary as Record<string, unknown>).investigation as Record<string, any> | null
    : null

  const [{ data: scores }, { data: findings }, { data: profileColumns }, { data: metrics }] = latestRun
    ? await Promise.all([
        supabase.schema('profiling').from('data_quality_scores').select('overall_score,completeness_score,validity_score,uniqueness_score,accuracy_score').eq('profile_run_id', latestRun.id).limit(1),
        supabase.schema('profiling').from('profile_findings').select('id,profile_column_id,finding_type,severity,title,description,confidence,evidence,recommendation,created_at').eq('profile_run_id', latestRun.id).order('created_at', { ascending: false }).limit(50),
        supabase.schema('profiling').from('profile_columns').select('id,column_name,data_type').eq('profile_run_id', latestRun.id).order('column_name'),
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

  const severityCounts = (findings ?? []).reduce<Record<string, number>>((counts, finding) => {
    const severity = String(finding.severity ?? 'INFO').toUpperCase()
    counts[severity] = (counts[severity] ?? 0) + 1
    return counts
  }, {})
  const criticalCount = (findings ?? []).filter((finding) => String(finding.severity).toUpperCase() === 'CRITICAL').length
  const priorityCount = (findings ?? []).filter((finding) => ['HIGH', 'CRITICAL'].includes(String(finding.severity).toUpperCase())).length
  const completed = latestRun.status === 'COMPLETED'

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,_rgba(219,234,254,0.9),_transparent_30%),radial-gradient(circle_at_95%_5%,_rgba(243,232,255,0.8),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_55%,_#f8fafc_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800"><ArrowLeft className="h-4 w-4" /> Executive summary</Link>
        <header className="rounded-3xl border border-blue-100 bg-white/95 p-7 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><Sparkles className="h-3.5 w-3.5" /> Profiling intelligence</div>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Turn data into decision confidence</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Profiling provides the evidence behind data quality, risks and governance decisions. Incomplete runs stay visible as incomplete and are never presented as trusted results.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-right"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Latest outcome</div><div className="mt-1 flex items-center justify-end gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${latestRun ? statusClass(latestRun.status) : 'border-slate-200 bg-white text-slate-500'}`}>{latestRun?.status ?? 'NO RUN'}</span></div></div>
          </div>
        </header>

        {latestRun ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ['Rows', latestRun.row_count ?? 0],
                ['Columns', latestRun.column_count ?? 0],
                ['Metrics', metrics?.length ?? 0],
                ['Findings', findings?.length ?? 0],
                ['Started', latestRun.started_at ? new Date(latestRun.started_at).toLocaleString() : 'N/A'],
              ].map(([name, value]) => <div key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{name}</div><div className="mt-2 text-xl font-black text-slate-900">{String(value)}</div></div>)}
            </section>

            {latestRun.error_message ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 shadow-sm"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>{latestRun.error_code ?? 'Profiling error'}:</strong> {latestRun.error_message}</div></div></section> : null}

            <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-7">
                <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-emerald-600" /><h2 className="text-xl font-bold">Quality confidence</h2></div><p className="mt-1 text-sm text-slate-500">Deterministic scores calculated from persisted profiling evidence.</p></div><div className={`text-4xl font-black ${scoreClass(score?.overall_score)}`}>{scorePercent(score?.overall_score)}</div></div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {([['Completeness', score?.completeness_score], ['Validity', score?.validity_score], ['Uniqueness', score?.uniqueness_score], ['Accuracy', score?.accuracy_score], ['Overall', score?.overall_score]] as const).map(([name, value]) => <div key={name} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold text-slate-500">{name}</div><div className={`mt-1 text-xl font-black ${scoreClass(value)}`}>{scorePercent(value)}</div></div>)}
                </div>
              </div>
              <div className="rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm sm:p-7"><div className="flex items-center gap-2"><FileWarning className="h-5 w-5 text-amber-600" /><h2 className="text-xl font-bold">Governance exposure</h2></div><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-red-100 bg-white p-4"><div className="text-xs font-semibold text-slate-500">Critical</div><div className="mt-1 text-3xl font-black text-red-600">{criticalCount}</div></div><div className="rounded-2xl border border-amber-100 bg-white p-4"><div className="text-xs font-semibold text-slate-500">High or critical</div><div className="mt-1 text-3xl font-black text-amber-600">{priorityCount}</div></div></div><p className="mt-4 text-sm leading-6 text-slate-600">{completed ? 'These findings are persisted evidence from the completed run.' : 'The run is not complete. Findings and scores must not be treated as final until the run completes.'}</p></div>
            </section>

            {investigation ? <section className="rounded-3xl border border-purple-100 bg-white p-6 shadow-sm sm:p-7"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600"><Sparkles className="h-5 w-5" /></div><div><h2 className="text-xl font-bold">Governance insight</h2><p className="mt-1 text-sm text-slate-500">Evidence first interpretation of the persisted profile.</p></div></div><div className="mt-6 grid gap-4 lg:grid-cols-2">{[['Business issue', investigation.business_issue], ['Business impact', investigation.business_impact], ['Technical evidence', investigation.technical_summary], ['Confidence', scorePercent(Number(investigation.confidence ?? 0))]].map(([name, value]) => <div key={String(name)} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">{String(name)}</div><p className="mt-2 text-sm leading-6 text-slate-700">{String(value ?? 'N/A')}</p></div>)}</div></section> : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h2 className="text-xl font-bold">Findings and priority actions</h2></div><p className="mt-1 text-sm text-slate-500">Observed issues that can be acted on through governance and remediation.</p></div><div className="flex flex-wrap gap-2 text-xs">{Object.entries(severityCounts).map(([severity, count]) => <span key={severity} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-600">{severity}: {count}</span>)}</div></div>{findings?.length ? <div className="mt-5 space-y-3">{findings.map((finding) => <article key={finding.id} className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-200 hover:shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{finding.title}</h3><div className="mt-1 text-xs font-medium text-slate-500">{finding.severity} · {label(finding.finding_type)} · confidence {scorePercent(finding.confidence)}</div></div>{finding.created_at ? <time className="text-xs text-slate-400">{new Date(finding.created_at).toLocaleString()}</time> : null}</div><p className="mt-3 text-sm leading-6 text-slate-600">{finding.description}</p>{finding.recommendation ? <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-slate-700"><span className="font-bold">Recommended action:</span>{' '}{typeof finding.recommendation === 'object' && finding.recommendation !== null ? Object.entries(finding.recommendation).map(([key, value]) => `${label(key)}: ${String(value)}`).join(' · ') : String(finding.recommendation)}</div> : null}</article>)}</div> : <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" /> No findings were generated for this run.</div>}</section>

            <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-7"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600" /><h2 className="text-xl font-bold">Column metrics</h2></div><p className="mt-1 text-sm text-slate-500">Persisted evidence behind this profiling run.</p>{profileColumns?.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{profileColumns.map((column) => { const columnMetrics = metricsByColumn.get(column.id) ?? []; const nullRate = columnMetrics.find((metric) => metric.metric_key === 'null_rate')?.numeric_value; const distinctRate = columnMetrics.find((metric) => metric.metric_key === 'distinct_rate')?.numeric_value; const uniqueRate = columnMetrics.find((metric) => metric.metric_key === 'unique_rate')?.numeric_value; const sensitiveRate = columnMetrics.find((metric) => metric.metric_key === 'sensitive_match_rate')?.numeric_value; return <div key={column.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{column.column_name}</div><div className="text-xs text-slate-500">{column.data_type ?? 'unknown type'}</div></div><span className="text-xs font-semibold text-slate-400">{columnMetrics.length} metrics</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[['Null', nullRate], ['Distinct', distinctRate], ['Unique', uniqueRate], ['Sensitive', sensitiveRate]].map(([name, value]) => <div key={String(name)}><span className="text-slate-500">{String(name)}</span><br /><strong>{scorePercent(value as number | null | undefined)}</strong></div>)}</div></div> })}</div> : <p className="mt-5 text-sm text-slate-500">No profiled columns are available.</p>}</section>
          </>
        ) : (
          <section className="rounded-3xl border border-blue-100 bg-white p-10 text-center shadow-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Activity className="h-7 w-7" /></div><h2 className="mt-5 text-xl font-bold">No profiling evidence yet</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Connect a ready source, register a dataset and run profiling. Until evidence exists, the platform will not manufacture a score or risk result.</p><Link href="/datasets" className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700">Go to datasets</Link></section>
        )}
      </div>
    </main>
  )
}
