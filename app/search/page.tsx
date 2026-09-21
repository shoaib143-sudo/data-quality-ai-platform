import Link from 'next/link'
import { Search } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { GlobalSearch } from './global-search'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function SearchPage(){
  const user=await requireUser()
  const landing=await resolveLandingAccess(user.id)
  const canCatalog=canAccessWorkspaceHref(landing.persona,'/catalog',landing.organizationRole)
  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Global Search" contextLabel="Governed discovery" homeHref="/home" />{canCatalog?<div className="mb-6 mt-4 flex justify-end"><Link href="/catalog" className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-cyan-300 hover:bg-white/[.05]">Catalog</Link></div>:null}<header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><Search className="h-6 w-6"/></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Governed discovery</p><h1 className="mt-1 text-3xl font-black text-white">Global Governance Search</h1><p className="mt-1 text-sm text-slate-400">Find governed assets, business meaning, controls, issues, classifications, contracts and evidence. Results are filtered to workspaces your current persona can open.</p></div></div></header><GlobalSearch/></div></main>
}