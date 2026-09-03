import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

async function context(projectId:string,userId:string){
  const admin=createAdminClient()
  const {data:project,error:projectError}=await admin.schema('app').from('projects').select('id,name,organization_id').eq('id',projectId).maybeSingle()
  if(projectError||!project)return null
  const {data:membership,error:membershipError}=await admin.schema('app').from('organization_members').select('role').eq('organization_id',project.organization_id).eq('user_id',userId).maybeSingle()
  if(membershipError||!membership||!['OWNER','ADMIN'].includes(String(membership.role)))return null
  return {admin,project,membership}
}

export async function PATCH(request:Request,{params}:{params:Promise<{projectId:string}>}){
  try{
    const user=await requireUser()
    const {projectId}=await params
    const ctx=await context(projectId,user.id)
    if(!ctx)return NextResponse.json({error:'Project administrator access is required.'},{status:403})
    const body=await request.json()
    const profileHistoryDays=Math.max(30,Math.floor(Number(body.profileHistoryDays??365)))
    const agentJobHistoryDays=Math.max(30,Math.floor(Number(body.agentJobHistoryDays??180)))
    const minimumProfileRuns=Math.min(100,Math.max(2,Math.floor(Number(body.minimumProfileRuns??5))))
    const minimumAgentRuns=Math.min(1000,Math.max(10,Math.floor(Number(body.minimumAgentRuns??50))))
    const payload={
      project_id:projectId,
      profile_history_days:profileHistoryDays,
      agent_job_history_days:agentJobHistoryDays,
      minimum_profile_runs:minimumProfileRuns,
      minimum_agent_runs:minimumAgentRuns,
      enabled:body.enabled===true,
      legal_hold:body.legalHold===true,
      updated_by:user.id,
      updated_at:new Date().toISOString(),
    }
    const {data,error}=await ctx.admin.schema('governance').from('retention_policies').upsert(payload,{onConflict:'project_id'}).select('*').single()
    if(error)return NextResponse.json({error:error.message},{status:400})
    await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'RETENTION_POLICY_UPDATED',entityType:'PROJECT',entityId:projectId,metadata:{profile_history_days:profileHistoryDays,agent_job_history_days:agentJobHistoryDays,minimum_profile_runs:minimumProfileRuns,minimum_agent_runs:minimumAgentRuns,enabled:payload.enabled,legal_hold:payload.legal_hold}})
    return NextResponse.json({policy:data})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to update retention policy.'},{status:500})
  }
}

export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){
  try{
    const user=await requireUser()
    const {projectId}=await params
    const ctx=await context(projectId,user.id)
    if(!ctx)return NextResponse.json({error:'Project administrator access is required.'},{status:403})
    const body=await request.json().catch(()=>({}))
    if(body.action!=='RUN_NOW'||body.confirm!==true)return NextResponse.json({error:'action=RUN_NOW and confirm=true are required.'},{status:400})
    const {data:policy,error:policyError}=await ctx.admin.schema('governance').from('retention_policies').select('enabled,legal_hold').eq('project_id',projectId).maybeSingle()
    if(policyError||!policy)return NextResponse.json({error:'Configure a retention policy before running cleanup.'},{status:409})
    if(!policy.enabled)return NextResponse.json({error:'Retention policy is disabled.'},{status:409})
    if(policy.legal_hold)return NextResponse.json({error:'Retention cleanup is blocked by legal hold.'},{status:409})

    const {data,error}=await ctx.admin.schema('governance').rpc('apply_retention_policy',{p_project_id:projectId})
    if(error)return NextResponse.json({error:error.message},{status:400})
    await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'RETENTION_POLICY_EXECUTED',entityType:'PROJECT',entityId:projectId,metadata:{result:data}})
    return NextResponse.json({result:data})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to execute retention policy.'},{status:500})
  }
}
