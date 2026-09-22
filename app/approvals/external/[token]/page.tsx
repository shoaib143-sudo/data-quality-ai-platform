import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { verifyExternalApprovalToken } from '@/lib/governance/external-approval-token'
import { ExternalApprovalDecisionForm } from './external-approval-decision-form'

export default async function ExternalApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireUser()
  const { token } = await params
  const payload = verifyExternalApprovalToken(token)

  if (payload.recipientUserId !== user.id) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-screen p-6 sm:p-8">
        <div className="mx-auto max-w-2xl rounded-2xl border p-6">
          <h1 className="text-2xl font-bold">Approval link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">This signed approval link was issued to a different DataNexus user.</p>
          <Link href="/approvals" className="mt-4 inline-block text-sm font-semibold underline">Open Approvals</Link>
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen p-6 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <p className="text-sm font-semibold text-cyan-500">Governed execution approval</p>
          <h1 className="mt-1 text-3xl font-bold">Review approval request</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is bound to your identity, the approval request, approval axis and source channel. A reason/comment is mandatory.
          </p>
        </header>
        <ExternalApprovalDecisionForm token={token} axis={payload.axis} channel={payload.channel} />
        <Link href="/approvals" className="inline-block text-sm font-semibold underline">Open full approval inbox</Link>
      </div>
    </main>
  )
}
