import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'

export default async function SettingsPage() {
  await requireUser()

  return (
    <main id="main-content" className="min-h-screen bg-slate-950 px-4 py-20 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Account</p>
        <h1 className="mt-2 text-3xl font-black">Settings</h1>
        <p className="mt-2 text-sm text-slate-400">Account preferences and access-aware configuration.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link href="/profile" className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-blue-500">
            <p className="font-bold text-white">Profile</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">Review your signed-in identity and governed access context.</p>
          </Link>
          <Link href="/monitoring" className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-blue-500">
            <p className="font-bold text-white">Job Monitor</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">Open execution monitoring without changing execution authority.</p>
          </Link>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="font-semibold text-white">Governed options</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Persona-specific administration, execution, and governance settings remain in their authorized workspaces and are not exposed globally.
          </p>
        </div>

        <div className="mt-6">
          <Link href="/home" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">
            Return home
          </Link>
        </div>
      </section>
    </main>
  )
}
