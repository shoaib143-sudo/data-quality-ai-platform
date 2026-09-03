import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
function text(v:unknown){return typeof v==='string'?v.trim():''}

export async function PATCH(request:Request,{params}:{params:Promise<{instanceId:string}>}){
  try{
    const user=await requireUser(),{instanceId}=await params,body=await request.json(),admin=createAdminClient()
    const {data:instance,error:instanceError}=await admin.schema('governance').from('workflow_instances').select('id,project_id,workflow_definition_id,entity_type,entity_id,status,current_step').eq('id',instanceId).maybeSingle()
    if(instanceError||!instance)return NextResponse.json({error:'Workflow instance not found.'},{status:404})
    const {data:def,error:defError}=await admin.schema('governance').from('workflow_definitions').select('steps').eq('id',instance.workflow_definition_id).maybeSingle()
    if(defError||!def)throw new Error('Workflow definition is unavailable.')
    const workflowSteps=Array.isArray(def.steps)?def.steps as Record<string,unknown>[]:[]
    const current=workflowSteps[Number(instance.current_step)]??{}
    const capability=text(current.capability)||'workflow.manage'
    await authorizeProject(user.id,instance.project_id,capability as any)
    const action=text(body.action).toUpperCase()
    if(!['APPROVE','REJECT','COMMENT','CANCEL'].includes(action))return NextResponse.json({error:'Invalid workflow action.'},{status:400})
    const {data,error}=await admin.schema('governance').rpc('act_workflow',{p_instance_id:instanceId,p_actor_user_id:user.id,p_action:action,p_notes:text(body.notes)||null,p_evidence:body.evidence&&typeof body.evidence==='object'?body.evidence:{}})
    if(error)throw new Error(`Unable to apply workflow action: ${error.message}`)
    await writeGovernanceAudit({projectId:instance.project_id,actorUserId:user.id,eventType:`WORKFLOW_${action}`,entityType:instance.entity_type,entityId:instance.entity_id,metadata:{workflow_instance_id:instanceId,step_index:instance.current_step,result:data}})
    return NextResponse.json({result:data})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to act on workflow.'},{status:500})
  }
}
