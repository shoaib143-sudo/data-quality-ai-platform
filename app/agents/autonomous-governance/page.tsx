import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { AutonomyConsole } from './autonomy-console'
import { OrchestratorApprovalInbox } from './orchestrator-approval-inbox'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function AutonomousGovernancePage({ searchParams }: { searchParams?: Promise<{ projectId?: string }> }) {
  const user = await requireUser()
  const initialProjectId = (await searchParams)?.projectId ?? ''
  const landing = await resolveLandingAccess(user.id)
  const canAgents = canAccessWorkspaceHref(landing.persona, '/agents', landing.organizationRole)
  const canMonitoring = canAccessWorkspaceHref(landing.persona, '/monitoring', landing.organizationRole)
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
    <main id="main-content" tabIndex={-1} className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Autonomous Governance" contextLabel="Governed orchestrator controls" homeHref="/home" />
        {(canAgents || canMonitoring) ? <div className="flex flex-wrap items-center justify-between gap-3">
          {canAgents ? <Link href="/agents" className="text-sm underline underline-offset-4">← Back to AI Agents</Link> : <span />}
          {canMonitoring ? <Link href="/monitoring" className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Open Job Monitor</Link> : null}
        </div> : null}
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
          initialProjectId={initialProjectId}
        />
        <OrchestratorApprovalInbox projects={visibleProjects} />
      </div>
    </main>
  )
}
