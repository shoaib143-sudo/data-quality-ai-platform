import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { AutonomyConsole } from './autonomy-console'
import { OrchestratorApprovalInbox } from './orchestrator-approval-inbox'

export default async function AutonomousGovernancePage() {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (error) throw new Error(`Unable to load projects: ${error.message}`)
  const projects = (data ?? []).map(row => ({ id: String(row.id), name: String(row.name) }))
  const [viewable, executable, manageable, certifiable] = await Promise.all([
    Promise.all(projects.map(async project => (await hasProjectCapability(user.id, project.id, 'agent.view')) ? project.id : null)),
    Promise.all(projects.map(async project => (await hasProjectCapability(user.id, project.id, 'agent.execute')) ? project.id : null)),
    Promise.all(projects.map(async project => (await hasProjectCapability(user.id, project.id, 'admin.manage')) ? project.id : null)),
    Promise.all(projects.map(async project => (await hasProjectCapability(user.id, project.id, 'certification.review')) ? project.id : null)),
  ])
  const viewableIds = new Set(viewable.filter((id): id is string => Boolean(id)))
  const visibleProjects = projects.filter(project => viewableIds.has(project.id))
  return (
    <main className="min-h-screen p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/agents" className="text-sm underline underline-offset-4">← Back to AI Agents</Link>
          <Link href="/monitoring" className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Open Job Monitor</Link>
        </div>
        <header className="dn-workspace-panel rounded-xl border p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">DataNexus Governance Orchestrator</p>
          <h1 className="mt-2 text-2xl font-semibold">Autonomous Governance</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Configure governed autonomy per project, execute the orchestrator through the existing native supervisor, and inspect the canonical 75-capability evidence ledger. Full Autonomous is bounded by deterministic policy and independent certification authority.
          </p>
        </header>
        <AutonomyConsole
          projects={visibleProjects}
          executableProjectIds={executable.filter((id): id is string => Boolean(id))}
          manageableProjectIds={manageable.filter((id): id is string => Boolean(id))}
          certifiableProjectIds={certifiable.filter((id): id is string => Boolean(id))}
        />
        <OrchestratorApprovalInbox projects={visibleProjects} />
      </div>
    </main>
  )
}
