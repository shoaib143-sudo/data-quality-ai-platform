import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import type { GovernanceDesiredState } from '@/lib/governance-platform/desired-state/model'
import { planGovernanceDeploymentForPrincipal } from '@/lib/governance-platform/runtime/service'

export async function POST(request:Request){
 try{
  const user=await requireApiUser()
  const body=await request.json().catch(()=>null) as {desiredState?:GovernanceDesiredState}|null
  const desired=body?.desiredState
  if(!desired||!desired.projectId)return NextResponse.json({error:'desiredState.projectId is required.'},{status:400})
  const result=await planGovernanceDeploymentForPrincipal(user.id,desired)
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to build governance deployment plan.'},{status:400})
 }
}
