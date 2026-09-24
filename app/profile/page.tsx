import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function ProfilePage() {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const canSettings = canAccessWorkspaceHref(landing.persona, '/settings', landing.organizationRole)

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen px-4 py-5 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-5xl"><GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Profile" contextLabel="Identity and governed access" homeHref="/home" /></div>
      <section className="dn-surface mx-auto mt-4 max-w-3xl p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Account</p>
        <h1 className="mt-2 text-3xl font-black">Profile</h1>
        <p className="mt-2 text-sm text-slate-400">Your signed-in DataNexus identity and governed access context.</p>

        <div className="dn-inset mt-4 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Signed-in email</p>
          <p className="mt-2 break-all text-sm font-semibold text-white">{user.email ?? 'Email unavailable'}</p>
        </div>

        <div className="dn-inset mt-3 p-4">
          <p className="text-sm font-semibold text-white">Access model</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Persona and project permissions remain capability-governed. This profile page does not grant or elevate access.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/home" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500">
            Return home
          </Link>
          {canSettings ? <Link href="/settings" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">Settings</Link> : null}
        </div>
      </section>
    </main>
  )
}