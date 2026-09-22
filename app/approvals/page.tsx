import Link from 'next/link'
import { ArrowRight, CheckCircle2, ClipboardCheck, Layers3, ShieldCheck } from 'lucide-react'
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
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#050b17] p-5 text-slate-100 sm:p-8">
      <div className="mx-auto max-w-[1480px] space-y-5">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Approvals" contextLabel="Governed decisions and execution" homeHref="/home" />
        <header className="relative overflow-hidden rounded-[28px] border border-cyan-300/12 bg-[#09192d] p-6 shadow-[0_24px_70px_rgba(0,0,0,.26)] sm:p-7">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-500/[0.07] blur-3xl"/>
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px] xl:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/15 bg-amber-300/[0.05] px-3 py-1.5 text-xs font-black text-amber-200"><ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true"/>Governed execution</div>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">Approvals</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">Decide with evidence, scope and accountability. Review your execution requests and domain-scoped approval decisions. Every approval or rejection requires a comment.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {canAgents ? <Link href="/agents" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-bold text-slate-200 hover:border-cyan-300/25">Agents <ArrowRight className="h-4 w-4" aria-hidden="true"/></Link> : null}
                {canMonitoring ? <Link href="/monitoring" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] px-4 py-2.5 text-sm font-bold text-cyan-200 hover:border-cyan-300/30">Job Monitor <ArrowRight className="h-4 w-4" aria-hidden="true"/></Link> : null}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-amber-300/12 bg-[#061321] p-3"><ClipboardCheck className="h-4 w-4 text-amber-300" aria-hidden="true"/><p className="mt-2 text-2xl font-black text-white">{items.length}</p><p className="text-[10px] text-slate-500">Inbox decisions</p></div>
              <div className="rounded-2xl border border-cyan-300/12 bg-[#061321] p-3"><Layers3 className="h-4 w-4 text-cyan-300" aria-hidden="true"/><p className="mt-2 text-2xl font-black text-white">{coverage.managedProjectCount}</p><p className="text-[10px] text-slate-500">Managed projects</p></div>
              <div className="rounded-2xl border border-emerald-300/12 bg-[#061321] p-3"><ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true"/><p className="mt-2 text-2xl font-black text-white">{coverage.scopes.length}</p><p className="text-[10px] text-slate-500">Authority scopes</p></div>
            </div>
          </div>
          <div className="relative mt-5 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#061321] px-3 py-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true"/>Decision comments remain mandatory and delegated authority remains explicit.</div>
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