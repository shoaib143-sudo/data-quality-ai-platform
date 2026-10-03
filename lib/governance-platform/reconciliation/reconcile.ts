import type { CanonicalGovernanceObject } from '../canonical/model.ts'
import type { GovernanceDesiredState } from '../desired-state/model.ts'
import { buildGovernancePlan } from '../planning/plan.ts'

export type ReconciliationStatus='IN_SYNC'|'DRIFTED'
export type GovernanceDriftMode='REPORT'|'RECOMMEND'|'AUTO_RECONCILE'

export function reconcileGovernanceState(
 desired:GovernanceDesiredState,
 actual:CanonicalGovernanceObject[],
 options:{mode?:GovernanceDriftMode}={},
){
 const mode=options.mode??'REPORT'
 const plan=buildGovernancePlan(desired,actual)
 const actionable=plan.operations.filter(operation=>operation.action!=='NOOP')
 const status=(actionable.length===0?'IN_SYNC':'DRIFTED') as ReconciliationStatus
 return{
  status,mode,plan,actionableOperations:actionable,
  recommendation:status==='DRIFTED'&&mode!=='REPORT'?'APPLY_PLAN' as const:null,
  autoReconcileRequested:status==='DRIFTED'&&mode==='AUTO_RECONCILE',
 }
}
