import Link from 'next/link'
import { Search, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { GlobalSearch } from './global-search'

export default async function SearchPage(){
  await requireUser()
  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="flex items-center gap-3 font-bold text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><Link href="/catalog" className="rounded-xl px-3 py-2 text-sm font-semibold text-cyan-300 hover:bg-white/[.05]">Catalog</Link></nav><header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><Search className="h-6 w-6"/></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Governed discovery</p><h1 className="mt-1 text-3xl font-black text-white">Global Governance Search</h1><p className="mt-1 text-sm text-slate-400">Find governed assets, business meaning, controls, issues, classifications, contracts and evidence. Results are filtered to workspaces your current persona can open.</p></div></div></header><GlobalSearch/></div></main>
}
