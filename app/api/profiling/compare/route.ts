import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { compareProfiles } from '@/lib/profiling/derived-tools'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value:unknown){return typeof value==='string'?value.trim():''}

async function profileContext(profileRunId:string,userId:string){
  const admin=createAdminClient()
  const {data:run,error:runError}=await admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,status').eq('id',profileRunId).maybeSingle()
  if(runError||!run)return null
  const {data:version}=await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id',run.dataset_version_id).maybeSingle()
  if(!version)return null
  const {data:dataset}=await admin.schema('catalog').from('datasets').select('id,project_id').eq('id',version.dataset_id).maybeSingle()
  if(!dataset)return null
  const {data:project}=await admin.schema('app').from('projects').select('organization_id').eq('id',dataset.project_id).maybeSingle()
  if(!project)return null
  const {data:membership}=await admin.schema('app').from('organization_members').select('role').eq('organization_id',project.organization_id).eq('user_id',userId).maybeSingle()
  return membership?{admin,run,version,dataset}:null
}

export async function POST(request:Request){
  try{
    const user=await requireUser()
    const body=await request.json()
    const baselineProfileRunId=text(body.baselineProfileRunId)
    const targetProfileRunId=text(body.targetProfileRunId)
    if(!baselineProfileRunId||!targetProfileRunId||baselineProfileRunId===targetProfileRunId)return NextResponse.json({error:'Distinct baselineProfileRunId and targetProfileRunId are required.'},{status:400})

    const [baseline,target]=await Promise.all([profileContext(baselineProfileRunId,user.id),profileContext(targetProfileRunId,user.id)])
    if(!baseline||!target)return NextResponse.json({error:'One or both profile runs are unavailable.'},{status:404})
    if(baseline.dataset.id!==target.dataset.id)return NextResponse.json({error:'Profile comparison requires runs from the same dataset.'},{status:400})
    if(String(baseline.run.status)!=='COMPLETED'||String(target.run.status)!=='COMPLETED')return NextResponse.json({error:'Only completed profiling runs can be compared.'},{status:409})

    const result=await compareProfiles(baselineProfileRunId,targetProfileRunId)
    await writeGovernanceAudit({projectId:target.dataset.project_id,actorUserId:user.id,eventType:'PROFILE_COMPARISON_CREATED',entityType:'DATASET',entityId:target.dataset.id,metadata:{baseline_profile_run_id:baselineProfileRunId,target_profile_run_id:targetProfileRunId,comparison_id:(result as Record<string,unknown>).comparison_id??null}})
    return NextResponse.json({comparison:result},{status:201})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to compare profiling runs.'},{status:500})
  }
}
