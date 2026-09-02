import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

export default async function ProfilingPage() {
  await requireUser()

  const supabase = await createClient()

  const { data: runs } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id,status,engine_name,row_count,column_count,started_at,completed_at')
    .order('started_at', { ascending: false })
    .limit(10)

  const latestRun = runs?.[0]

  const { data: scores } = latestRun
    ? await supabase
        .schema('profiling')
        .from('data_quality_scores')
        .select('overall_score,completeness_score,validity_score,uniqueness_score,accuracy_score')
        .eq('profile_run_id', latestRun.id)
        .limit(1)
    : { data: [] }

  const { data: findings } = latestRun
    ? await supabase
        .schema('profiling')
        .from('profile_findings')
        .select('finding_type,severity,title,description')
        .eq('profile_run_id', latestRun.id)
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: [] }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/dashboard" className="text-sm underline">← Back to dashboard</Link>

        <div>
          <h1 className="text-3xl font-semibold">Profiling Workspace</h1>
          <p className="mt-2 text-muted-foreground">
            Automated profiling, data quality scoring, and governance findings.
          </p>
        </div>

        <section className="rounded-xl border p-6">
          <h2 className="font-semibold">Latest Profile Run</h2>
          {latestRun ? (
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div>Status: {latestRun.status}</div>
              <div>Rows: {latestRun.row_count ?? 0}</div>
              <div>Columns: {latestRun.column_count ?? 0}</div>
              <div>Engine: {latestRun.engine_name ?? 'N/A'}</div>
            </div>
          ) : (
            <p className="mt-4 text-muted-foreground">No profile runs available.</p>
          )}
        </section>

        <section className="rounded-xl border p-6">
          <h2 className="font-semibold">Quality Score</h2>
          {scores?.[0] ? (
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              {Object.entries(scores[0]).map(([key, value]) => (
                <div key={key}>{key}: {String(value ?? 0)}</div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-muted-foreground">No quality score available.</p>
          )}
        </section>

        <section className="rounded-xl border p-6">
          <h2 className="font-semibold">Governance Findings</h2>
          {findings?.length ? (
            <div className="mt-4 space-y-3">
              {findings.map((finding, index) => (
                <div key={index} className="rounded border p-3">
                  <div className="font-medium">{finding.title}</div>
                  <div className="text-sm">{finding.severity} · {finding.finding_type}</div>
                  <div className="text-sm text-muted-foreground">{finding.description}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-muted-foreground">No findings available.</p>
          )}
        </section>
      </div>
    </main>
  )
}
