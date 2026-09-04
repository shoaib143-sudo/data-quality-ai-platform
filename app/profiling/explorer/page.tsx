import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import ProfilingExplorer from '@/app/profiling/profiling-explorer'

type ExplorerSearchParams = Promise<{
  runId?: string
  columnId?: string
  findingId?: string
}>

export default async function ProfilingExplorerPage({ searchParams }: { searchParams: ExplorerSearchParams }) {
  await requireUser()
  const supabase = await createClient()
  const requested = await searchParams
  const requestedRunId = requested.runId?.trim() || null

  const requestedRun = requestedRunId
    ? await supabase
        .schema('profiling')
        .from('profile_runs')
        .select('id,status')
        .eq('id', requestedRunId)
        .maybeSingle()
    : { data: null, error: null }

  if (requestedRun.error) throw new Error(`Unable to load requested profiling run: ${requestedRun.error.message}`)

  const latestRun = requestedRun.data ?? (await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id,status')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()).data

  if (!latestRun) {
    return <main className="min-h-screen p-8"><div className="mx-auto max-w-5xl rounded-xl border p-8"><h1 className="text-2xl font-semibold">Profiling Explorer</h1><p className="mt-2 text-sm text-muted-foreground">No profiling runs are available.</p></div></main>
  }

  const [{ data: findings }, { data: columns }, { data: metrics }] = await Promise.all([
    supabase.schema('profiling').from('profile_findings').select('id,profile_column_id,finding_type,severity,title,description,confidence').eq('profile_run_id', latestRun.id).order('created_at', { ascending: false }).limit(500),
    supabase.schema('profiling').from('profile_columns').select('id,column_name,source_type,inferred_type').eq('profile_run_id', latestRun.id).order('ordinal_position'),
    supabase.schema('profiling').from('profile_metrics').select('profile_column_id,metric_key,numeric_value,text_value,boolean_value,json_value').eq('profile_run_id', latestRun.id).order('metric_key').limit(2000),
  ])

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Profiling Explorer</h1>
          <p className="mt-2 text-sm text-muted-foreground">Run {latestRun.id} · {latestRun.status}</p>
        </div>
        <ProfilingExplorer
          findings={(findings ?? []) as any}
          columns={(columns ?? []) as any}
          metrics={(metrics ?? []) as any}
          initialColumnId={requested.columnId ?? null}
          initialFindingId={requested.findingId ?? null}
        />
      </div>
    </main>
  )
}
