import Link from 'next/link'
import { ArrowRight, BookOpen, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { GlobalSearch } from './global-search'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function SearchPage(){
  const user=await requireUser()
  const landing=await resolveLandingAccess(user.id)
  const canCatalog=canAccessWorkspaceHref(landing.persona,'/catalog',landing.organizationRole)
  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#050b17] text-slate-100"><div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
    <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Global Search" contextLabel="Governed discovery" homeHref="/home" />
    <header className="relative mt-4 overflow-hidden rounded-[28px] border border-cyan-300/12 bg-[#09192d] p-7 shadow-[0_24px_70px_rgba(0,0,0,.24)]">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-500/[0.07] blur-3xl"/>
      <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-black text-cyan-200"><Sparkles className="h-3.5 w-3.5" aria-hidden="true"/>Governed discovery</div>
          <h1 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">Search once. Follow governed evidence anywhere.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">Find governed assets, business meaning, controls, issues, classifications, contracts and evidence. Results are filtered to workspaces your current persona can open.</p>
          {canCatalog?<div className="mt-5"><Link href="/catalog" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] px-4 py-2.5 text-sm font-bold text-cyan-200 hover:border-cyan-300/30"><BookOpen className="h-4 w-4" aria-hidden="true"/>Catalog <ArrowRight className="h-4 w-4" aria-hidden="true"/></Link></div>:null}
        </div>
        <div className="rounded-3xl border border-white/[0.08] bg-[#061321] p-5">
          <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true"/>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-300/70">Access-aware results</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">Search never creates visibility. Every result remains constrained by the workspace and resource access already granted to your current persona.</p>
        </div>
      </div>
    </header>
    <section className="mt-4 rounded-[24px] border border-white/[0.08] bg-[#09192d] p-4 sm:p-5" aria-label="Global governed search">
      <div className="mb-4 flex items-center gap-2 text-xs text-slate-500"><Search className="h-4 w-4 text-cyan-300" aria-hidden="true"/>Search across governed evidence</div>
      <GlobalSearch/>
    </section>
  </div></main>
}