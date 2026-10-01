import { getGovernanceProvider } from '../providers/registry'
import { resolveProviderCapability } from '../providers/capability-resolver'
import type { CapabilityMode } from '../providers/sdk/capability'
import type { ProviderPlannedOperation } from '../planning/provider-plan'
import type { GovernedExecutionGateDependencies } from './governed-gate'
import { evaluateGovernedExecutionGate } from './governed-gate'
import { executeWithGovernanceRetry, type GovernanceRetryRuntime } from './retry-policy'

const modeByKind:Record<string,CapabilityMode>={CREATE:'CREATE',UPDATE:'UPDATE',DELETE:'DELETE'}

export type GovernedProviderExecutionDependencies=GovernedExecutionGateDependencies&{retryRuntime?:GovernanceRetryRuntime}

export async function executeGovernedProviderOperation(operation:ProviderPlannedOperation, dependencies:GovernedProviderExecutionDependencies){
  const provider=getGovernanceProvider(operation.provider)
  if(!provider) throw new Error(`Governance provider "${operation.provider}" is not registered.`)
  const resolution=resolveProviderCapability(await provider.capabilities(),operation.capability,modeByKind[operation.kind] ?? 'READ')
  if(!resolution.executable) return {status:'BLOCKED_CAPABILITY' as const,resolution}
  const gate=await evaluateGovernedExecutionGate({
    projectId:operation.projectId, actionKey:operation.capability, targetType:operation.object.type,
    requiredCapability:operation.requiredCapability, riskLevel:operation.kind==='DELETE'?'HIGH':'MEDIUM', confidence:1,
  },dependencies)
  if(gate.denied) return {status:'DENIED' as const,gate,resolution}
  if(gate.requiresApproval) return {status:'APPROVAL_REQUIRED' as const,gate,resolution}
  const execution=await executeWithGovernanceRetry(()=>provider.execute(operation),dependencies.retryRuntime)
  const result=execution.value
  if(result.status==='PENDING') return {status:'PENDING' as const,result,attempts:execution.attempts,gate,resolution}
  if(result.status==='FAILED') return {status:'FAILED' as const,result,attempts:execution.attempts,gate,resolution}
  const verification=await provider.verify(operation,result)
  return {status:verification.status==='VERIFIED'?'VERIFIED' as const:'VERIFICATION_REQUIRED' as const,result,verification,attempts:execution.attempts,gate,resolution}
}
