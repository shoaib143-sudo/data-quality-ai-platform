import Link from 'next/link'
import { Layers3, ListChecks } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { RuleManager } from './rule-manager'

export default async function DataQualityRulesPage(){
  const user=await requireUser()
  const landing=await resolveLandingAccess(user.id)
  const supabase=await createClient()
  const [projectsResult,datasetsResult,versionsResult,rulesResult]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status').order('version_number',{ascending:false}),
    supabase.schema('profiling').from('quality_rule_definitions').select('*').order('created_at',{ascending:false}),
  ])
  for(const result of [projectsResult,datasetsResult,versionsResult,rulesResult]) if(result.error) throw new Error(result.error.message)
  const manageableProjectIds=(await Promise.all((projectsResult.data??[]).map(async project=>[String(project.id),await hasProjectCapability(user.id,String(project.id),'quality.manage')] as const))).filter(([,allowed])=>allowed).map(([projectId])=>projectId)
  const canMonitoring=canAccessWorkspace(landing.persona,'monitoring',landing.organizationRole)
  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="flex items-center gap-3 font-bold text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><div className="flex gap-2 text-sm"><Link href="/data-quality" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Data Quality</Link>{canMonitoring?<Link href="/monitoring" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Job Monitor</Link>:null}</div></nav>
    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300"><ListChecks className="h-6 w-6"/></span><div><h1 className="text-3xl font-black text-white">Data Quality Rules</h1><p className="mt-1 text-sm text-slate-400">Review governed controls. Create, edit or enable rules only where your project role grants <code>quality.manage</code>.</p></div></div></header>
    <RuleManager projects={projectsResult.data??[]} datasets={datasetsResult.data??[]} versions={versionsResult.data??[]} initialRules={rulesResult.data??[]} manageableProjectIds={manageableProjectIds}/>
  </div></main>
}