import Link from 'next/link'
import { ArrowRight, Layers3, ShieldCheck, Wrench } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { buildFindingsIssuesPresentation } from '@/lib/governance/persona-findings-issues-presentation'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { IssueManager } from './issue-manager'

export default async function IssuesPage(){
  const user=await requireUser();const supabase=await createClient();const landing=await resolveLandingAccess(user.id)
  const presentation=buildFindingsIssuesPresentation(landing.persona)
  const [projects,datasets,issues,members]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name,organization_id').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('governance').from('issues').select('*,issue_comments(*)').order('created_at',{ascending:false}),
    supabase.schema('app').from('organization_members').select('organization_id,user_id,role').order('created_at'),
  ])
  for(const r of [projects,datasets,issues,members])if(r.error)throw new Error(r.error.message)
  const manageableProjectIds=(await Promise.all((projects.data??[]).map(async project=>[String(project.id),await hasProjectCapability(user.id,String(project.id),'issues.manage')] as const))).filter(([,allowed])=>allowed).map(([projectId])=>projectId)
  const canDataQuality=canAccessWorkspace(landing.persona,'data-quality',landing.organizationRole)
  const canProfiling=canAccessWorkspace(landing.persona,'profiling',landing.organizationRole)
  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="flex items-center gap-3 font-bold text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><div className="flex items-center gap-2">{canProfiling&&presentation.showProfilingEvidence?<Link href="/profiling/explorer" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-cyan-300 hover:bg-white/[0.05]">Profiling findings <ArrowRight className="h-3.5 w-3.5"/></Link>:null}{canDataQuality?<Link href="/data-quality" className="rounded-xl px-3 py-2 text-sm font-semibold text-blue-300 hover:bg-white/[0.05]">Data Quality</Link>:null}</div></nav>
    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-5"><div className="flex items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><Wrench className="h-6 w-6"/></span><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">Persona-aware governed workspace</p><h1 className="mt-1 text-3xl font-black text-white">{presentation.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{presentation.description}</p></div></div><div className="rounded-2xl border border-white/[0.07] bg-[#08182b] px-4 py-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-emerald-300"><ShieldCheck className="h-4 w-4"/>Governed truth</div><p className="mt-2 text-xs text-slate-500">{presentation.truthBoundary} · {presentation.authorizationBoundary}</p></div></div><div className="mt-5 flex flex-wrap gap-2">{presentation.priorities.map(priority=><span key={priority} className="rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-slate-300">{priority.replaceAll('-',' ')}</span>)}</div></header>
    <IssueManager projects={projects.data??[]} datasets={datasets.data??[]} members={members.data??[]} initialIssues={issues.data??[]} manageableProjectIds={manageableProjectIds}/>
  </div></main>
}
