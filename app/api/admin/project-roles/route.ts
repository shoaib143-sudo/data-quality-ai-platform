import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value:unknown){return typeof value==='string'?value.trim():''}

async function validateTarget(admin:ReturnType<typeof createAdminClient>,projectId:string,targetUserId:string,roleKey:string){
  const {data:project,error:projectError}=await admin.schema('app').from('projects').select('id,organization_id').eq('id',projectId).maybeSingle()
  if(projectError||!project)throw new Error(`Unable to resolve project: ${projectError?.message??'not found'}`)
  const [{data:member,error:memberError},{data:role,error:roleError}]=await Promise.all([
    admin.schema('app').from('organization_members').select('user_id').eq('organization_id',project.organization_id).eq('user_id',targetUserId).maybeSingle(),
    admin.schema('governance').from('access_roles').select('role_key,name').eq('role_key',roleKey).maybeSingle(),
  ])
  if(memberError)throw new Error(`Unable to validate project member: ${memberError.message}`)
  if(roleError)throw new Error(`Unable to validate governance role: ${roleError.message}`)
  if(!member)throw new AuthorizationError('Governance roles can only be assigned to members of the project organization.',400)
  if(!role)throw new AuthorizationError('Governance role was not found.',400)
  return {project,role}
}

export async function POST(request:Request){
  try{
    const user=await requireUser()
    const body=await request.json()
    const projectId=text(body.projectId);const targetUserId=text(body.userId);const roleKey=text(body.roleKey).toUpperCase()
    if(!projectId||!targetUserId||!roleKey)return NextResponse.json({error:'projectId, userId and roleKey are required.'},{status:400})
    await authorizeProject(user.id,projectId,'admin.manage')
    const admin=createAdminClient();const {role}=await validateTarget(admin,projectId,targetUserId,roleKey)
    const {data,error}=await admin.schema('governance').from('project_role_bindings').upsert({
      project_id:projectId,user_id:targetUserId,role_key:roleKey,active:true,assigned_by:user.id,assigned_at:new Date().toISOString(),expires_at:null,
    },{onConflict:'project_id,user_id,role_key'}).select('*').single()
    if(error)throw new Error(`Unable to assign governance role: ${error.message}`)
    await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'PROJECT_GOVERNANCE_ROLE_ASSIGNED',entityType:'PROJECT',entityId:projectId,metadata:{target_user_id:targetUserId,role_key:roleKey,role_name:role.name,binding_id:data.id}})
    return NextResponse.json({binding:data},{status:201})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to assign project governance role.'},{status:500})
  }
}

export async function DELETE(request:Request){
  try{
    const user=await requireUser()
    const body=await request.json()
    const projectId=text(body.projectId);const targetUserId=text(body.userId);const roleKey=text(body.roleKey).toUpperCase()
    if(!projectId||!targetUserId||!roleKey)return NextResponse.json({error:'projectId, userId and roleKey are required.'},{status:400})
    await authorizeProject(user.id,projectId,'admin.manage')
    const admin=createAdminClient();await validateTarget(admin,projectId,targetUserId,roleKey)
    const {data,error}=await admin.schema('governance').from('project_role_bindings').update({active:false,expires_at:new Date().toISOString()}).eq('project_id',projectId).eq('user_id',targetUserId).eq('role_key',roleKey).select('id').maybeSingle()
    if(error)throw new Error(`Unable to revoke governance role: ${error.message}`)
    if(!data)return NextResponse.json({error:'Project governance role binding was not found.'},{status:404})
    await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'PROJECT_GOVERNANCE_ROLE_REVOKED',entityType:'PROJECT',entityId:projectId,metadata:{target_user_id:targetUserId,role_key:roleKey,binding_id:data.id}})
    return NextResponse.json({revoked:true})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to revoke project governance role.'},{status:500})
  }
}
