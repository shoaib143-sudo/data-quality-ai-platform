import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'

export default async function ProfilePage() {
  const user = await requireUser()

  return (
    <main id="main-content" className="min-h-screen bg-slate-950 px-4 py-20 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Account</p>
        <h1 className="mt-2 text-3xl font-black">Profile</h1>
        <p className="mt-2 text-sm text-slate-400">Your signed-in DataNexus identity and governed access context.</p>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Signed-in email</p>
          <p className="mt-2 break-all text-sm font-semibold text-white">{user.email ?? 'Email unavailable'}</p>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-white">Access model</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Persona and project permissions remain capability-governed. This profile page does not grant or elevate access.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/home" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500">
            Return home
          </Link>
          <Link href="/settings" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">
            Settings
          </Link>
        </div>
      </section>
    </main>
  )
}
