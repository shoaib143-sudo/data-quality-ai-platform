import { authorizeProject } from '../../auth/authorize'
import { createGovernanceExecutionController } from '../../ai/governance-execution-controller'
import { createGovernancePolicyDecisionProvider } from '../../governance/governance-policy-decision-provider'
import type { GovernanceDesiredState } from '../desired-state/model'
import { executeGovernedProviderOperation } from '../execution/runner'
import { SupabaseGovernanceEvidenceStore } from '../execution/supabase-store'
import { orderProviderGovernanceOperations } from '../planning/dependency-dag'
import { buildGovernanceDeploymentPlan } from '../planning/deployment-plan'
import { discoverGovernanceTargetStates } from '../planning/discovery'
import { simulateGovernanceDeployment } from '../planning/simulation'
import { ensureGovernanceProvidersRegistered } from '../providers/informatica/bootstrap'

export async function planGovernanceDeploymentForPrincipal(principalId:string,desired:GovernanceDesiredState){
 await authorizeProject(principalId,desired.projectId,'catalog.read')
 ensureGovernanceProvidersRegistered()
 const observedTargets=await discoverGovernanceTargetStates(desired)
 const deployment=buildGovernanceDeploymentPlan(desired,observedTargets)
 return{deployment,simulation:simulateGovernanceDeployment(deployment),observedStateSource:'DISCOVERED' as const}
}

export async function verifyGovernanceDeploymentForPrincipal(principalId:string,desired:GovernanceDesiredState){
 const planned=await planGovernanceDeploymentForPrincipal(principalId,desired)
 return{status:planned.deployment.operations.length===0?'IN_SYNC' as const:'DRIFTED' as const,...planned}
}

export async function governanceDeploymentStatusForPrincipal(principalId:string,projectId:string,planId:string){
 await authorizeProject(principalId,projectId,'execution.view_evidence')
 const evidence=await new SupabaseGovernanceEvidenceStore().listByPlan(projectId,planId)
 return{projectId,planId,evidence}
}

export async function applyGovernanceDeploymentForPrincipal(input:{
 principalId:string
 desired:GovernanceDesiredState
 expectedDeploymentFingerprint:string
 confirmDestructive:boolean
}){
 await authorizeProject(input.principalId,input.desired.projectId,'agent.execute')
 ensureGovernanceProvidersRegistered()
 const observedTargets=await discoverGovernanceTargetStates(input.desired)
 const deployment=buildGovernanceDeploymentPlan(input.desired,observedTargets)
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
 const dependencies={
  authorize:(projectId:string,capability:Parameters<typeof authorizeProject>[2])=>authorizeProject(input.principalId,projectId,capability).then(()=>undefined),
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
 return{accepted:true as const,deploymentId:deployment.deploymentId,deploymentFingerprint:deployment.deploymentFingerprint,simulation,results}
}
