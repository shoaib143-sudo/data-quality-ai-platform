import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { publishGovernanceChangeAlert } from '@/lib/observability/governance-change-alert'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function text(v:unknown){return typeof v==='string'?v.trim():''}
function record(v:unknown){return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}}

async function definitionFor(admin:ReturnType<typeof createAdminClient>,projectId:string,userId:string){
  const workflowKey='LINEAGE_MANUAL_CORRECTION'
  const entityType='LINEAGE_CORRECTION'
  let {data,error}=await admin.schema('governance').from('workflow_definitions').select('id,version').eq('project_id',projectId).eq('workflow_key',workflowKey).eq('entity_type',entityType).eq('enabled',true).order('version',{ascending:false}).limit(1).maybeSingle()
  if(error)throw new Error(error.message)
  if(data)return data
  const created=await admin.schema('governance').from('workflow_definitions').insert({
    project_id:projectId,workflow_key:workflowKey,name:'Manual lineage correction approval',entity_type:entityType,version:1,
    steps:[{index:0,name:'Lineage correction approval',capability:'policy.approve',description:'Review the proposed manual source-to-target lineage correction before it becomes governed lineage evidence.'}],
    enabled:true,created_by:userId,
  }).select('id,version').single()
  if(created.error||!created.data)throw new Error(created.error?.message??'Unable to provision lineage correction workflow.')
  return created.data
}

export async function GET(request:NextRequest){
  try{
    const user=await requireApiUser()
    const projectId=text(request.nextUrl.searchParams.get('projectId'))
    if(!UUID.test(projectId))return NextResponse.json({error:'Valid projectId is required.'},{status:400})
    await authorizeProject(user.id,projectId,'lineage.read')
    const admin=createAdminClient()
    const def=await admin.schema('governance').from('workflow_definitions').select('id').eq('project_id',projectId).eq('workflow_key','LINEAGE_MANUAL_CORRECTION').eq('entity_type','LINEAGE_CORRECTION').eq('enabled',true).order('version',{ascending:false}).limit(1).maybeSingle()
    if(def.error)throw new Error(def.error.message)
    const [assets,instances]=await Promise.all([
      admin.schema('governance').from('lineage_assets').select('id,namespace,name,asset_type,last_seen_at').eq('project_id',projectId).order('name').limit(1000),
      def.data?.id?admin.schema('governance').from('workflow_instances').select('id,status,current_step,context,started_at,completed_at').eq('workflow_definition_id',def.data.id).order('started_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
    ])
    if(assets.error)throw new Error(assets.error.message)
    if(instances.error)throw new Error(instances.error.message)
    return NextResponse.json({assets:assets.data??[],corrections:instances.data??[]})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to load lineage corrections.'},{status:500})
  }
}

export async function POST(request:Request){
  try{
    const user=await requireApiUser()
    const body=record(await request.json())
    const action=text(body.action).toUpperCase()
    const admin=createAdminClient()

    if(action==='PROPOSE'){
      const projectId=text(body.projectId)
      const sourceAssetId=text(body.sourceAssetId)
      const targetAssetId=text(body.targetAssetId)
      const relationship=(text(body.relationship)||'TRANSFORMS_TO').toUpperCase().slice(0,100)
      const note=text(body.note).slice(0,1000)
      const sourceColumn=text(body.sourceColumn).slice(0,512)
      const targetColumn=text(body.targetColumn).slice(0,512)
      const expression=text(body.expression).slice(0,20000)
      if(!UUID.test(projectId)||!UUID.test(sourceAssetId)||!UUID.test(targetAssetId))return NextResponse.json({error:'Valid project and lineage asset IDs are required.'},{status:400})
      if(sourceAssetId===targetAssetId)return NextResponse.json({error:'Source and target lineage assets must differ.'},{status:400})
      if(!note)return NextResponse.json({error:'A correction rationale is required.'},{status:400})
      if(Boolean(sourceColumn)!==Boolean(targetColumn))return NextResponse.json({error:'sourceColumn and targetColumn must be provided together.'},{status:400})
      await authorizeProject(user.id,projectId,'lineage.manage')
      const assets=await admin.schema('governance').from('lineage_assets').select('id,name,namespace').eq('project_id',projectId).in('id',[sourceAssetId,targetAssetId])
      if(assets.error)throw new Error(assets.error.message)
      if((assets.data??[]).length!==2)return NextResponse.json({error:'Source or target lineage asset is outside this project.'},{status:400})
      const def=await definitionFor(admin,projectId,user.id)
      const correctionId=crypto.randomUUID()
      const context={source:'MANUAL_LINEAGE_CORRECTION',source_asset_id:sourceAssetId,target_asset_id:targetAssetId,source_column:sourceColumn||null,target_column:targetColumn||null,expression:expression||null,relationship,note,requested_by:user.id,applied_at:null,production_mutation_performed:false}
      const started=await admin.schema('governance').rpc('start_workflow',{p_definition_id:def.id,p_entity_type:'LINEAGE_CORRECTION',p_entity_id:correctionId,p_started_by:user.id,p_context:context})
      if(started.error||!started.data)throw new Error(started.error?.message??'Unable to start correction approval workflow.')
      await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'LINEAGE_MANUAL_CORRECTION_PROPOSED',entityType:'LINEAGE_CORRECTION',entityId:correctionId,correlationId:String(started.data),metadata:{workflow_instance_id:started.data,source_asset_id:sourceAssetId,target_asset_id:targetAssetId,relationship,production_mutation_performed:false}})
      return NextResponse.json({instanceId:started.data,correctionId,status:'RUNNING'},{status:201})
    }

    if(action==='APPLY'){
      const instanceId=text(body.instanceId)
      if(!UUID.test(instanceId))return NextResponse.json({error:'Valid workflow instance ID is required.'},{status:400})
      const instance=await admin.schema('governance').from('workflow_instances').select('id,project_id,status,context,entity_id,workflow_definition_id').eq('id',instanceId).maybeSingle()
      if(instance.error)throw new Error(instance.error.message)
      if(!instance.data)return NextResponse.json({error:'Correction workflow not found.'},{status:404})
      await authorizeProject(user.id,instance.data.project_id,'lineage.manage')
      const def=await admin.schema('governance').from('workflow_definitions').select('workflow_key,entity_type').eq('id',instance.data.workflow_definition_id).maybeSingle()
      if(def.error)throw new Error(def.error.message)
      if(def.data?.workflow_key!=='LINEAGE_MANUAL_CORRECTION'||def.data?.entity_type!=='LINEAGE_CORRECTION')return NextResponse.json({error:'Workflow is not a lineage correction workflow.'},{status:409})
      if(instance.data.status!=='APPROVED')return NextResponse.json({error:'Lineage correction must be approved before it can be applied.'},{status:409})
      const context=record(instance.data.context)
      if(context.applied_at)return NextResponse.json({status:'APPLIED',reused:true,edgeId:context.applied_edge_id??null})
      const sourceId=text(context.source_asset_id),targetId=text(context.target_asset_id),relationship=text(context.relationship)
      const assets=await admin.schema('governance').from('lineage_assets').select('id,name,dataset_id').eq('project_id',instance.data.project_id).in('id',[sourceId,targetId])
      if(assets.error)throw new Error(assets.error.message)
      const applied=await admin.schema('governance').rpc('upsert_manual_lineage_edge',{p_project_id:instance.data.project_id,p_actor:user.id,p_source_type:'EXTERNAL_ASSET',p_source_id:sourceId,p_target_type:'EXTERNAL_ASSET',p_target_id:targetId,p_relationship:relationship,p_metadata:{correction_workflow_instance_id:instanceId,correction_id:instance.data.entity_id,correction_note:context.note??null,authority:'HUMAN_APPROVED_MANUAL'}})
      if(applied.error)throw new Error(applied.error.message)
      const result=record(applied.data)
      const sourceColumn=text(context.source_column)
      const targetColumn=text(context.target_column)
      let columnMapping:Record<string,unknown>|null=null
      if(sourceColumn&&targetColumn){
        const mapped=await admin.schema('governance').rpc('upsert_manual_lineage_column_mapping',{
          p_project_id:instance.data.project_id,
          p_actor:user.id,
          p_workflow_instance_id:instanceId,
          p_source_asset_id:sourceId,
          p_source_column:sourceColumn,
          p_target_asset_id:targetId,
          p_target_column:targetColumn,
          p_operation:relationship,
          p_expression:text(context.expression)||null,
          p_metadata:{correction_id:instance.data.entity_id,correction_note:context.note??null,authority:'HUMAN_APPROVED_MANUAL'},
        })
        if(mapped.error)throw new Error(mapped.error.message)
        columnMapping=record(mapped.data)
      }
      const updatedContext={...context,applied_at:new Date().toISOString(),applied_by:user.id,applied_edge_id:result.id??null,applied_column_mapping_id:columnMapping?.mapping_id??null,production_mutation_performed:true}
      const updated=await admin.schema('governance').from('workflow_instances').update({context:updatedContext}).eq('id',instanceId)
      if(updated.error)throw new Error(updated.error.message)

      const datasetIds=[...new Set((assets.data??[]).map(asset=>asset.dataset_id).filter((value):value is string=>typeof value==='string'&&Boolean(value)))]
      const sourceName=String((assets.data??[]).find(asset=>asset.id===sourceId)?.name??sourceId)
      const targetName=String((assets.data??[]).find(asset=>asset.id===targetId)?.name??targetId)
      const changeAlerts=[]
      for(const datasetId of datasetIds){
        changeAlerts.push(await publishGovernanceChangeAlert({
          projectId:instance.data.project_id,
          datasetId,
          category:'LINEAGE_CHANGE',
          severity:'MEDIUM',
          title:'Approved lineage correction applied',
          description:`Approved manual lineage evidence changed ${sourceName} → ${targetName} (${relationship}).`,
          fingerprint:`lineage-change:${datasetId}:${instanceId}`,
          evidence:{workflow_instance_id:instanceId,source_asset_id:sourceId,target_asset_id:targetId,relationship,authority:'HUMAN_APPROVED_MANUAL'},
          notificationsEnvKey:'LINEAGE_CHANGE_NOTIFICATIONS_ENABLED',
        }))
      }
      return NextResponse.json({status:'APPLIED',reused:false,edgeId:result.id??null,columnMapping,changeAlerts})
    }

    return NextResponse.json({error:'action must be PROPOSE or APPLY.'},{status:400})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Lineage correction failed.'},{status:500})
  }
}
