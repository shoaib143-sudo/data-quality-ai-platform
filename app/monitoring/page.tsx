import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProject } from '@/lib/auth/authorize'
import { versionSnapshot } from '@/lib/monitoring/execution-contract'
import { readExecution, readExecutionRoots } from '@/lib/monitoring/execution-read-model'
import { LivingJobMonitor } from './living-job-monitor'

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; branch?: string; project?: string }>
}) {
  const user = await requireUser()
  const query = await searchParams
  const db = createAdminClient()

  const projectsResult = await db.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error('Unable to load monitoring projects')

  const checked = await Promise.all((projectsResult.data ?? []).map(async project => {
    try {
      await authorizeProject(user.id, project.id, 'observability.read')
      return project
    } catch {
      return null
    }
  }))
  const projects = checked.filter((project): project is { id: string; name: string } => project !== null)

  let initialSnapshot = null
  let initialError: string | null = null
  if (query.run) {
    try {
      initialSnapshot = versionSnapshot(await readExecution(user.id, query.run))
    } catch {
      initialError = 'The requested execution is unavailable or its hierarchy is incomplete.'
    }
  }

  const projectId = initialSnapshot?.runs[0]?.project_id
    ?? projects.find(project => project.id === query.project)?.id
    ?? projects[0]?.id

  const roots = projectId
    ? await readExecutionRoots(user.id, projectId)
    : { runs: [], nextOffset: null }

  return <main className="min-h-screen bg-[#030b14] p-0 sm:p-3">
    <div className="mx-auto max-w-[1780px]">
      <LivingJobMonitor
        initialRuns={roots.runs}
        initialRunId={query.run}
        initialBranchId={query.branch ?? query.run}
        initialSnapshot={initialSnapshot}
        initialError={initialError}
        initialProjectId={projectId}
        projects={projects}
        initialAgents={[]}
        initialDatasets={[]}
        treeEnabled={process.env.JOB_MONITOR_TREE_ENABLED !== 'false'}
      />
    </div>
  </main>
}
