import Link from 'next/link'
import { GitBranch, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { WorkflowManager } from './workflow-manager'

export default async function WorkflowsPage(){
  await requireUser()
  const supabase=await createClient()
  const [projects,definitions,instances,outcomes,learning]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('governance').from('workflow_definitions').select('*').order('created_at',{ascending:false}),
    supabase.schema('governance').from('workflow_instances').select('*').order('started_at',{ascending:false}).limit(200),
    supabase.schema('governance').from('profiling_remediation_outcomes').select('*').order('updated_at',{ascending:false}).limit(200),
    supabase.schema('governance').from('profiling_recommendation_learning').select('id,project_id,workflow_instance_id,recommendation_action,status,effective,quality_score_delta,high_severity_findings_delta,observed_at').order('observed_at',{ascending:false,nullsFirst:false}).limit(500),
  ])
  for(const result of [projects,definitions,instances,outcomes,learning])if(result.error)throw new Error(result.error.message)

  const remediationIssueIds=Array.from(new Set((outcomes.data??[]).flatMap((outcome)=>
    Array.isArray(outcome.remediation_issue_ids)
      ? outcome.remediation_issue_ids.filter((id):id is string=>typeof id==='string'&&id.length>0)
      : []
  )))
  const issueChunks=Array.from({length:Math.ceil(remediationIssueIds.length/100)},(_,index)=>remediationIssueIds.slice(index*100,(index+1)*100))
  const issueResults=await Promise.all(issueChunks.map((ids)=>
    supabase.schema('governance').from('issues')
      .select('id,project_id,profile_run_id,title,status,severity,resolution_summary,resolution_evidence,updated_at')
      .in('id',ids)
  ))
  for(const result of issueResults)if(result.error)throw new Error(result.error.message)
  const issues=issueResults.flatMap((result)=>result.data??[])
    .sort((left,right)=>new Date(right.updated_at??0).getTime()-new Date(left.updated_at??0).getTime())
    .slice(0,500)

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><Link href="/stewardship" className="text-sm font-semibold text-violet-600">Stewardship</Link></nav><header className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><GitBranch className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Governance Workflows</h1><p className="mt-1 text-sm text-slate-500">Versioned, capability-driven approvals with governed profiling remediation, automatic re-profile verification, and recommendation learning.</p></div></div></header><WorkflowManager projects={projects.data??[]} definitions={definitions.data??[]} instances={instances.data??[]} outcomes={outcomes.data??[]} learning={learning.data??[]} issues={issues}/></div></main>
}
