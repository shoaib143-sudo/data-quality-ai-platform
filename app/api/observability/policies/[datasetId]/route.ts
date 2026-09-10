import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeDataset, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export async function PATCH(request:Request,{params}:{params:Promise<{datasetId:string}>}){
  try{
    const user=await requireUser()
    const {datasetId}=await params
    const {dataset}=await authorizeDataset(user.id,datasetId,'observability.manage')
    const admin=createAdminClient()
    const b=await request.json()
    const payload={
      project_id:dataset.project_id,
      dataset_id:datasetId,
      freshness_sla_hours:Math.max(1,Number(b.freshnessSlaHours??24)),
      max_volume_change_ratio:Math.max(0,Number(b.maxVolumeChangeRatio??0.5)),
      max_score_drop:Math.min(1,Math.max(0,Number(b.maxScoreDrop??0.1))),
      schema_change_policy:String(b.schemaChangePolicy??'ALERT').toUpperCase(),
      enabled:b.enabled!==false,
      metadata:b.metadata??{},
      updated_at:new Date().toISOString(),
    }
    const {data,error}=await admin.schema('profiling').from('observability_policies').upsert(payload,{onConflict:'dataset_id'}).select('*').single()
    if(error)return NextResponse.json({error:error.message},{status:400})
    await writeGovernanceAudit({projectId:dataset.project_id,actorUserId:user.id,eventType:'OBSERVABILITY_POLICY_UPDATED',entityType:'DATASET',entityId:datasetId,metadata:payload})
    await admin.schema('profiling').rpc('refresh_observability_freshness_alerts')
    return NextResponse.json({policy:data})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to update observability policy.'},{status:500})
  }
}
