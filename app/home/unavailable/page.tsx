import Link from 'next/link'
import { EyeOff, ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { personas } from '@/lib/governance/personas'

export default async function LandingUnavailablePage() {
  const user = await requireUser()
  const access = await resolveLandingAccess(user.id)
  const persona = personas[access.persona]

  if (access.enabled) {
    return <main id="main-content" tabIndex={-1} className="min-h-screen px-4 py-8 text-slate-100 sm:px-6 sm:py-12">
      <div className="dn-surface mx-auto max-w-3xl p-7 text-center sm:p-9">
        <ShieldCheck className="mx-auto h-9 w-9 text-blue-600" />
        <h1 className="mt-5 text-3xl font-black">Your landing page is available</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">Open your {persona.title} experience to continue.</p>
        <Link href={`/home/${access.persona}`} className="mt-7 inline-flex rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-[5px_5px_12px_rgba(37,99,235,0.24)]">Open role home</Link>
      </div>
    </main>
  }

  return <main id="main-content" tabIndex={-1} className="min-h-screen px-4 py-8 text-slate-100 sm:px-6 sm:py-12">
    <div className="dn-surface mx-auto max-w-3xl p-7 text-center sm:p-9">
      <span className="dn-inset mx-auto grid h-12 w-12 place-items-center text-slate-400"><EyeOff className="h-6 w-6" /></span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Role experience unavailable</p>
      <h1 className="mt-2 text-3xl font-black">{persona.title} landing page is disabled</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">Your administrator has disabled this role landing page for the organization. Your underlying permissions are unchanged.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-[5px_5px_12px_rgba(37,99,235,0.24)]">Return to DataNexus</Link>
        {access.organizationRole && /^(OWNER|ADMIN)$/i.test(access.organizationRole) ? <Link href="/admin/landing-pages" className="rounded-2xl px-5 py-3 text-sm font-bold text-blue-700 shadow-[5px_5px_12px_#cbd2dc,-5px_-5px_12px_#ffffff]">Manage landing pages</Link> : null}
      </div>
    </div>
  </main>
}
