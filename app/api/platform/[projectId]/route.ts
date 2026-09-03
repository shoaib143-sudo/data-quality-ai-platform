import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError, type AuthorizationCapability } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function numberInRange(value:unknown,min:number,max:number,fallback:number){
  const parsed=Math.floor(Number(value))
  return Number.isFinite(parsed)?Math.min(max,Math.max(min,parsed)):fallback
}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{} }
function text(value:unknown){return typeof value==='string'?value.trim():''}

async function requireCapability(userId:string,projectId:string,capability:AuthorizationCapability){
  await authorizeProject(userId,projectId,capability)
  return createAdminClient()
}

export async function GET(_request:Request,{params}:{params:Promise<{projectId:string}>}){
  try{
    const user=await requireUser()
    const {projectId}=await params
    const admin=await requireCapability(user.id,projectId,'catalog.read')
    const oneHourAgo=new Date(Date.now()-60*60_000).toISOString()
    const [capacity,recovery,contractChecks,drills,jobs,events,telemetry,sampling]=await Promise.all([
      admin.schema('orchestration').from('capacity_policies').select('*').eq('project_id',projectId).maybeSingle(),
      admin.schema('governance').rpc('recovery_readiness',{p_project_id:projectId}),
      admin.schema('governance').from('platform_contract_check_runs').select('*').eq('project_id',projectId).order('completed_at',{ascending:false}).limit(10),
      admin.schema('governance').from('backup_restore_drills').select('*').eq('project_id',projectId).order('created_at',{ascending:false}).limit(10),
      admin.schema('orchestration').from('job_queue').select('id,status,job_type,attempts,max_attempts,created_at,started_at,completed_at,last_error').eq('project_id',projectId).gte('created_at',oneHourAgo).order('created_at',{ascending:false}).limit(100),
      admin.schema('orchestration').from('event_outbox').select('id,event_type,status,attempts,max_attempts,created_at,processed_at,last_error').eq('project_id',projectId).gte('created_at',oneHourAgo).order('created_at',{ascending:false}).limit(100),
      admin.schema('orchestration').from('platform_telemetry').select('metric_key,numeric_value,dimensions,observed_at').eq('project_id',projectId).order('observed_at',{ascending:false}).limit(200),
      admin.schema('profiling').from('sampling_policies').select('dataset_id,mode,max_rows,sample_percent,deterministic_seed,updated_at').eq('project_id',projectId).order('updated_at',{ascending:false}),
    ])
    const firstError=[capacity.error,recovery.error,contractChecks.error,drills.error,jobs.error,events.error,telemetry.error,sampling.error].find(Boolean)
    if(firstError)throw new Error(firstError.message)
    return NextResponse.json({
      capacity:capacity.data??null,
      recovery:recovery.data??null,
      contractChecks:contractChecks.data??[],
      drills:drills.data??[],
      jobs:jobs.data??[],
      events:events.data??[],
      telemetry:telemetry.data??[],
      sampling:sampling.data??[],
    })
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to load platform controls.'},{status:500})
  }
}

export async function PATCH(request:Request,{params}:{params:Promise<{projectId:string}>}){
  try{
    const user=await requireUser()
    const {projectId}=await params
    const body=await request.json()
    const section=text(body.section).toUpperCase()

    if(section==='CAPACITY'){
      const admin=await requireCapability(user.id,projectId,'capacity.manage')
      const payload={
        project_id:projectId,
        max_concurrent_jobs:numberInRange(body.maxConcurrentJobs,1,100,4),
        max_jobs_per_hour:numberInRange(body.maxJobsPerHour,1,100000,120),
        max_profile_rows:numberInRange(body.maxProfileRows,100,10000000,10000),
        max_file_bytes:numberInRange(body.maxFileBytes,1048576,10737418240,52428800),
        max_notifications_per_hour:numberInRange(body.maxNotificationsPerHour,1,100000,500),
        updated_at:new Date().toISOString(),
      }
      const {data,error}=await admin.schema('orchestration').from('capacity_policies').upsert(payload,{onConflict:'project_id'}).select('*').single()
      if(error)throw new Error(`Unable to save capacity policy: ${error.message}`)
      await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'PLATFORM_CAPACITY_UPDATED',entityType:'PROJECT',entityId:projectId,metadata:payload})
      return NextResponse.json({capacity:data})
    }

    if(section==='RECOVERY'){
      const admin=await requireCapability(user.id,projectId,'admin.manage')
      const payload={
        project_id:projectId,
        target_rpo_minutes:numberInRange(body.targetRpoMinutes,1,10080,60),
        target_rto_minutes:numberInRange(body.targetRtoMinutes,1,10080,240),
        drill_frequency_days:numberInRange(body.drillFrequencyDays,1,365,90),
        enabled:body.enabled!==false,
        updated_by:user.id,
        updated_at:new Date().toISOString(),
      }
      const {data,error}=await admin.schema('governance').from('recovery_policies').upsert(payload,{onConflict:'project_id'}).select('*').single()
      if(error)throw new Error(`Unable to save recovery policy: ${error.message}`)
      await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'RECOVERY_POLICY_UPDATED',entityType:'PROJECT',entityId:projectId,metadata:payload})
      return NextResponse.json({recoveryPolicy:data})
    }

    return NextResponse.json({error:'section must be CAPACITY or RECOVERY.'},{status:400})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to update platform controls.'},{status:500})
  }
}

export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){
  try{
    const user=await requireUser()
    const {projectId}=await params
    const body=await request.json().catch(()=>({}))
    const action=text(body.action).toUpperCase()
    const admin=await requireCapability(user.id,projectId,'admin.manage')

    if(action==='RUN_CONTRACT_CHECK'){
      const {data,error}=await admin.schema('governance').rpc('run_platform_contract_checks',{p_project_id:projectId})
      if(error)throw new Error(`Unable to execute platform contract checks: ${error.message}`)
      await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'PLATFORM_CONTRACT_CHECK_EXECUTED',entityType:'PROJECT',entityId:projectId,metadata:{result:data}})
      return NextResponse.json({result:data})
    }

    if(action==='RECORD_RECOVERY_DRILL'){
      const drillType=text(body.drillType).toUpperCase()
      const status=text(body.status).toUpperCase()
      if(!['BACKUP_VERIFICATION','RESTORE_REHEARSAL','DISASTER_RECOVERY'].includes(drillType))return NextResponse.json({error:'Invalid drillType.'},{status:400})
      if(!['PASSED','FAILED'].includes(status))return NextResponse.json({error:'status must be PASSED or FAILED.'},{status:400})
      const measuredRpo=numberInRange(body.measuredRpoMinutes,0,10080,0)
      const measuredRto=numberInRange(body.measuredRtoMinutes,0,10080,0)
      const now=new Date().toISOString()
      const {data,error}=await admin.schema('governance').from('backup_restore_drills').insert({
        project_id:projectId,
        drill_type:drillType,
        status,
        environment:text(body.environment)||'production',
        evidence:object(body.evidence),
        notes:text(body.notes)||null,
        performed_by:user.id,
        measured_rpo_minutes:measuredRpo,
        measured_rto_minutes:measuredRto,
        started_at:now,
        completed_at:now,
      }).select('*').single()
      if(error)throw new Error(`Unable to record recovery drill: ${error.message}`)
      await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'RECOVERY_DRILL_RECORDED',entityType:'PROJECT',entityId:projectId,metadata:{drill_id:data.id,drill_type:drillType,status,policy_result:data.policy_result,measured_rpo_minutes:measuredRpo,measured_rto_minutes:measuredRto}})
      return NextResponse.json({drill:data},{status:201})
    }

    return NextResponse.json({error:'Unsupported platform action.'},{status:400})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to execute platform action.'},{status:500})
  }
}
