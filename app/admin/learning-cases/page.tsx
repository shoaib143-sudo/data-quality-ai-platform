import Link from 'next/link'
import { Brain, ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { authorizeDataGovernanceSuperAdminForOrganization } from '@/lib/auth/data-governance-super-admin'
import { resolveInstanceOrganizationMembership } from '@/lib/governance/instance-organization'
import { loadPositiveLearningCaseAdminInbox } from '@/lib/agents/proactive-governed-case-learning-admin'
import { PositiveLearningCaseReviewManager } from './positive-learning-case-review-manager'

export default async function LearningCasesPage() {
  const user = await requireUser()
  const membership = await resolveInstanceOrganizationMembership(user.id)
  await authorizeDataGovernanceSuperAdminForOrganization(user.id, membership.organizationId)
  const items = await loadPositiveLearningCaseAdminInbox(user.id)

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <nav className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm">
          <Link href="/home" className="font-black">DataNexus</Link>
          <div className="flex gap-2 text-sm">
            <Link href="/agents" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Agents</Link>
            <Link href="/approvals" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Approvals</Link>
          </div>
        </nav>

        <header className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white">
              <Brain className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Proactive Governed Case Learning</p>
              <h1 className="text-3xl font-black">Positive case review</h1>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p>
              Successful Supervised and Handsfree runs are only proposed here when verified and materially reusable.
              Nothing becomes reusable organizational knowledge until a Data Governance Admin explicitly approves it.
            </p>
          </div>
        </header>

        <PositiveLearningCaseReviewManager items={items} />
      </div>
    </main>
  )
}
