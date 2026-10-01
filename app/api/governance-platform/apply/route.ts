import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import type { GovernanceDesiredState } from '@/lib/governance-platform/desired-state/model'
import { applyGovernanceDeploymentForPrincipal } from '@/lib/governance-platform/runtime/service'

export async function POST(request:Request){
 try{
  const user=await requireApiUser()
  const body=await request.json().catch(()=>null) as {desiredState?:GovernanceDesiredState;expectedDeploymentFingerprint?:string;confirmDestructive?:boolean}|null
  const desired=body?.desiredState
  if(!desired||!desired.projectId)return NextResponse.json({error:'desiredState.projectId is required.'},{status:400})
  const result=await applyGovernanceDeploymentForPrincipal({
   principalId:user.id,desired,
   expectedDeploymentFingerprint:body?.expectedDeploymentFingerprint?.trim()??'',
   confirmDestructive:body?.confirmDestructive===true,
  })
  if(!result.accepted)return NextResponse.json(result,{status:409,headers:{'Cache-Control':'private, no-store'}})
  return NextResponse.json(result,{status:202,headers:{'Cache-Control':'private, no-store'}})
 }catch(error){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to apply governance deployment.'},{status:500})
 }
}
