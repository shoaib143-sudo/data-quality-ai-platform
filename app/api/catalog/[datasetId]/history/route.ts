import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeDataset, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request:NextRequest,{params}:{params:Promise<{datasetId:string}>}){
  try{
    const user=await requireApiUser()
    const {datasetId}=await params
    await authorizeDataset(user.id,datasetId,'catalog.read')
    const admin=createAdminClient()
    const {data,error}=await admin.schema('governance').from('dataset_catalog_history')
      .select('id,dataset_id,project_id,version_number,change_type,snapshot,created_at')
      .eq('dataset_id',datasetId).order('version_number',{ascending:false}).limit(100)
    if(error){
      if(error.code==='42P01'||/dataset_catalog_history/i.test(error.message))return NextResponse.json({versions:[],available:false})
      throw new Error(error.message)
    }
    return NextResponse.json({versions:data??[],available:true})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to load catalog metadata history.'},{status:500})
  }
}

export async function POST(request:Request,{params}:{params:Promise<{datasetId:string}>}){
  try{
    const user=await requireApiUser()
    const {datasetId}=await params
    const {authorization,dataset}=await authorizeDataset(user.id,datasetId,'catalog.update')
    const body=await request.json()
    const historyId=typeof body.historyId==='string'?body.historyId.trim():''
    if(!UUID.test(historyId))return NextResponse.json({error:'Valid historyId is required.'},{status:400})
    const admin=createAdminClient()
    const {data:history,error:historyError}=await admin.schema('governance').from('dataset_catalog_history')
      .select('id,dataset_id,project_id,version_number,snapshot')
      .eq('id',historyId).eq('dataset_id',datasetId).maybeSingle()
    if(historyError)throw new Error(historyError.message)
    if(!history)return NextResponse.json({error:'Catalog metadata history version was not found for this dataset.'},{status:404})

    let {data:definition,error:defError}=await admin.schema('governance').from('workflow_definitions')
      .select('id,version').eq('project_id',authorization.projectId).eq('workflow_key','CATALOG_METADATA_CHANGE_APPROVAL').eq('entity_type','DATASET').eq('enabled',true)
      .order('version',{ascending:false}).limit(1).maybeSingle()
    if(defError)throw new Error(defError.message)
    if(!definition){
      const created=await admin.schema('governance').from('workflow_definitions').insert({
        project_id:authorization.projectId,
        workflow_key:'CATALOG_METADATA_CHANGE_APPROVAL',
        name:'Catalog metadata change approval',
        entity_type:'DATASET',
        version:1,
        steps:[{index:0,name:'Metadata change approval',capability:'policy.approve',description:'Review proposed governed catalog metadata changes before they are applied.'}],
        enabled:true,
        created_by:user.id,
      }).select('id,version').single()
      if(created.error||!created.data)throw new Error(created.error?.message??'Unable to provision metadata approval workflow.')
      definition=created.data
    }

    const running=await admin.schema('governance').from('workflow_instances')
      .select('id,status').eq('workflow_definition_id',definition.id).eq('entity_type','DATASET').eq('entity_id',datasetId)
      .eq('status','RUNNING').order('started_at',{ascending:false}).limit(1).maybeSingle()
    if(running.error)throw new Error(running.error.message)
    if(running.data)return NextResponse.json({error:'Another metadata change is already awaiting approval for this dataset.',instanceId:running.data.id},{status:409})

    const context={
      source:'CATALOG_METADATA_HISTORY_RESTORE',
      dataset_id:datasetId,
      dataset_name:dataset.name,
      restore_history_id:history.id,
      restore_version_number:history.version_number,
      requested_by:user.id,
      direct_mutation_performed:false,
      applied_at:null,
    }
    const started=await admin.schema('governance').rpc('start_workflow',{
      p_definition_id:definition.id,p_entity_type:'DATASET',p_entity_id:datasetId,p_started_by:user.id,p_context:context,
    })
    if(started.error||!started.data)throw new Error(started.error?.message??'Unable to start metadata restore approval workflow.')

    await writeGovernanceAudit({
      projectId:authorization.projectId,actorUserId:user.id,eventType:'CATALOG_METADATA_RESTORE_PROPOSED',
      entityType:'DATASET',entityId:datasetId,correlationId:String(started.data),
      metadata:{workflow_instance_id:started.data,history_id:history.id,version_number:history.version_number,direct_mutation_performed:false},
    })
    return NextResponse.json({instanceId:started.data,status:'RUNNING',restoreHistoryId:history.id,restoreVersionNumber:history.version_number},{status:201})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to restore catalog metadata version.'},{status:500})
  }
}
