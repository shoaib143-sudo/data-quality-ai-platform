import Link from 'next/link'
import { ArrowLeft, Inbox, Search, ShieldX } from 'lucide-react'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { personas } from '@/lib/governance/personas'
import { requireUser } from '@/lib/supabase/auth'

export default async function AccessDeniedPage() {
  const user = await requireUser()
  const access = await resolveLandingAccess(user.id)
  const persona = personas[access.persona]
  const homeHref = access.enabled ? `/home/${access.persona}` : '/home/unavailable'
  const canInbox = canAccessWorkspace(access.persona, 'inbox', access.organizationRole)
  const canSearch = canAccessWorkspace(access.persona, 'search', access.organizationRole)

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950 sm:px-6">
      <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9" role="status" aria-labelledby="access-denied-title">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-700">
          <ShieldX className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Workspace unavailable</p>
        <h1 id="access-denied-title" className="mt-2 text-3xl font-black tracking-tight">This workspace is not available in your current governance context.</h1>
        <p className="mt-4 max-w-2xl leading-7 text-slate-600">
          DataNexus has not changed any data or permissions. Continue from your {persona.title} home or another workspace already available to your current role and organization context.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          For security, this page does not disclose the internal capability or policy rule that denied access.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={homeHref} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Return to role home
          </Link>
          {canInbox ? (
            <Link href="/inbox" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
              <Inbox className="h-4 w-4" aria-hidden="true" />
              Open governance inbox
            </Link>
          ) : null}
          {canSearch ? (
            <Link href="/search" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
              <Search className="h-4 w-4" aria-hidden="true" />
              Search governed data
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  )
}
