import Link from 'next/link'
import { GitBranch, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { hasProjectCapability, type AuthorizationCapability } from '@/lib/auth/authorize'
import { WorkflowManagerV3 } from './workflow-manager-v3'

type WorkflowsPageProps={searchParams:Promise<{instanceId?:string|string[]}>}

export default async function WorkflowsPage({searchParams}:WorkflowsPageProps){
  const user=await requireUser()
  const params=await searchParams
  const selectedInstanceId=Array.isArray(params.instanceId)?params.instanceId[0]??'':params.instanceId??''
  const supabase=await createClient()
  const [projects,definitions,instances,outcomes,learning]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('governance').from('workflow_definitions').select('*').order('created_at',{ascending:false}),
    supabase.schema('governance').from('workflow_instances').select('*').order('started_at',{ascending:false}).limit(200),
    supabase.schema('governance').from('profiling_remediation_outcomes').select('*').order('updated_at',{ascending:false}).limit(200),
    supabase.schema('governance').from('profiling_recommendation_learning').select('id,project_id,workflow_instance_id,recommendation_action,status,effective,quality_score_delta,high_severity_findings_delta,observed_at').order('observed_at',{ascending:false,nullsFirst:false}).limit(500),
  ])
  for(const result of [projects,definitions,instances,outcomes,learning])if(result.error)throw new Error(result.error.message)

  const definitionsById=new Map((definitions.data??[]).map(definition=>[definition.id,definition]))
  const projectPermissions=await Promise.all((projects.data??[]).map(async project=>({
    id:project.id,
    name:project.name,
    canWorkflowManage:await hasProjectCapability(user.id,project.id,'workflow.manage'),
    canIssuesManage:await hasProjectCapability(user.id,project.id,'issues.manage'),
    canQualityRead:await hasProjectCapability(user.id,project.id,'quality.read'),
  })))
  const capabilityCache=new Map<string,boolean>()
  async function can(projectId:string,capability:string){
    const key=`${projectId}:${capability}`
    if(capabilityCache.has(key))return capabilityCache.get(key)!
    const allowed=await hasProjectCapability(user.id,projectId,capability as AuthorizationCapability)
    capabilityCache.set(key,allowed)
    return allowed
  }
  const permissionedInstances=await Promise.all((instances.data??[]).map(async instance=>{
    const definition=definitionsById.get(instance.workflow_definition_id)
    const steps=Array.isArray(definition?.steps)?definition.steps as Array<Record<string,unknown>>:[]
    const current=steps[Number(instance.current_step)]??{}
    const activeCapability=typeof current.capability==='string'&&current.capability.trim()?current.capability.trim():'workflow.manage'
    return {...instance,activeCapability,canAct:instance.status==='PENDING'?await can(instance.project_id,activeCapability):false}
  }))

  const selectedInstance=selectedInstanceId?permissionedInstances.find(instance=>instance.id===selectedInstanceId):null
  const selectedProjectId=selectedInstance?.project_id??''
  const orderedProjects=selectedProjectId?[...projectPermissions].sort((left,right)=>Number(right.id===selectedProjectId)-Number(left.id===selectedProjectId)):projectPermissions
  const orderedInstances=selectedInstanceId?[...permissionedInstances].sort((left,right)=>Number(right.id===selectedInstanceId)-Number(left.id===selectedInstanceId)):permissionedInstances

  const remediationIssueIds:string[]=Array.from(new Set<string>((outcomes.data??[]).flatMap(outcome=>Array.isArray(outcome.remediation_issue_ids)?outcome.remediation_issue_ids.filter((id:unknown):id is string=>typeof id==='string'&&id.length>0):[])))
  const issueChunks:string[][]=Array.from({length:Math.ceil(remediationIssueIds.length/100)},(_,index)=>remediationIssueIds.slice(index*100,(index+1)*100))
  const issueResults=await Promise.all(issueChunks.map(ids=>supabase.schema('governance').from('issues').select('id,project_id,profile_run_id,title,status,severity,updated_at').in('id',ids)))
  for(const result of issueResults)if(result.error)throw new Error(result.error.message)
  const issues=issueResults.flatMap(result=>result.data??[]).sort((left,right)=>new Date(right.updated_at??0).getTime()-new Date(left.updated_at??0).getTime()).slice(0,500)

  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3"><Link href="/home" className="flex items-center gap-3 font-bold text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><div className="flex gap-2"><Link href="/issues" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[.05]">Issues</Link><Link href="/profiling/explorer" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[.05]">Profiling evidence</Link></div></nav>
    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-400/10 text-violet-300"><GitBranch className="h-6 w-6"/></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Governed orchestration</p><h1 className="mt-1 text-3xl font-black text-white">Governance Workflows</h1><p className="mt-1 text-sm text-slate-400">Versioned approvals, remediation tracking and verification. Each action appears only when the selected project grants the exact server-side capability.</p>{selectedInstance?<p className="mt-2 text-xs font-semibold text-violet-300">Focused workflow instance {selectedInstance.id}</p>:null}</div></div></header>
    <WorkflowManagerV3 projects={orderedProjects} definitions={definitions.data??[]} instances={orderedInstances} outcomes={outcomes.data??[]} learning={learning.data??[]} issues={issues}/>
  </div></main>
}
