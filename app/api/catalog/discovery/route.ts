import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueDurableJob } from '@/lib/orchestration/queue'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value:unknown){return typeof value==='string'?value.trim():''}

export async function POST(request:Request){
  try{
    const user=await requireUser()
    const body=await request.json()
    const sourceId=text(body.sourceId)
    if(!sourceId)return NextResponse.json({error:'sourceId is required.'},{status:400})
    const admin=createAdminClient()
    const {data:source,error:sourceError}=await admin.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status').eq('id',sourceId).maybeSingle()
    if(sourceError||!source)return NextResponse.json({error:'Data source was not found.'},{status:404})
    await authorizeProject(user.id,source.project_id,'discovery.execute')
    const key=text(request.headers.get('idempotency-key')??body.idempotencyKey)||crypto.randomUUID()
    const durable=await enqueueDurableJob({
      projectId:source.project_id,
      jobType:'DISCOVERY',
      entityId:source.id,
      idempotencyKey:`discovery:${key}`,
      payload:{sourceId:source.id,userId:user.id},
      maxAttempts:3,
      priority:80,
    })
    await writeGovernanceAudit({projectId:source.project_id,actorUserId:user.id,eventType:'METADATA_DISCOVERY_QUEUED',entityType:'DATA_SOURCE',entityId:source.id,metadata:{durable_job_id:durable.id,source_type:source.source_type}})
    return NextResponse.json({accepted:true,durableJobId:durable.id,status:durable.status,sourceId:source.id},{status:202})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to queue metadata discovery.'},{status:500})
  }
}
