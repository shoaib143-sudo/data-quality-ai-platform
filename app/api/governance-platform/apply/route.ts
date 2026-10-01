import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject,authorizationErrorResponse } from '@/lib/auth/authorize'
import { createGovernanceExecutionController } from '@/lib/ai/governance-execution-controller'
import { createGovernancePolicyDecisionProvider } from '@/lib/governance/governance-policy-decision-provider'
import { buildGovernanceDeploymentPlan } from '@/lib/governance-platform/planning/deployment-plan'
import { discoverGovernanceTargetStates } from '@/lib/governance-platform/planning/discovery'
import { orderProviderGovernanceOperations } from '@/lib/governance-platform/planning/dependency-dag'
import { simulateGovernanceDeployment } from '@/lib/governance-platform/planning/simulation'
import { executeGovernedProviderOperation } from '@/lib/governance-platform/execution/runner'
import type { GovernanceDesiredState } from '@/lib/governance-platform/desired-state/model'

export async function POST(request:Request){
 try{
  const user=await requireApiUser()
  const body=await request.json().catch(()=>null) as {desiredState?:GovernanceDesiredState;expectedDeploymentFingerprint?:string;confirmDestructive?:boolean}|null
  const desired=body?.desiredState
  if(!desired||!desired.projectId)return NextResponse.json({error:'desiredState.projectId is required.'},{status:400})
  await authorizeProject(user.id,desired.projectId,'agent.execute')
  const observedTargets=await discoverGovernanceTargetStates(desired)
  const deployment=buildGovernanceDeploymentPlan(desired,observedTargets)
  const simulation=simulateGovernanceDeployment(deployment)
  const expected=body?.expectedDeploymentFingerprint?.trim()
  if(!expected||expected!==deployment.deploymentFingerprint){
   return NextResponse.json({
    error:'Governance deployment changed or was not preflighted. Re-plan and approve the current immutable deployment fingerprint.',
    code:'GOVERNANCE_DEPLOYMENT_FINGERPRINT_MISMATCH',
    deployment,simulation,
   },{status:409})
  }
  if(simulation.destructive&&body?.confirmDestructive!==true){
   return NextResponse.json({error:'Explicit destructive confirmation is required for a deployment containing DELETE operations.',code:'GOVERNANCE_DESTRUCTIVE_CONFIRMATION_REQUIRED',deployment,simulation},{status:409})
  }
  const operations=orderProviderGovernanceOperations(deployment.operations)
  const results:Record<string,unknown>[]=[]
  const byOperation=new Map<string,Record<string,unknown>>()
  const dependencies={
   authorize:(projectId:string,capability:Parameters<typeof authorizeProject>[2])=>authorizeProject(user.id,projectId,capability).then(()=>undefined),
   executionController:createGovernanceExecutionController(),
   policyDecisionProvider:createGovernancePolicyDecisionProvider(),
  }
  for(const operation of operations){
   const blockedBy=operation.dependencies.filter(id=>byOperation.get(id)?.status!=='VERIFIED')
   if(blockedBy.length){
    const result={operationId:operation.operationId,status:'BLOCKED_DEPENDENCY',blockedBy}
    byOperation.set(operation.operationId,result);results.push(result);continue
   }
   const result=await executeGovernedProviderOperation(operation,dependencies)
   const normalized={operationId:operation.operationId,provider:operation.provider,connectionId:operation.connectionId,...result}
   byOperation.set(operation.operationId,normalized);results.push(normalized)
  }
  return NextResponse.json({
   accepted:true,deploymentId:deployment.deploymentId,deploymentFingerprint:deployment.deploymentFingerprint,
   simulation,results,
  },{status:202,headers:{'Cache-Control':'private, no-store'}})
 }catch(error){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to apply governance deployment.'},{status:500})
 }
}
