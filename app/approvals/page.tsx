import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { loadApprovalInbox } from '@/lib/governance/approval-inbox'
import { ApprovalInbox } from './approval-inbox'

export default async function ApprovalsPage() {
  const user = await requireUser()
  const items = await loadApprovalInbox(user.id)

  return (
    <main className="min-h-screen p-6 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-cyan-500">Governed execution</p>
            <h1 className="mt-1 text-3xl font-bold">Approvals</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Review your execution requests and domain-scoped approval decisions. Every approval or rejection requires a comment.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/agents" className="rounded-xl border px-4 py-2 text-sm font-semibold">Agents</Link>
            <Link href="/monitoring" className="rounded-xl border px-4 py-2 text-sm font-semibold">Job Monitor</Link>
          </div>
        </header>
        <ApprovalInbox items={items} />
      </div>
    </main>
  )
}
