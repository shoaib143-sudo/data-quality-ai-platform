import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject,authorizationErrorResponse } from '@/lib/auth/authorize'
import { buildGovernancePlan } from '@/lib/governance-platform/planning/plan'
import { simulateGovernancePlan } from '@/lib/governance-platform/planning/simulation'
import type { GovernanceDesiredState } from '@/lib/governance-platform/desired-state/model'

export async function POST(request:Request){
 try{
  const user=await requireApiUser()
  const body=await request.json().catch(()=>null) as {desiredState?:GovernanceDesiredState;actual?:unknown}|null
  const desired=body?.desiredState
  if(!desired||!desired.projectId)return NextResponse.json({error:'desiredState.projectId is required.'},{status:400})
  await authorizeProject(user.id,desired.projectId,'catalog.read')
  const actual=Array.isArray(body?.actual)?body.actual:[]
  const plan=buildGovernancePlan(desired,actual as never[])
  return NextResponse.json({plan,simulation:simulateGovernancePlan(plan)})
 }catch(error){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to build governance plan.'},{status:400})
 }
}
