import type { GovernanceDesiredState } from '../desired-state/model'
import { buildGovernanceDeploymentPlan,type GovernanceTargetObservedState } from '../planning/deployment-plan'

export type GovernanceMcpContext={projectId:string;principalId:string}
function assertProject(context:GovernanceMcpContext,projectId:string){if(context.projectId!==projectId)throw new Error('MCP principal is not bound to the requested DataNexus project.')}

export const governanceMcpFacade={
 plan(context:GovernanceMcpContext,desired:GovernanceDesiredState,observedTargets:GovernanceTargetObservedState[]){
  assertProject(context,desired.projectId)
  return buildGovernanceDeploymentPlan(desired,observedTargets)
 },
 verify(context:GovernanceMcpContext,desired:GovernanceDesiredState,observedTargets:GovernanceTargetObservedState[]){
  assertProject(context,desired.projectId)
  const deployment=buildGovernanceDeploymentPlan(desired,observedTargets)
  return{status:deployment.operations.length===0?'IN_SYNC' as const:'DRIFTED' as const,deployment}
 },
}
