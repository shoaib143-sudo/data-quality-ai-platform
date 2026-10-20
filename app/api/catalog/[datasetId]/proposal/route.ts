import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeDataset, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { publishGovernanceChangeAlert } from '@/lib/observability/governance-change-alert'

const allowedLifecycleStatuses=new Set(['DRAFT','ACTIVE','DEPRECATED','RETIRED'])
const allowedCriticalities=new Set(['LOW','MEDIUM','HIGH','CRITICAL'])
function record(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}
function text(value:unknown){return typeof value==='string'?value.trim():''}

async function resolveDefinition(admin:ReturnType<typeof createAdminClient>,projectId:string,userId:string){
  const workflowKey='CATALOG_METADATA_CHANGE_APPROVAL'
  const entityType='DATASET'
  let {data:definition,error:defError}=await admin.schema('governance').from('workflow_definitions')
    .select('id,version').eq('project_id',projectId).eq('workflow_key',workflowKey).eq('entity_type',entityType).eq('enabled',true)
    .order('version',{ascending:false}).limit(1).maybeSingle()
  if(defError)throw new Error(defError.message)
  if(definition)return definition

  const created=await admin.schema('governance').from('workflow_definitions').insert({
    project_id:projectId,
    workflow_key:workflowKey,
    name:'Catalog metadata change approval',
    entity_type:entityType,
    version:1,
    steps:[{index:0,name:'Metadata change approval',capability:'policy.approve',description:'Review proposed governed catalog metadata changes before they are applied.'}],
    enabled:true,
    created_by:userId,
  }).select('id,version').single()
  if(created.error||!created.data)throw new Error(created.error?.message??'Unable to provision metadata approval workflow.')
  return created.data
}

export async function GET(_request:Request,{params}:{params:Promise<{datasetId:string}>}){
  try{
    const user=await requireApiUser()
    const {datasetId}=await params
    const {authorization}=await authorizeDataset(user.id,datasetId,'catalog.read')
    const admin=createAdminClient()
    const {data:definition,error:defError}=await admin.schema('governance').from('workflow_definitions')
      .select('id').eq('project_id',authorization.projectId).eq('workflow_key','CATALOG_METADATA_CHANGE_APPROVAL').eq('entity_type','DATASET').eq('enabled',true)
      .order('version',{ascending:false}).limit(1).maybeSingle()
    if(defError)throw new Error(defError.message)
    if(!definition)return NextResponse.json({proposals:[]})
    const {data,error}=await admin.schema('governance').from('workflow_instances')
      .select('id,status,current_step,context,started_at,completed_at').eq('workflow_definition_id',definition.id).eq('entity_type','DATASET').eq('entity_id',datasetId)
      .order('started_at',{ascending:false}).limit(25)
    if(error)throw new Error(error.message)
    return NextResponse.json({proposals:data??[]})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to load catalog metadata proposals.'},{status:500})
  }
}

export async function POST(request:Request,{params}:{params:Promise<{datasetId:string}>}){
  try{
    const user=await requireApiUser()
    const {datasetId}=await params
    const {authorization,dataset}=await authorizeDataset(user.id,datasetId,'catalog.update')
    const body=record(await request.json())
    const action=(text(body.action)||'PROPOSE').toUpperCase()
    const admin=createAdminClient()

    if(action==='APPLY'){
      const instanceId=text(body.instanceId)
      if(!instanceId)return NextResponse.json({error:'instanceId is required.'},{status:400})
      const {data:instance,error:instanceError}=await admin.schema('governance').from('workflow_instances')
        .select('id,status,context,workflow_definition_id,entity_id').eq('id',instanceId).eq('entity_type','DATASET').eq('entity_id',datasetId).maybeSingle()
      if(instanceError)throw new Error(instanceError.message)
      if(!instance)return NextResponse.json({error:'Metadata proposal workflow not found.'},{status:404})
      const {data:def,error:defError}=await admin.schema('governance').from('workflow_definitions')
        .select('workflow_key').eq('id',instance.workflow_definition_id).maybeSingle()
      if(defError)throw new Error(defError.message)
      if(def?.workflow_key!=='CATALOG_METADATA_CHANGE_APPROVAL')return NextResponse.json({error:'Workflow is not a catalog metadata proposal.'},{status:409})
      if(instance.status!=='APPROVED')return NextResponse.json({error:'Metadata proposal must be approved before it can be applied.'},{status:409})
      const context=record(instance.context)
      if(context.applied_at)return NextResponse.json({status:'APPLIED',reused:true,catalog:context.applied_catalog??null})

      const restoreHistoryId=text(context.restore_history_id)
      if(context.source==='CATALOG_METADATA_HISTORY_RESTORE'){
        if(!restoreHistoryId)return NextResponse.json({error:'Approved restore workflow is missing restore history evidence.'},{status:409})
        const restored=await admin.schema('governance').rpc('restore_dataset_catalog_history',{p_history_id:restoreHistoryId,p_actor:user.id})
        if(restored.error)throw new Error(restored.error.message)
        const catalog=record(restored.data)
        const appliedAt=new Date().toISOString()
        const updatedContext={...context,applied_at:appliedAt,applied_by:user.id,direct_mutation_performed:true,applied_catalog:catalog}
        const {error:updateError}=await admin.schema('governance').from('workflow_instances').update({context:updatedContext}).eq('id',instanceId)
        if(updateError)throw new Error(updateError.message)
        const criticality=(text(catalog.criticality)||'MEDIUM').toUpperCase()
        const changeAlert=await publishGovernanceChangeAlert({
          projectId:authorization.projectId,
          datasetId,
          category:'METADATA_CHANGE',
          severity:['HIGH','CRITICAL'].includes(criticality)?'HIGH':'MEDIUM',
          title:`Approved metadata restore applied: ${dataset.name}`,
          description:`Approved metadata history restore applied version ${String(context.restore_version_number??'unknown')} for ${dataset.name}.`,
          fingerprint:`metadata-restore:${datasetId}:${instanceId}`,
          evidence:{workflow_instance_id:instanceId,restore_history_id:restoreHistoryId,restore_version_number:context.restore_version_number??null,authority:'APPROVED_GOVERNANCE_WORKFLOW'},
          notificationsEnvKey:'METADATA_CHANGE_NOTIFICATIONS_ENABLED',
        })
        return NextResponse.json({status:'APPLIED',reused:false,catalog,restored:true,changeAlert})
      }

      const proposed=record(context.proposed)
      const lifecycleStatus=(text(proposed.lifecycleStatus)||'ACTIVE').toUpperCase()
      const criticality=(text(proposed.criticality)||'MEDIUM').toUpperCase()
      if(!allowedLifecycleStatuses.has(lifecycleStatus))return NextResponse.json({error:'Approved proposal contains an invalid lifecycleStatus.'},{status:400})
      if(!allowedCriticalities.has(criticality))return NextResponse.json({error:'Approved proposal contains an invalid criticality.'},{status:400})

      const payload={
        dataset_id:datasetId,
        project_id:dataset.project_id,
        technical_owner_user_id:text(proposed.technicalOwnerUserId)||null,
        business_owner_user_id:text(proposed.businessOwnerUserId)||null,
        steward_user_id:text(proposed.stewardUserId)||null,
        lifecycle_status:lifecycleStatus,
        criticality,
        tags:Array.isArray(proposed.tags)?proposed.tags.map(String).map(value=>value.trim()).filter(Boolean):[],
        business_description:text(proposed.businessDescription)||null,
        retention_days:Number.isFinite(Number(proposed.retentionDays))?Number(proposed.retentionDays):null,
        metadata:record(proposed.metadata),
        updated_at:new Date().toISOString(),
      }
      const {data:catalog,error}=await admin.schema('governance').from('dataset_catalog').upsert(payload,{onConflict:'dataset_id'}).select('*').single()
      if(error||!catalog)throw new Error(error?.message??'Unable to apply approved metadata proposal.')

      const appliedAt=new Date().toISOString()
      const {error:updateError}=await admin.schema('governance').from('workflow_instances').update({context:{...context,applied_at:appliedAt,applied_by:user.id,direct_mutation_performed:true,applied_catalog:catalog}}).eq('id',instanceId)
      if(updateError)throw new Error(updateError.message)
      await writeGovernanceAudit({
        projectId:authorization.projectId,actorUserId:user.id,eventType:'CATALOG_METADATA_CHANGE_APPLIED',
        entityType:'DATASET',entityId:datasetId,correlationId:instanceId,
        metadata:{workflow_instance_id:instanceId,approved:true,applied_fields:Object.keys(proposed)},
      })
      const changeAlert=await publishGovernanceChangeAlert({
        projectId:authorization.projectId,
        datasetId,
        category:'METADATA_CHANGE',
        severity:['HIGH','CRITICAL'].includes(criticality)?'HIGH':'MEDIUM',
        title:`Approved metadata change applied: ${dataset.name}`,
        description:`An approved governed metadata proposal changed ${Object.keys(proposed).length} field(s) for ${dataset.name}.`,
        fingerprint:`metadata-change:${datasetId}:${instanceId}`,
        evidence:{workflow_instance_id:instanceId,applied_fields:Object.keys(proposed),criticality,authority:'APPROVED_GOVERNANCE_WORKFLOW'},
        notificationsEnvKey:'METADATA_CHANGE_NOTIFICATIONS_ENABLED',
      })
      return NextResponse.json({status:'APPLIED',reused:false,catalog,changeAlert})
    }

    if(action!=='PROPOSE')return NextResponse.json({error:'action must be PROPOSE or APPLY.'},{status:400})
    const proposed=record(body.proposed)
    if(!Object.keys(proposed).length)return NextResponse.json({error:'proposed metadata changes are required.'},{status:400})

    const definition=await resolveDefinition(admin,authorization.projectId,user.id)
    const existing=await admin.schema('governance').from('workflow_instances')
      .select('id,status,current_step,context').eq('workflow_definition_id',definition.id).eq('entity_type','DATASET').eq('entity_id',datasetId)
      .eq('status','RUNNING').order('started_at',{ascending:false}).limit(1).maybeSingle()
    if(existing.error)throw new Error(existing.error.message)
    if(existing.data)return NextResponse.json({instanceId:existing.data.id,status:existing.data.status,reused:true},{status:200})

    const context={source:'CATALOG_METADATA_PROPOSAL',dataset_id:datasetId,dataset_name:dataset.name,proposed,requested_by:user.id,direct_mutation_performed:false,applied_at:null}
    const started=await admin.schema('governance').rpc('start_workflow',{
      p_definition_id:definition.id,p_entity_type:'DATASET',p_entity_id:datasetId,p_started_by:user.id,p_context:context,
    })
    if(started.error||!started.data)throw new Error(started.error?.message??'Unable to start metadata approval workflow.')

    await writeGovernanceAudit({
      projectId:authorization.projectId,actorUserId:user.id,eventType:'CATALOG_METADATA_CHANGE_PROPOSED',
      entityType:'DATASET',entityId:datasetId,correlationId:String(started.data),
      metadata:{workflow_instance_id:started.data,proposed_fields:Object.keys(proposed),direct_mutation_performed:false},
    })
    return NextResponse.json({instanceId:started.data,status:'RUNNING',reused:false},{status:201})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to manage catalog metadata proposal.'},{status:500})
  }
}
