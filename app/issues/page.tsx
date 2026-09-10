import Link from 'next/link'
import { Layers3, Wrench } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { IssueManager } from './issue-manager'

export default async function IssuesPage(){
  const user=await requireUser();const supabase=await createClient();const landing=await resolveLandingAccess(user.id)
  const [projects,datasets,issues,members]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name,organization_id').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('governance').from('issues').select('*,issue_comments(*)').order('created_at',{ascending:false}),
    supabase.schema('app').from('organization_members').select('organization_id,user_id,role').order('created_at'),
  ])
  for(const r of [projects,datasets,issues,members])if(r.error)throw new Error(r.error.message)
  const manageableProjectIds=(await Promise.all((projects.data??[]).map(async project=>[String(project.id),await hasProjectCapability(user.id,String(project.id),'issues.manage')] as const))).filter(([,allowed])=>allowed).map(([projectId])=>projectId)
  const canDataQuality=canAccessWorkspace(landing.persona,'data-quality',landing.organizationRole)
  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="flex items-center gap-3 font-bold text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link>{canDataQuality?<Link href="/data-quality" className="text-sm font-semibold text-blue-300 hover:text-cyan-300">Data Quality</Link>:null}</nav><header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><Wrench className="h-6 w-6"/></span><div><h1 className="text-3xl font-black text-white">Issue & Remediation</h1><p className="mt-1 text-sm text-slate-400">Inspect governed issues and, where authorized, coordinate owned remediation with evidence and resolution history.</p></div></div></header><IssueManager projects={projects.data??[]} datasets={datasets.data??[]} members={members.data??[]} initialIssues={issues.data??[]} manageableProjectIds={manageableProjectIds}/></div></main>
}