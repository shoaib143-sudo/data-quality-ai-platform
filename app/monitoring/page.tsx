import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { authorizeProject } from '@/lib/auth/authorize'
import { readExecution, readExecutionRoots } from '@/lib/monitoring/execution-read-model'
import { LivingJobMonitor } from './living-job-monitor'

export default async function MonitoringPage({searchParams}: {searchParams: Promise<{run?: string; branch?: string; project?: string}>}) {
  const user = await requireUser()
  const query = await searchParams
  const db = await createClient()
  const projectsResult = await db.schema('catalog').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error('Unable to load monitoring projects')
  const checked = await Promise.all((projectsResult.data ?? []).map(async project => {
    try { await authorizeProject(user.id, project.id, 'agent.execute'); return project }
    catch { return null }
  }))
  const projects = checked.filter((p): p is {id: string; name: string} => p !== null)
  let initialSnapshot = null
  let initialError: string | null = null
  if (query.run) {
    try { initialSnapshot = await readExecution(user.id, query.run) }
    catch { initialError = 'The requested execution is unavailable or its hierarchy is incomplete.' }
  }
  const projectId = initialSnapshot?.runs[0]?.project_id ?? projects.find(p => p.id === query.project)?.id ?? projects[0]?.id
  const roots = projectId ? await readExecutionRoots(user.id, projectId) : {runs: [], nextOffset: null}
  return <main className="min-h-screen p-4 sm:p-8"><div className="mx-auto max-w-[1600px] space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><Link href="/dashboard">← Dashboard</Link><h1 className="mt-3 text-3xl font-bold">Job Monitor</h1></div><nav className="flex gap-4"><Link href="/recovery">Execution Recovery</Link><Link href="/agents">Run an agent</Link></nav></header>
    <LivingJobMonitor initialRuns={roots.runs} initialRunId={query.run} initialBranchId={query.branch ?? query.run}
      initialSnapshot={initialSnapshot} initialError={initialError} initialProjectId={projectId} projects={projects}
      initialAgents={[]} initialDatasets={[]} treeEnabled={process.env.JOB_MONITOR_TREE_ENABLED !== 'false'}/>
  </div></main>
}
