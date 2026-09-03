import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

async function context(datasetId:string,userId:string){
  const admin=createAdminClient()
  const {data:dataset}=await admin.schema('catalog').from('datasets').select('id,project_id').eq('id',datasetId).maybeSingle()
  if(!dataset)return null
  const {data:project}=await admin.schema('app').from('projects').select('organization_id').eq('id',dataset.project_id).maybeSingle()
  if(!project)return null
  const {data:membership}=await admin.schema('app').from('organization_members').select('role').eq('organization_id',project.organization_id).eq('user_id',userId).maybeSingle()
  return membership?{admin,dataset,membership}:null
}
export async function PATCH(request:Request,{params}:{params:Promise<{datasetId:string}>}){
  const user=await requireUser();const {datasetId}=await params;const ctx=await context(datasetId,user.id)
  if(!ctx)return NextResponse.json({error:'Dataset not found or access denied.'},{status:404})
  const body=await request.json()
  const payload={
    dataset_id:datasetId,
    project_id:ctx.dataset.project_id,
    technical_owner_user_id:body.technicalOwnerUserId||null,
    business_owner_user_id:body.businessOwnerUserId||null,
    steward_user_id:body.stewardUserId||null,
    lifecycle_status:String(body.lifecycleStatus||'ACTIVE').toUpperCase(),
    certification_status:String(body.certificationStatus||'UNCERTIFIED').toUpperCase(),
    criticality:String(body.criticality||'MEDIUM').toUpperCase(),
    tags:Array.isArray(body.tags)?body.tags.map(String).map((v:string)=>v.trim()).filter(Boolean):[],
    business_description:typeof body.businessDescription==='string'?body.businessDescription.trim()||null:null,
    retention_days:Number.isFinite(Number(body.retentionDays))?Number(body.retentionDays):null,
    metadata:body.metadata&&typeof body.metadata==='object'?body.metadata:{},
    certified_at:String(body.certificationStatus||'').toUpperCase()==='CERTIFIED'?new Date().toISOString():null,
    certified_by:String(body.certificationStatus||'').toUpperCase()==='CERTIFIED'?user.id:null,
    updated_at:new Date().toISOString(),
  }
  const {data,error}=await ctx.admin.schema('governance').from('dataset_catalog').upsert(payload,{onConflict:'dataset_id'}).select('*').single()
  if(error)return NextResponse.json({error:error.message},{status:400})
  await writeGovernanceAudit({projectId:ctx.dataset.project_id,actorUserId:user.id,eventType:'CATALOG_METADATA_UPDATED',entityType:'DATASET',entityId:datasetId,metadata:{lifecycle_status:payload.lifecycle_status,certification_status:payload.certification_status,criticality:payload.criticality,tags:payload.tags}})
  return NextResponse.json({catalog:data})
}
