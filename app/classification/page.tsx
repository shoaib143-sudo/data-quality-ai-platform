import Link from 'next/link'
import { ShieldCheck, Layers3 } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { resolvePreferredGovernanceProject } from '@/lib/governance/preferred-project'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ClassificationManager } from './classification-manager'

export default async function ClassificationPage(){
  const user=await requireUser()
  const [supabase,landing,preferredProjectId]=await Promise.all([
    createClient(),
    resolveLandingAccess(user.id),
    resolvePreferredGovernanceProject(user.id),
  ])
  const [projects,datasets,labels,classifications,policies]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('governance').from('classification_labels').select('*').eq('enabled',true).order('code'),
    supabase.schema('governance').from('dataset_classifications').select('*,classification_labels(*)').order('created_at',{ascending:false}),
    supabase.schema('governance').from('classification_policies').select('*,classification_labels(*)').order('created_at',{ascending:false}),
  ])
  for(const r of [projects,datasets,labels,classifications,policies]) if(r.error) throw new Error(r.error.message)

  const projectRows=projects.data??[]
  const [policyCapability,reviewCapability]=await Promise.all([
    Promise.all(projectRows.map(async project=>[project.id,await hasProjectCapability(user.id,project.id,'policy.approve')] as const)),
    Promise.all(projectRows.map(async project=>[project.id,await hasProjectCapability(user.id,project.id,'classification.review')] as const)),
  ])
  const policyManageProjectIds=policyCapability.filter(([,allowed])=>allowed).map(([projectId])=>projectId)
  const classificationReviewProjectIds=reviewCapability.filter(([,allowed])=>allowed).map(([projectId])=>projectId)
  const homeHref=canAccessWorkspace(landing.persona,'dashboard',landing.organizationRole)?'/dashboard':'/home'

  return <main className="min-h-screen bg-slate-50"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href={homeHref} className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><Link href="/catalog" className="text-sm font-semibold text-blue-600">Catalog</Link></nav><header className="rounded-3xl border border-purple-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-50 text-purple-600"><ShieldCheck className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Classification & Policy</h1><p className="mt-1 text-sm text-slate-500">Review classification evidence and, where authorized, approve handling policy.</p></div></div></header><ClassificationManager projects={projectRows} datasets={datasets.data??[]} labels={labels.data??[]} initialClassifications={classifications.data??[]} initialPolicies={policies.data??[]} initialProjectId={preferredProjectId} policyManageProjectIds={policyManageProjectIds} classificationReviewProjectIds={classificationReviewProjectIds}/></div></main>
}
