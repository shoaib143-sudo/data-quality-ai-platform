import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { loadApprovalInbox } from '@/lib/governance/approval-inbox'
import { loadApprovalCoverageWorkspace } from '@/lib/governance/approval-coverage-service'
import { ApprovalInbox } from './approval-inbox'
import { ApprovalCoveragePanel } from './approval-coverage-panel'
import { DelegationManager } from './delegation-manager'
import { DelegationAdminManager } from './delegation-admin-manager'
import { DirectAuthorityAdminManager } from './direct-authority-admin-manager'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'

export default async function ApprovalsPage() {
  const user = await requireUser()
  const [items, coverage, landing] = await Promise.all([
    loadApprovalInbox(user.id),
    loadApprovalCoverageWorkspace(user.id),
    resolveLandingAccess(user.id),
  ])
  const canAgents = canAccessWorkspace(landing.persona, 'agents', landing.organizationRole)
  const canMonitoring = canAccessWorkspace(landing.persona, 'monitoring', landing.organizationRole)

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen p-6 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Approvals" contextLabel="Governed decisions and execution" homeHref="/home" />
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-cyan-500">Governed execution</p>
            <h1 className="mt-1 text-3xl font-bold">Approvals</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Review your execution requests and domain-scoped approval decisions. Every approval or rejection requires a comment.
            </p>
          </div>
          <div className="flex gap-2">
            {canAgents ? <Link href="/agents" className="rounded-xl border px-4 py-2 text-sm font-semibold">Agents</Link> : null}
            {canMonitoring ? <Link href="/monitoring" className="rounded-xl border px-4 py-2 text-sm font-semibold">Job Monitor</Link> : null}
          </div>
        </header>
        <ApprovalInbox items={items} />
        <ApprovalCoveragePanel scopes={coverage.scopes} managedProjectCount={coverage.managedProjectCount} />
        <DelegationManager />
        <DirectAuthorityAdminManager />
        <DelegationAdminManager />
      </div>
    </main>
  )
}