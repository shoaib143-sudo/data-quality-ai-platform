import Link from 'next/link'
import { BarChart3, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ScorecardManagerV2 } from './scorecard-manager-v2'

export default async function ScorecardsPage() {
  await requireUser()
  const supabase = await createClient()
  const { data: projects, error } = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (error) throw new Error(`Unable to load governance scorecard projects: ${error.message}`)

  return <main className="min-h-screen bg-[#061426] px-4 py-6 text-slate-100 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="flex items-center gap-3 font-black text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><div className="flex gap-2 text-sm"><Link href="/catalog" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05]">Catalog</Link><Link href="/data-quality" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05]">Data Quality</Link><Link href="/reports" className="rounded-xl px-3 py-2 font-semibold text-cyan-300 hover:bg-white/[.05]">Reports</Link></div></nav>
    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><BarChart3 className="h-6 w-6"/></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Governance performance</p><h1 className="mt-1 text-3xl font-black text-white">Governance Scorecards</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">Track evidence-backed governance coverage and control health at project level. Every score and dimension links back to supporting governed evidence.</p></header>
    {projects?.length?<ScorecardManagerV2 projects={projects}/>:<section className="mt-5 rounded-3xl border border-white/10 bg-[#0a1d33] p-8 text-sm text-slate-500">No accessible projects are available.</section>}
  </div></main>
}
