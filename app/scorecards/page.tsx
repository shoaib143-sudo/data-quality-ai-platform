import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ScorecardManager } from './scorecard-manager'

export default async function ScorecardsPage() {
  await requireUser()
  const supabase = await createClient()
  const { data: projects, error } = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (error) throw new Error(`Unable to load governance scorecard projects: ${error.message}`)

  return <main className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,_rgba(219,234,254,0.85),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_55%,_#f8fafc_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white bg-white/90 px-5 py-3 shadow-sm"><Link href="/dashboard" className="font-black">Data Governance PowerHouse</Link><div className="flex flex-wrap gap-2 text-sm"><Link href="/catalog" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Catalog</Link><Link href="/observability" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Observability</Link><Link href="/reports" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Reports</Link></div></nav>
      <header className="mb-6 rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><BarChart3 className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Governance performance</p><h1 className="text-3xl font-black">Governance Scorecards</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">Track evidence backed governance coverage and control health at project level without invented maturity metrics.</p></header>
      {projects?.length ? <ScorecardManager projects={projects} /> : <section className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">No accessible projects are available.</section>}
    </div>
  </main>
}
