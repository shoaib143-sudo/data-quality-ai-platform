import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(v:unknown){return typeof v==='string'?v.trim():''}
function steps(v:unknown){return Array.isArray(v)?v.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)).map((item,index)=>({index,name:text((item as Record<string,unknown>).name)||`Step ${index+1}`,capability:text((item as Record<string,unknown>).capability)||'policy.approve',description:text((item as Record<string,unknown>).description)||null})) : []}

export async function POST(request:Request){
  try{
    const user=await requireUser()
    const body=await request.json()
    const projectId=text(body.projectId),workflowKey=text(body.workflowKey).toUpperCase().replace(/[^A-Z0-9_]+/g,'_'),name=text(body.name),entityType=text(body.entityType).toUpperCase()
    if(!projectId||!workflowKey||!name||!entityType)return NextResponse.json({error:'projectId, workflowKey, name and entityType are required.'},{status:400})
    await authorizeProject(user.id,projectId,'workflow.manage')
    const admin=createAdminClient()
    const {data:latest,error:latestError}=await admin.schema('governance').from('workflow_definitions').select('version').eq('project_id',projectId).eq('workflow_key',workflowKey).order('version',{ascending:false}).limit(1).maybeSingle()
    if(latestError)throw new Error(`Unable to resolve workflow history: ${latestError.message}`)
    const version=Number(latest?.version??0)+1
    const workflowSteps=steps(body.steps)
    if(!workflowSteps.length)return NextResponse.json({error:'At least one approval step is required.'},{status:400})
    const {data,error}=await admin.schema('governance').from('workflow_definitions').insert({project_id:projectId,workflow_key:workflowKey,name,entity_type:entityType,version,steps:workflowSteps,enabled:true,created_by:user.id}).select('*').single()
    if(error||!data)throw new Error(`Unable to create workflow definition: ${error?.message??'unknown error'}`)
    await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'WORKFLOW_DEFINITION_CREATED',entityType:'WORKFLOW_DEFINITION',entityId:data.id,metadata:{workflow_key:workflowKey,version,steps:workflowSteps}})
    return NextResponse.json({definition:data},{status:201})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to create workflow.'},{status:500})
  }
}
