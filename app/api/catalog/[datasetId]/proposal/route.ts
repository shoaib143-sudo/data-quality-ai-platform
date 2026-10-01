import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeDataset, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function record(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}

export async function POST(request:Request,{params}:{params:Promise<{datasetId:string}>}){
  try{
    const user=await requireApiUser()
    const {datasetId}=await params
    const {authorization,dataset}=await authorizeDataset(user.id,datasetId,'catalog.update')
    const body=record(await request.json())
    const proposed=record(body.proposed)
    if(!Object.keys(proposed).length)return NextResponse.json({error:'proposed metadata changes are required.'},{status:400})

    const admin=createAdminClient()
    const workflowKey='CATALOG_METADATA_CHANGE_APPROVAL'
    const entityType='DATASET'
    let {data:definition,error:defError}=await admin.schema('governance').from('workflow_definitions')
      .select('id,version').eq('project_id',authorization.projectId).eq('workflow_key',workflowKey).eq('entity_type',entityType).eq('enabled',true)
      .order('version',{ascending:false}).limit(1).maybeSingle()
    if(defError)throw new Error(defError.message)

    if(!definition){
      const created=await admin.schema('governance').from('workflow_definitions').insert({
        project_id:authorization.projectId,
        workflow_key:workflowKey,
        name:'Catalog metadata change approval',
        entity_type:entityType,
        version:1,
        steps:[{index:0,name:'Metadata change approval',capability:'policy.approve',description:'Review proposed governed catalog metadata changes before they are applied.'}],
        enabled:true,
        created_by:user.id,
      }).select('id,version').single()
      if(created.error||!created.data)throw new Error(created.error?.message??'Unable to provision metadata approval workflow.')
      definition=created.data
    }

    const existing=await admin.schema('governance').from('workflow_instances')
      .select('id,status,current_step,context').eq('workflow_definition_id',definition.id).eq('entity_type',entityType).eq('entity_id',datasetId)
      .eq('status','RUNNING').order('started_at',{ascending:false}).limit(1).maybeSingle()
    if(existing.error)throw new Error(existing.error.message)
    if(existing.data)return NextResponse.json({instanceId:existing.data.id,status:existing.data.status,reused:true},{status:200})

    const context={
      source:'CATALOG_METADATA_PROPOSAL',
      dataset_id:datasetId,
      dataset_name:dataset.name,
      proposed,
      requested_by:user.id,
      direct_mutation_performed:false,
    }
    const started=await admin.schema('governance').rpc('start_workflow',{
      p_definition_id:definition.id,p_entity_type:entityType,p_entity_id:datasetId,p_started_by:user.id,p_context:context,
    })
    if(started.error||!started.data)throw new Error(started.error?.message??'Unable to start metadata approval workflow.')

    await writeGovernanceAudit({
      projectId:authorization.projectId,actorUserId:user.id,eventType:'CATALOG_METADATA_CHANGE_PROPOSED',
      entityType,entityId:datasetId,correlationId:String(started.data),
      metadata:{workflow_instance_id:started.data,proposed_fields:Object.keys(proposed),direct_mutation_performed:false},
    })
    return NextResponse.json({instanceId:started.data,status:'RUNNING',reused:false},{status:201})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to propose catalog metadata change.'},{status:500})
  }
}
