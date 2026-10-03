import { getGovernanceProvider } from '../providers/registry.ts'
import { resolveProviderCapability } from '../providers/capability-resolver.ts'
import type { CapabilityMode } from '../providers/sdk/capability.ts'
import type { ExecutionResult } from '../providers/sdk/provider.ts'
import type { ProviderPlannedOperation } from '../planning/provider-plan.ts'
import { governanceEvidence } from '../evidence/model.ts'
import type { GovernanceEvidenceStore } from '../evidence/store.ts'
import type { GovernanceCheckpoint,GovernanceCheckpointStore } from './checkpoint.ts'
import { claimGovernanceOperation } from './checkpoint.ts'
import type { GovernedExecutionGateDependencies } from './governed-gate.ts'
import { evaluateGovernedExecutionGate } from './governed-gate.ts'
import { executeWithGovernanceRetry, type GovernanceRetryRuntime } from './retry-policy.ts'

const modeByKind:Record<string,CapabilityMode>={CREATE:'CREATE',UPDATE:'UPDATE',DELETE:'DELETE'}

export type GovernedProviderExecutionDependencies=GovernedExecutionGateDependencies&{
 retryRuntime?:GovernanceRetryRuntime
 checkpointStore?:GovernanceCheckpointStore
 evidenceStore?:GovernanceEvidenceStore
 approvalSatisfied?:boolean
}

function checkpointResult(checkpoint:GovernanceCheckpoint):ExecutionResult{
 return{
  operationId:checkpoint.operationId,
  status:checkpoint.status==='FAILED'?'FAILED':checkpoint.status==='PENDING'||checkpoint.status==='RUNNING'?'PENDING':'SUCCEEDED',
  providerObjectId:checkpoint.providerObjectId??undefined,
  providerJobId:checkpoint.providerJobId??undefined,
  evidence:checkpoint.executionEvidence,
 }
}

async function persistCheckpoint(store:GovernanceCheckpointStore|undefined,checkpoint:GovernanceCheckpoint|undefined,patch:Partial<GovernanceCheckpoint>){
 if(!store||!checkpoint)return null
 const next={...checkpoint,...patch,updatedAt:new Date().toISOString()}
 await store.put(next)
 return next
}

async function appendEvidence(store:GovernanceEvidenceStore|undefined,operation:ProviderPlannedOperation,result:ExecutionResult,verificationStatus:string|null,details:Record<string,unknown>){
 if(!store)return
 await store.append(governanceEvidence({
  projectId:operation.projectId,planId:operation.planId,deploymentId:operation.deploymentId??operation.planId,operationId:operation.operationId,
  provider:operation.provider,connectionId:operation.connectionId,idempotencyKey:operation.idempotencyKey,
  desiredStateFingerprint:operation.desiredStateFingerprint,executionStatus:result.status,verificationStatus,
  providerObjectId:result.providerObjectId??null,providerJobId:result.providerJobId??null,details,
 }))
}

export async function preflightGovernedProviderOperation(operation:ProviderPlannedOperation,dependencies:GovernedProviderExecutionDependencies){
 const provider=getGovernanceProvider(operation.provider)
 if(!provider)throw new Error(`Governance provider "${operation.provider}" is not registered.`)
 const resolution=resolveProviderCapability(await provider.capabilities(),operation.capability,modeByKind[operation.kind]??'READ')
 if(!resolution.executable)return{status:'BLOCKED_CAPABILITY' as const,resolution,provider}
 const gate=await evaluateGovernedExecutionGate({
  projectId:operation.projectId,actionKey:operation.capability,targetType:operation.object.type,
  requiredCapability:operation.requiredCapability,riskLevel:operation.kind==='DELETE'?'HIGH':'MEDIUM',confidence:1,
 },dependencies)
 if(gate.denied)return{status:'DENIED' as const,gate,resolution,provider}
 if(gate.requiresApproval&&!dependencies.approvalSatisfied)return{status:'APPROVAL_REQUIRED' as const,gate,resolution,provider}
 return{status:'READY' as const,gate,resolution,provider,approvalSatisfied:gate.requiresApproval&&dependencies.approvalSatisfied===true}
}

export type GovernanceOperationPreflight=Awaited<ReturnType<typeof preflightGovernedProviderOperation>>

export async function executeGovernedProviderOperation(operation:ProviderPlannedOperation,dependencies:GovernedProviderExecutionDependencies,prepared?:GovernanceOperationPreflight){
 const preflight=prepared??await preflightGovernedProviderOperation(operation,dependencies)
 if(preflight.status!=='READY')return preflight
 const {provider,gate,resolution}=preflight

 const claim=dependencies.checkpointStore
  ?await claimGovernanceOperation(dependencies.checkpointStore,{planId:operation.planId,operationId:operation.operationId,idempotencyKey:operation.idempotencyKey})
  :null

 if(claim?.resumeAction==='COMPLETE'){
  return{status:'VERIFIED' as const,resumed:true,checkpoint:claim.checkpoint,gate,resolution}
 }
 if(claim?.resumeAction==='FAILED'){
  return{status:'FAILED' as const,resumed:true,result:checkpointResult(claim.checkpoint),checkpoint:claim.checkpoint,gate,resolution}
 }
 if(claim?.resumeAction==='WAIT'){
  return{status:'PENDING' as const,resumed:true,resumeAction:'WAIT' as const,checkpoint:claim.checkpoint,gate,resolution}
 }

 let result:ExecutionResult
 let attempts=0
 let checkpoint=claim?.checkpoint

 if(claim?.resumeAction==='POLL'){
  if(!provider.status){
   return{status:'PENDING' as const,resumed:true,resumeAction:'POLL' as const,checkpoint:claim.checkpoint,gate,resolution}
  }
  result=await provider.status(operation,checkpointResult(claim.checkpoint))
  checkpoint=await persistCheckpoint(dependencies.checkpointStore,checkpoint,{
   status:result.status==='SUCCEEDED'?'SUCCEEDED':result.status==='FAILED'?'FAILED':'PENDING',
   providerObjectId:result.providerObjectId??checkpoint?.providerObjectId??null,
   providerJobId:result.providerJobId??checkpoint?.providerJobId??null,
   executionEvidence:result.evidence??checkpoint?.executionEvidence??{},
  })??checkpoint
 }else if(claim?.resumeAction==='VERIFY'){
  result=checkpointResult(claim.checkpoint)
 }else{
  const execution=await executeWithGovernanceRetry(()=>provider.execute(operation),dependencies.retryRuntime)
  attempts=execution.attempts
  result=execution.value
  checkpoint=await persistCheckpoint(dependencies.checkpointStore,checkpoint,{
   status:result.status==='SUCCEEDED'?'SUCCEEDED':result.status==='FAILED'?'FAILED':'PENDING',
   attempts:(checkpoint?.attempts??0)+Math.max(0,execution.attempts-1),
   providerObjectId:result.providerObjectId??null,providerJobId:result.providerJobId??null,
   executionEvidence:result.evidence??{},
  })??checkpoint
  await appendEvidence(dependencies.evidenceStore,operation,result,null,{phase:'EXECUTE',attempts:execution.attempts})
 }

 if(result.status==='PENDING')return{status:'PENDING' as const,result,attempts,gate,resolution}
 if(result.status==='FAILED')return{status:'FAILED' as const,result,attempts,gate,resolution}

 const verification=await provider.verify(operation,result)
 const verified=verification.status==='VERIFIED'
 checkpoint=await persistCheckpoint(dependencies.checkpointStore,checkpoint,{
  status:verified?'VERIFIED':'SUCCEEDED',verificationStatus:verification.status,
 })??checkpoint
 await appendEvidence(dependencies.evidenceStore,operation,result,verification.status,{phase:'VERIFY',verification})
 return{
  status:verified?'VERIFIED' as const:'VERIFICATION_REQUIRED' as const,
  result,verification,attempts,resumed:claim?.resumeAction==='VERIFY'||claim?.resumeAction==='POLL',checkpoint,gate,resolution,
 }
}
