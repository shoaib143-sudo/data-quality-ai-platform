import type { GovernancePlan } from './plan'

export type GovernanceSimulationSummary={
 total:number;creates:number;updates:number;deletes:number;noops:number;destructive:boolean
}

export function simulateGovernancePlan(plan:GovernancePlan):GovernanceSimulationSummary{
 const count=(action:string)=>plan.operations.filter(operation=>operation.action===action).length
 const deletes=count('DELETE')
 return{total:plan.operations.length,creates:count('CREATE'),updates:count('UPDATE'),deletes,noops:count('NOOP'),destructive:deletes>0}
}
