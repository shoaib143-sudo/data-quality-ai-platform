import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { ResourceAccessManager } from './resource-access-manager'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function ResourceAccessPage() {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const canApprovals = canAccessWorkspaceHref(landing.persona, '/approvals', landing.organizationRole)
  const canMonitoring = canAccessWorkspaceHref(landing.persona, '/monitoring', landing.organizationRole)
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Resource Access" contextLabel="Dataset authorization policy" homeHref="/home" />
        <header className="rounded-3xl border bg-white p-7 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Governed resource authorization</p>
              <h1 className="mt-1 text-3xl font-black">Dataset access control</h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
                Manage explicit dataset ALLOW and DENY rules only for projects where you currently hold administrator authority. Server-side authorization remains authoritative and DENY precedence is never weakened.
              </p>
            </div>
            <div className="flex gap-2">{canApprovals ? <Link href="/approvals" className="rounded-xl border px-4 py-2 text-sm font-semibold">Approvals</Link> : null}{canMonitoring ? <Link href="/monitoring" className="rounded-xl border px-4 py-2 text-sm font-semibold">Job Monitor</Link> : null}</div>
          </div>
        </header>
        <ResourceAccessManager />
      </div>
    </main>
  )
}