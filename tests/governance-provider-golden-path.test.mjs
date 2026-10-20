import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGovernanceDeploymentPlan } from '../lib/governance-platform/planning/deployment-plan.ts'
import { discoverGovernanceTargetStates } from '../lib/governance-platform/planning/discovery.ts'
import { simulateGovernanceDeployment } from '../lib/governance-platform/planning/simulation.ts'
import { reconcileGovernanceState } from '../lib/governance-platform/reconciliation/reconcile.ts'
import { executeGovernedProviderOperation,preflightGovernedProviderOperation } from '../lib/governance-platform/execution/runner.ts'
import { InMemoryGovernanceEvidenceStore } from '../lib/governance-platform/evidence/store.ts'
import { clearGovernanceProvidersForTests,registerGovernanceProvider } from '../lib/governance-platform/providers/registry.ts'

const desiredObject={
 id:'asset-customer',type:'TECHNICAL_ASSET',externalKey:'customer',name:'Customer',
 projectId:'project-1',attributes:{domain:'crm'},relationships:[],version:1,
}
const desired={
 apiVersion:'datanexus.io/governance/v1',projectId:'project-1',
 targets:[{provider:'fixture',connectionId:'governed'}],objects:[desiredObject],
}
const capability={
 capability:'catalog.asset.create',support:'FULL',modes:['CREATE'],
 consistency:'STRONG',execution:'SYNC',idempotency:'DATANEXUS_MANAGED',
 rollback:'NONE',verification:'READ_BACK',
}

test('governance provider Golden Path reaches verified reconciliation with evidence',async()=>{
 clearGovernanceProvidersForTests()
 let actual=[]
 let mutations=0
 registerGovernanceProvider({
  manifest:()=>({provider:'fixture',providerVersion:'1',canonicalSchemaVersion:'1.0',capabilities:[capability]}),
  capabilities:async()=>[capability],
  discover:async request=>({
   objects:structuredClone(actual),
   projections:actual.map(object=>({
    provider:'fixture',connectionId:request.connectionId,canonicalObjectId:object.id,
    providerObjectId:`provider:${object.externalKey}`,lastObservedFingerprint:'f'.repeat(64),
    lastObservedAt:new Date().toISOString(),syncState:'IN_SYNC',
   })),
   observedAt:new Date().toISOString(),
  }),
  execute:async operation=>{
   mutations++
   actual=[structuredClone(operation.object)]
   return{operationId:operation.operationId,status:'SUCCEEDED',providerObjectId:`provider:${operation.object.externalKey}`,evidence:{receipt:'fixture-1'}}
  },
  verify:async operation=>{
   const observed=actual.find(object=>object.id===operation.object.id)
   return{operationId:operation.operationId,status:observed?.name===operation.object.name?'VERIFIED':'MISMATCH',observed}
  },
 })

 const observed=await discoverGovernanceTargetStates(desired)
 const deployment=buildGovernanceDeploymentPlan(desired,observed)
 const simulation=simulateGovernanceDeployment(deployment)
 assert.equal(simulation.creates,1)
 assert.equal(simulation.destructive,false)

 const evidenceStore=new InMemoryGovernanceEvidenceStore()
 const dependencies={
  evidenceStore,
  authorize:async()=>{},
  executionController:{assertAllowed:async()=>({mode:'RUNNING'})},
  policyDecisionProvider:{decide:async()=>({decision:'ALLOW',reason:'golden-path'})},
 }
 const operation=deployment.operations[0]
 const preflight=await preflightGovernedProviderOperation(operation,dependencies)
 assert.equal(preflight.status,'READY')
 const executed=await executeGovernedProviderOperation(operation,dependencies,preflight)
 assert.equal(executed.status,'VERIFIED')
 assert.equal(mutations,1)

 const evidence=await evidenceStore.listByDeployment('project-1',deployment.deploymentId)
 assert.deepEqual(evidence.map(record=>record.details.phase),['EXECUTE','VERIFY'])

 const readback=(await discoverGovernanceTargetStates(desired))[0].objects
 const reconciliation=reconcileGovernanceState(desired,readback)
 assert.equal(reconciliation.status,'IN_SYNC')
 assert.equal(reconciliation.actionableOperations.length,0)
 clearGovernanceProvidersForTests()
})
