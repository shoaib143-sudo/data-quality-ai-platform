import type { CanonicalGovernanceObject } from '../canonical/model'
import type { GovernanceDesiredState } from '../desired-state/model'
import { buildGovernancePlan } from '../planning/plan'
import { reconcileGovernanceState } from '../reconciliation/reconcile'

export type GovernanceMcpContext={projectId:string;principalId:string}
function assertProject(context:GovernanceMcpContext,projectId:string){if(context.projectId!==projectId)throw new Error('MCP principal is not bound to the requested DataNexus project.')}

export const governanceMcpFacade={
 plan(context:GovernanceMcpContext,desired:GovernanceDesiredState,actual:CanonicalGovernanceObject[]){assertProject(context,desired.projectId);return buildGovernancePlan(desired,actual)},
 verify(context:GovernanceMcpContext,desired:GovernanceDesiredState,actual:CanonicalGovernanceObject[]){assertProject(context,desired.projectId);return reconcileGovernanceState(desired,actual)},
}
