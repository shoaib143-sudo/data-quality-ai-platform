import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
function text(v:unknown){return typeof v==='string'?v.trim():''}

export async function POST(request:Request){
  try{
    const user=await requireUser(),body=await request.json()
    const definitionId=text(body.definitionId),entityType=text(body.entityType).toUpperCase(),entityId=text(body.entityId)
    if(!definitionId||!entityType||!entityId)return NextResponse.json({error:'definitionId, entityType and entityId are required.'},{status:400})
    const admin=createAdminClient()
    const {data:def,error:defError}=await admin.schema('governance').from('workflow_definitions').select('id,project_id,workflow_key,entity_type,enabled').eq('id',definitionId).maybeSingle()
    if(defError||!def)return NextResponse.json({error:'Workflow definition not found.'},{status:404})
    await authorizeProject(user.id,def.project_id,'workflow.manage')
    if(!def.enabled)return NextResponse.json({error:'Workflow definition is disabled.'},{status:409})
    if(def.entity_type!==entityType)return NextResponse.json({error:'Workflow entity type does not match the definition.'},{status:400})
    const {data,error}=await admin.schema('governance').rpc('start_workflow',{p_definition_id:def.id,p_entity_type:entityType,p_entity_id:entityId,p_started_by:user.id,p_context:body.context&&typeof body.context==='object'?body.context:{}})
    if(error||!data)throw new Error(`Unable to start workflow: ${error?.message??'unknown error'}`)
    await writeGovernanceAudit({projectId:def.project_id,actorUserId:user.id,eventType:'WORKFLOW_STARTED',entityType,entityId,metadata:{workflow_instance_id:data,workflow_definition_id:def.id,workflow_key:def.workflow_key}})
    return NextResponse.json({instanceId:data},{status:201})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to start workflow.'},{status:500})
  }
}
