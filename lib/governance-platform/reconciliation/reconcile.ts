import type { CanonicalGovernanceObject } from '../canonical/model'
import type { GovernanceDesiredState } from '../desired-state/model'
import { buildGovernancePlan } from '../planning/plan'

export type ReconciliationStatus='IN_SYNC'|'DRIFTED'

export function reconcileGovernanceState(desired:GovernanceDesiredState, actual:CanonicalGovernanceObject[]){
  const plan=buildGovernancePlan(desired,actual)
  const actionable=plan.operations.filter(operation=>operation.action!=='NOOP')
  return {status:(actionable.length===0?'IN_SYNC':'DRIFTED') as ReconciliationStatus,plan,actionableOperations:actionable}
}
