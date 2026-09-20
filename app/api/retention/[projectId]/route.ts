import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import {
  parseRetentionPolicyPatch,
  parseRetentionRunRequest,
  RetentionPolicyInputError,
} from '@/lib/governance/retention-policy-input'

export async function PATCH(request:Request,{params}:{params:Promise<{projectId:string}>}){
  try{
    const user=await requireUser()
    const {projectId}=await params
    await authorizeProject(user.id,projectId,'retention.manage')
    const admin=createAdminClient()
    const parsed=parseRetentionPolicyPatch(await request.json().catch(()=>null))
    const payload={
      project_id:projectId,
      profile_history_days:parsed.profileHistoryDays,
      agent_job_history_days:parsed.agentJobHistoryDays,
      minimum_profile_runs:parsed.minimumProfileRuns,
      minimum_agent_runs:parsed.minimumAgentRuns,
      enabled:parsed.enabled,
      legal_hold:parsed.legalHold,
      updated_by:user.id,
      updated_at:new Date().toISOString(),
    }
    const {data,error}=await admin.schema('governance').from('retention_policies').upsert(payload,{onConflict:'project_id'}).select('*').single()
    if(error)return NextResponse.json({error:error.message},{status:400})
    await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'RETENTION_POLICY_UPDATED',entityType:'PROJECT',entityId:projectId,metadata:{profile_history_days:parsed.profileHistoryDays,agent_job_history_days:parsed.agentJobHistoryDays,minimum_profile_runs:parsed.minimumProfileRuns,minimum_agent_runs:parsed.minimumAgentRuns,enabled:payload.enabled,legal_hold:payload.legal_hold}})
    return NextResponse.json({policy:data})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    if(error instanceof RetentionPolicyInputError)return NextResponse.json({error:error.message},{status:400})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to update retention policy.'},{status:500})
  }
}

export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){
  try{
    const user=await requireUser()
    const {projectId}=await params
    await authorizeProject(user.id,projectId,'retention.manage')
    const admin=createAdminClient()
    parseRetentionRunRequest(await request.json().catch(()=>null))
    const {data:policy,error:policyError}=await admin.schema('governance').from('retention_policies').select('enabled,legal_hold').eq('project_id',projectId).maybeSingle()
    if(policyError||!policy)return NextResponse.json({error:'Configure a retention policy before running cleanup.'},{status:409})
    if(!policy.enabled)return NextResponse.json({error:'Retention policy is disabled.'},{status:409})
    if(policy.legal_hold)return NextResponse.json({error:'Retention cleanup is blocked by legal hold.'},{status:409})

    const {data,error}=await admin.schema('governance').rpc('apply_retention_policy',{p_project_id:projectId})
    if(error)return NextResponse.json({error:error.message},{status:400})
    await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'RETENTION_POLICY_EXECUTED',entityType:'PROJECT',entityId:projectId,metadata:{result:data}})
    return NextResponse.json({result:data})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    if(error instanceof RetentionPolicyInputError)return NextResponse.json({error:error.message},{status:400})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to execute retention policy.'},{status:500})
  }
}
