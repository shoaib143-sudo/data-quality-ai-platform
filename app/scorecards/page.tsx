import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { resolvePreferredGovernanceProject } from '@/lib/governance/preferred-project'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ScorecardManagerV2 } from './scorecard-manager-v2'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function ScorecardsPage() {
  const user=await requireUser()
  const [supabase,preferredProjectId,landing]=await Promise.all([createClient(),resolvePreferredGovernanceProject(user.id),resolveLandingAccess(user.id)])
  const canCatalog=canAccessWorkspaceHref(landing.persona,'/catalog',landing.organizationRole)
  const canQuality=canAccessWorkspaceHref(landing.persona,'/data-quality',landing.organizationRole)
  const canReports=canAccessWorkspaceHref(landing.persona,'/reports',landing.organizationRole)
  const { data: projects, error } = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (error) throw new Error(`Unable to load governance scorecard projects: ${error.message}`)

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#061426] px-4 py-6 text-slate-100 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
    <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Scorecards" contextLabel="Governance performance" homeHref="/home" /><div className="mb-6 mt-4 flex flex-wrap justify-end gap-2 text-sm">{canCatalog?<Link href="/catalog" className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05]">Catalog</Link>:null}{canQuality?<Link href="/data-quality" className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-slate-300 hover:bg-white/[.05]">Data Quality</Link>:null}{canReports?<Link href="/reports" className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-cyan-300 hover:bg-white/[.05]">Reports</Link>:null}</div>
    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><BarChart3 className="h-6 w-6"/></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Governance performance</p><h1 className="mt-1 text-3xl font-black text-white">Governance Scorecards</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">Track evidence-backed governance coverage and control health at project level. Every score and dimension links back to supporting governed evidence.</p></header>
    {projects?.length?<ScorecardManagerV2 projects={projects} initialProjectId={preferredProjectId}/>:<section className="mt-5 rounded-3xl border border-white/10 bg-[#0a1d33] p-8 text-sm text-slate-500">No accessible projects are available.</section>}
  </div></main>
}