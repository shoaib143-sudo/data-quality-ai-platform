import type { GovernancePlan } from './plan.ts'
import type { GovernanceDeploymentPlan } from './deployment-plan.ts'

export type GovernanceSimulationSummary={
 total:number;creates:number;updates:number;deletes:number;noops:number;destructive:boolean
}

export function simulateGovernancePlan(plan:GovernancePlan):GovernanceSimulationSummary{
 const count=(action:string)=>plan.operations.filter(operation=>operation.action===action).length
 const deletes=count('DELETE')
 return{total:plan.operations.length,creates:count('CREATE'),updates:count('UPDATE'),deletes,noops:count('NOOP'),destructive:deletes>0}
}

export function simulateGovernanceDeployment(deployment:GovernanceDeploymentPlan):GovernanceSimulationSummary{
 const summaries=deployment.targets.map(target=>simulateGovernancePlan(target.plan))
 const sum=(key:'total'|'creates'|'updates'|'deletes'|'noops')=>summaries.reduce((total,value)=>total+value[key],0)
 const deletes=sum('deletes')
 return{total:sum('total'),creates:sum('creates'),updates:sum('updates'),deletes,noops:sum('noops'),destructive:deletes>0}
}
