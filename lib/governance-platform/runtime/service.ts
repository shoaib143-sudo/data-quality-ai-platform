import { authorizeProject } from '../../auth/authorize.ts'
import { createGovernanceExecutionController } from '../../ai/governance-execution-controller.ts'
import { createGovernancePolicyDecisionProvider } from '../../governance/governance-policy-decision-provider.ts'
import { createAgentApprovalRequest,currentExecutionFingerprint,markApprovalExecuted,validateApprovalForExecution } from '../../governance/agent-approval-service.ts'
import type { GovernanceDesiredState } from '../desired-state/model.ts'
import { validateGovernanceDesiredState } from '../desired-state/validate.ts'
import { executeGovernedProviderOperation,preflightGovernedProviderOperation } from '../execution/runner.ts'
import { SupabaseGovernanceCheckpointStore,SupabaseGovernanceEvidenceStore } from '../execution/supabase-store.ts'
import { orderProviderGovernanceOperations } from '../planning/dependency-dag.ts'
import { buildGovernanceDeploymentPlan } from '../planning/deployment-plan.ts'
import { discoverGovernanceTargetStates } from '../planning/discovery.ts'
import { simulateGovernanceDeployment } from '../planning/simulation.ts'
import { ensureGovernanceProvidersRegistered } from '../providers/informatica/bootstrap.ts'
import { SupabaseGovernanceProjectionStore } from '../projections/store.ts'

async function persistDiscoveredGovernanceProjections(projectId:string,observedTargets:Awaited<ReturnType<typeof discoverGovernanceTargetStates>>){
 const observations=observedTargets.flatMap(target=>(target.projections??[]).map(projection=>({
  projectId,provider:target.provider,connectionId:target.connectionId,projection,
 })))
 await new SupabaseGovernanceProjectionStore().upsertObservations(observations)
}

function requireGovernanceDesiredState(input:unknown):GovernanceDesiredState{
 const validated=validateGovernanceDesiredState(input)
 if(!validated.ok)throw new Error(`Invalid governance desired state: ${validated.errors.join(' ')}`)
 return validated.value
}

export async function planGovernanceDeploymentForPrincipal(principalId:string,desired:GovernanceDesiredState){
 const desiredState=requireGovernanceDesiredState(desired)
 await authorizeProject(principalId,desiredState.projectId,'catalog.read')
 ensureGovernanceProvidersRegistered()
 const observedTargets=await discoverGovernanceTargetStates(desiredState)
 await persistDiscoveredGovernanceProjections(desiredState.projectId,observedTargets)
 const deployment=buildGovernanceDeploymentPlan(desiredState,observedTargets)
 return{deployment,simulation:simulateGovernanceDeployment(deployment),observedStateSource:'DISCOVERED' as const}
}

export async function verifyGovernanceDeploymentForPrincipal(principalId:string,desired:GovernanceDesiredState){
 const planned=await planGovernanceDeploymentForPrincipal(principalId,desired)
 return{status:planned.deployment.operations.length===0?'IN_SYNC' as const:'DRIFTED' as const,...planned}
}

export async function governanceDeploymentStatusForPrincipal(principalId:string,projectId:string,deploymentId:string){
 await authorizeProject(principalId,projectId,'execution.view_evidence')
 const evidence=await new SupabaseGovernanceEvidenceStore().listByDeployment(projectId,deploymentId)
 return{projectId,deploymentId,evidence}
}

export async function applyGovernanceDeploymentForPrincipal(input:{
 principalId:string
 desired:GovernanceDesiredState
 expectedDeploymentFingerprint:string
 confirmDestructive:boolean
 approvalRequestId?:string|null
}){
 const desired=requireGovernanceDesiredState(input.desired)
 await authorizeProject(input.principalId,desired.projectId,'agent.execute')
 ensureGovernanceProvidersRegistered()
 const observedTargets=await discoverGovernanceTargetStates(desired)
 await persistDiscoveredGovernanceProjections(desired.projectId,observedTargets)
 const deployment=buildGovernanceDeploymentPlan(desired,observedTargets)
 const simulation=simulateGovernanceDeployment(deployment)
 if(!input.expectedDeploymentFingerprint||input.expectedDeploymentFingerprint!==deployment.deploymentFingerprint){
  return{accepted:false as const,code:'GOVERNANCE_DEPLOYMENT_FINGERPRINT_MISMATCH' as const,deployment,simulation}
 }
 if(simulation.destructive&&!input.confirmDestructive){
  return{accepted:false as const,code:'GOVERNANCE_DESTRUCTIVE_CONFIRMATION_REQUIRED' as const,deployment,simulation}
 }
 const operations=orderProviderGovernanceOperations(deployment.operations)
 const results:Record<string,unknown>[]=[]
 const byOperation=new Map<string,Record<string,unknown>>()
 const checkpointStore=new SupabaseGovernanceCheckpointStore(desired.projectId)
 const evidenceStore=new SupabaseGovernanceEvidenceStore()
 const approvalParameters={
  desiredState:desired,
  expectedDeploymentFingerprint:deployment.deploymentFingerprint,
  confirmDestructive:input.confirmDestructive,
 }
 let approvalSatisfied=false
 const approvalRequestId=input.approvalRequestId?.trim()||null
 if(approvalRequestId){
  const currentFingerprint=await currentExecutionFingerprint({requestId:approvalRequestId,parameters:approvalParameters})
  const validatedApproval=await validateApprovalForExecution({
   requestId:approvalRequestId,executorUserId:input.principalId,currentFingerprint,
   expectedActionKey:'APPLY_GOVERNANCE_DEPLOYMENT',
  })
  const humanApprovalRequired=validatedApproval.requires_business_approval===true||validatedApproval.requires_governance_approval===true
  if(!humanApprovalRequired)throw new Error('A policy-required governance deployment cannot be resumed without human approval evidence.')
  approvalSatisfied=true
 }
 const dependencies={
  checkpointStore,evidenceStore,approvalSatisfied,
  authorize:(projectId:string,capability:Parameters<typeof authorizeProject>[2])=>authorizeProject(input.principalId,projectId,capability).then(()=>undefined),
  executionController:createGovernanceExecutionController(),
  policyDecisionProvider:createGovernancePolicyDecisionProvider(),
 }
 const preflight=[]
 for(const operation of operations){
  const result=await preflightGovernedProviderOperation(operation,dependencies)
  preflight.push({operationId:operation.operationId,provider:operation.provider,connectionId:operation.connectionId,result})
 }
 const approvalRequired=preflight.filter(value=>value.result.status==='APPROVAL_REQUIRED')
 const blocked=preflight.filter(value=>value.result.status!=='READY'&&value.result.status!=='APPROVAL_REQUIRED')
 if(blocked.length){
  return{accepted:false as const,code:'GOVERNANCE_PREFLIGHT_BLOCKED' as const,deployment,simulation,preflight}
 }
 if(approvalRequired.length){
  const requested=await createAgentApprovalRequest({
   requestedBy:input.principalId,actionKey:'APPLY_GOVERNANCE_DEPLOYMENT',projectId:desired.projectId,
   parameters:approvalParameters,
  })
  return{
   accepted:false as const,code:'GOVERNANCE_APPROVAL_REQUIRED' as const,deployment,simulation,preflight,
   approvalRequestId:String(requested.approval.id),approvalStatus:String(requested.approval.status),
  }
 }
 const preparedByOperation=new Map(preflight.map(value=>[value.operationId,value.result]))
 for(const operation of operations){
  const blockedBy=operation.dependencies.filter(id=>byOperation.get(id)?.status!=='VERIFIED')
  if(blockedBy.length){
   const result={operationId:operation.operationId,status:'BLOCKED_DEPENDENCY',blockedBy}
   byOperation.set(operation.operationId,result);results.push(result);continue
  }
  const result=await executeGovernedProviderOperation(operation,dependencies,preparedByOperation.get(operation.operationId))
  const normalized={operationId:operation.operationId,provider:operation.provider,connectionId:operation.connectionId,...result}
  byOperation.set(operation.operationId,normalized);results.push(normalized)
  if(result.status==='APPROVAL_REQUIRED'){
   const requested=await createAgentApprovalRequest({
    requestedBy:input.principalId,actionKey:'APPLY_GOVERNANCE_DEPLOYMENT',projectId:desired.projectId,
    parameters:approvalParameters,
   })
   return{
    accepted:false as const,code:'GOVERNANCE_APPROVAL_REQUIRED_DURING_EXECUTION' as const,
    deployment,simulation,preflight,results,
    approvalRequestId:String(requested.approval.id),approvalStatus:String(requested.approval.status),
   }
  }
  if(result.status==='DENIED'||result.status==='BLOCKED_CAPABILITY'){
   return{
    accepted:false as const,code:'GOVERNANCE_EXECUTION_REVALIDATION_BLOCKED' as const,
    deployment,simulation,preflight,results,
   }
  }
 }
 const verified=results.length===operations.length&&results.every(result=>result.status==='VERIFIED')
 if(approvalRequestId&&verified)await markApprovalExecuted(approvalRequestId)
 return{accepted:true as const,deploymentId:deployment.deploymentId,deploymentFingerprint:deployment.deploymentFingerprint,simulation,results,approvalRequestId}
}
