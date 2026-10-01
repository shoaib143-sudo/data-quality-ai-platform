import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject,authorizationErrorResponse } from '@/lib/auth/authorize'
import { buildGovernanceDeploymentPlan,type GovernanceTargetObservedState } from '@/lib/governance-platform/planning/deployment-plan'
import { discoverGovernanceTargetStates } from '@/lib/governance-platform/planning/discovery'
import { simulateGovernanceDeployment } from '@/lib/governance-platform/planning/simulation'
import type { GovernanceDesiredState } from '@/lib/governance-platform/desired-state/model'
import { ensureGovernanceProvidersRegistered } from '@/lib/governance-platform/providers/informatica/bootstrap'

export async function POST(request:Request){
 try{
  const user=await requireApiUser()
  ensureGovernanceProvidersRegistered()
  const body=await request.json().catch(()=>null) as {desiredState?:GovernanceDesiredState;observedTargets?:GovernanceTargetObservedState[]}|null
  const desired=body?.desiredState
  if(!desired||!desired.projectId)return NextResponse.json({error:'desiredState.projectId is required.'},{status:400})
  await authorizeProject(user.id,desired.projectId,'catalog.read')
  const supplied=Array.isArray(body?.observedTargets)?body.observedTargets:null
  const observedTargets=supplied??await discoverGovernanceTargetStates(desired)
  const deployment=buildGovernanceDeploymentPlan(desired,observedTargets)
  return NextResponse.json({
   deployment,
   simulation:simulateGovernanceDeployment(deployment),
   observedStateSource:supplied?'SUPPLIED':'DISCOVERED',
  },{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to build governance deployment plan.'},{status:400})
 }
}
