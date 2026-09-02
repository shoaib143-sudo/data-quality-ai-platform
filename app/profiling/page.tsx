import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function scorePercent(value: number | null | undefined) {
  if (value === null || value === undefined) return 'N/A'
  return `${Math.round(value * 100)}%`
}

function statusClass(status: string) {
  if (status === 'SUCCEEDED' || status === 'COMPLETED') return 'border-green-500/40 bg-green-500/10 text-green-700'
  if (status === 'FAILED' || status === 'CANCELLED') return 'border-red-500/40 bg-red-500/10 text-red-700'
  return 'border-amber-500/40 bg-amber-500/10 text-amber-700'
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
    ? (latestRun.summary as Record<string, any>).investigation
    : null

  const [{ data: scores }, { data: findings }, { data: profileColumns }, { data: metrics }] = latestRun
    ? await Promise.all([
        supabase
          .schema('profiling')
          .from('data_quality_scores')
          .select('overall_score,completeness_score,validity_score,uniqueness_score,accuracy_score')
          .eq('profile_run_id', latestRun.id)
          .limit(1),
        supabase
          .schema('profiling')
          .from('profile_findings')
          .select('id,profile_column_id,finding_type,severity,title,description,confidence,evidence,recommendation,created_at')
          .eq('profile_run_id', latestRun.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .schema('profiling')
          .from('profile_columns')
          .select('id,column_name,data_type')
          .eq('profile_run_id', latestRun.id)
          .order('column_name'),
        supabase
          .schema('profiling')
          .from('profile_metrics')
          .select('profile_column_id,metric_key,numeric_value,text_value,boolean_value,json_value')
          .eq('profile_run_id', latestRun.id)
          .order('metric_key')
          .limit(500),
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
    const severity = finding.severity ?? 'INFO'
    counts[severity] = (counts[severity] ?? 0) + 1
    return counts
  }, {})

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href="/dashboard" className="text-sm underline">← Back to dashboard</Link>

        <header>
          <h1 className="text-3xl font-semibold">Profiling Workspace</h1>
          <p className="mt-2 text-muted-foreground">
            Understand what was measured, what changed, why it matters, and what should happen next.
          </p>
        </header>

        {latestRun ? (
          <>
            <section className="rounded-xl border p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Latest Profile Run</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Run {latestRun.id} · {latestRun.engine_name ?? 'N/A'} {latestRun.engine_version ?? ''}
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass(latestRun.status)}`}>
                  {latestRun.status}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['Rows', latestRun.row_count ?? 0],
                  ['Columns', latestRun.column_count ?? 0],
                  ['Metrics', metrics?.length ?? 0],
                  ['Findings', findings?.length ?? 0],
                  ['Started', latestRun.started_at ? new Date(latestRun.started_at).toLocaleString() : 'N/A'],
                ].map(([name, value]) => (
                  <div key={name} className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">{name}</div>
                    <div className="mt-1 font-semibold">{String(value)}</div>
                  </div>
                ))}
              </div>

              {latestRun.error_message ? (
                <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm">
                  <strong>{latestRun.error_code ?? 'Execution error'}:</strong> {latestRun.error_message}
                </div>
              ) : null}
            </section>

            <section className="rounded-xl border p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Quality Score</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Deterministic score derived from persisted profiling metrics.</p>
                </div>
                <div className="text-3xl font-bold">{scorePercent(score?.overall_score)}</div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['Completeness', score?.completeness_score],
                  ['Validity', score?.validity_score],
                  ['Uniqueness', score?.uniqueness_score],
                  ['Accuracy', score?.accuracy_score],
                  ['Overall', score?.overall_score],
                ].map(([name, value]) => (
                  <div key={name} className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">{name}</div>
                    <div className="mt-1 text-xl font-semibold">{scorePercent(value as number | null | undefined)}</div>
                  </div>
                ))}
              </div>
            </section>

            {investigation ? (
              <section className="rounded-xl border p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">AI Investigation</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Evidence-first interpretation of the persisted profile. No production change is executed here.
                    </p>
                  </div>
                  <span className="rounded-full border px-3 py-1 text-xs font-medium">
                    Risk: {String(investigation.risk ?? 'UNKNOWN')}
                  </span>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Technical issue</div>
                    <p className="mt-2 text-sm">{String(investigation.technical_summary ?? 'N/A')}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Business issue</div>
                    <p className="mt-2 text-sm">{String(investigation.business_issue ?? 'N/A')}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Business impact</div>
                    <p className="mt-2 text-sm">{String(investigation.business_impact ?? 'N/A')}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Confidence</div>
                    <p className="mt-2 text-sm">{scorePercent(Number(investigation.confidence ?? 0))}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">Probable root causes</div>
                  <div className="mt-3 space-y-2">
                    {(investigation.probable_root_causes ?? []).map((cause: any, index: number) => (
                      <div key={`${String(cause.cause)}-${index}`} className="rounded-md bg-muted/40 p-3 text-sm">
                        <strong>{label(String(cause.cause ?? 'unknown'))}</strong>
                        {cause.rationale ? <p className="mt-1 text-muted-foreground">{String(cause.rationale)}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">Recommended actions</div>
                  <div className="mt-3 space-y-2">
                    {(investigation.recommendations ?? []).map((recommendation: any, index: number) => (
                      <div key={`${String(recommendation.action)}-${index}`} className="rounded-md bg-muted/40 p-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                          <strong>{label(String(recommendation.action ?? 'review'))}</strong>
                          <span className="rounded-full border px-2 py-0.5 text-xs">{String(recommendation.priority ?? 'UNKNOWN')}</span>
                          {recommendation.approval_required ? <span className="rounded-full border px-2 py-0.5 text-xs">Approval required</span> : null}
                        </div>
                        {recommendation.rationale ? <p className="mt-1 text-muted-foreground">{String(recommendation.rationale)}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Governance Findings</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Issues detected from the observed dataset values.</p>
                </div>
                <div className="flex gap-2 text-xs">
                  {Object.entries(severityCounts).map(([severity, count]) => (
                    <span key={severity} className="rounded-full border px-2 py-1">{severity}: {count}</span>
                  ))}
                </div>
              </div>

              {findings?.length ? (
                <div className="mt-5 space-y-3">
                  {findings.map((finding) => (
                    <article key={finding.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium">{finding.title}</h3>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {finding.severity} · {label(finding.finding_type)} · confidence {scorePercent(finding.confidence)}
                          </div>
                        </div>
                        {finding.created_at ? <time className="text-xs text-muted-foreground">{new Date(finding.created_at).toLocaleString()}</time> : null}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{finding.description}</p>
                      {finding.recommendation ? (
                        <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                          <span className="font-medium">Recommended action:</span>{' '}
                          {typeof finding.recommendation === 'object' && finding.recommendation !== null
                            ? Object.entries(finding.recommendation).map(([key, value]) => `${label(key)}: ${String(value)}`).join(' · ')
                            : String(finding.recommendation)}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">No findings were generated for this run.</p>
              )}
            </section>

            <section className="rounded-xl border p-6">
              <div>
                <h2 className="font-semibold">Column Metrics Explorer</h2>
                <p className="mt-1 text-sm text-muted-foreground">Persisted metrics behind the run and its findings.</p>
              </div>
              {profileColumns?.length ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {profileColumns.map((column) => {
                    const columnMetrics = metricsByColumn.get(column.id) ?? []
                    const nullRate = columnMetrics.find((metric) => metric.metric_key === 'null_rate')?.numeric_value
                    const distinctRate = columnMetrics.find((metric) => metric.metric_key === 'distinct_rate')?.numeric_value
                    const uniqueRate = columnMetrics.find((metric) => metric.metric_key === 'unique_rate')?.numeric_value
                    const sensitiveRate = columnMetrics.find((metric) => metric.metric_key === 'sensitive_match_rate')?.numeric_value
                    return (
                      <div key={column.id} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{column.column_name}</div>
                            <div className="text-xs text-muted-foreground">{column.data_type ?? 'unknown type'}</div>
                          </div>
                          <span className="text-xs text-muted-foreground">{columnMetrics.length} metrics</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                          <div><span className="text-muted-foreground">Null</span><br />{scorePercent(nullRate)}</div>
                          <div><span className="text-muted-foreground">Distinct</span><br />{scorePercent(distinctRate)}</div>
                          <div><span className="text-muted-foreground">Unique</span><br />{scorePercent(uniqueRate)}</div>
                          <div><span className="text-muted-foreground">Sensitive</span><br />{scorePercent(sensitiveRate)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">No profiled columns are available.</p>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-xl border p-8 text-center">
            <h2 className="font-semibold">No profile runs available</h2>
            <p className="mt-2 text-sm text-muted-foreground">Register a dataset and start Profiling Agent 2.0 to populate this workspace.</p>
            <Link href="/datasets" className="mt-4 inline-block underline">Go to datasets</Link>
          </section>
        )}
      </div>
    </main>
  )
}
