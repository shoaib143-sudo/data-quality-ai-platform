import assert from 'node:assert/strict'
import test from 'node:test'
import { executeGovernedProviderOperation } from '../lib/governance-platform/execution/runner.ts'
import { InMemoryGovernanceEvidenceStore } from '../lib/governance-platform/evidence/store.ts'
import { clearGovernanceProvidersForTests,registerGovernanceProvider } from '../lib/governance-platform/providers/registry.ts'

function dependencies(checkpointStore,evidenceStore){
 return{
  checkpointStore,evidenceStore,
  authorize:async()=>{},
  executionController:{assertAllowed:async()=>({mode:'RUNNING'})},
  policyDecisionProvider:{decide:async()=>({decision:'ALLOW',reason:'test'})},
  retryRuntime:{maxAttempts:1,sleep:async()=>{},random:()=>0.5},
 }
}
const operation={
 planId:'plan',operationId:'op',idempotencyKey:'idem',desiredStateFingerprint:'fingerprint',
 projectId:'project',provider:'fake',connectionId:'conn',capability:'catalog.asset.create',
 requiredCapability:'catalog.update',kind:'CREATE',
 object:{id:'asset',type:'TECHNICAL_ASSET',externalKey:'asset',name:'Asset',projectId:'project',attributes:{},relationships:[],version:1},
 dependencies:[],
}

test('durable runner resumes verified work without replaying provider mutation',async()=>{
 clearGovernanceProvidersForTests()
 let executes=0,stored=null
 registerGovernanceProvider({
  manifest:()=>({provider:'fake',providerVersion:'1',canonicalSchemaVersion:'1.0',capabilities:[{capability:'catalog.asset.create',support:'FULL',modes:['CREATE'],consistency:'STRONG',execution:'SYNC',idempotency:'DATANEXUS_MANAGED',rollback:'NONE',verification:'READ_BACK'}]}),
  capabilities:async function(){return this.manifest().capabilities},
  discover:async()=>({objects:[],projections:[],observedAt:new Date().toISOString()}),
  execute:async op=>{executes++;return{operationId:op.operationId,status:'SUCCEEDED',providerObjectId:'vendor-1',evidence:{receipt:'r1'}}},
  verify:async op=>({operationId:op.operationId,status:'VERIFIED'}),
 })
 const checkpointStore={get:async()=>stored,put:async value=>{stored=structuredClone(value)}}
 const evidenceStore=new InMemoryGovernanceEvidenceStore()
 const first=await executeGovernedProviderOperation(operation,dependencies(checkpointStore,evidenceStore))
 const second=await executeGovernedProviderOperation(operation,dependencies(checkpointStore,evidenceStore))
 assert.equal(first.status,'VERIFIED');assert.equal(second.status,'VERIFIED');assert.equal(second.resumed,true)
 assert.equal(executes,1);assert.equal(stored.status,'VERIFIED')
 const evidence=await evidenceStore.listByPlan('project','plan')
 assert.equal(evidence.length,2);assert.deepEqual(evidence.map(x=>x.details.phase),['EXECUTE','VERIFY'])
 clearGovernanceProvidersForTests()
})

test('pending async work never replays mutation when provider has no status poll contract',async()=>{
 clearGovernanceProvidersForTests()
 let executes=0,stored=null
 registerGovernanceProvider({
  manifest:()=>({provider:'fake',providerVersion:'1',canonicalSchemaVersion:'1.0',capabilities:[{capability:'catalog.asset.create',support:'FULL',modes:['CREATE'],consistency:'EVENTUAL',execution:'ASYNC',idempotency:'DATANEXUS_MANAGED',rollback:'NONE',verification:'JOB_STATUS'}]}),
  capabilities:async function(){return this.manifest().capabilities},
  discover:async()=>({objects:[],projections:[],observedAt:new Date().toISOString()}),
  execute:async op=>{executes++;return{operationId:op.operationId,status:'PENDING',providerJobId:'job-1'}},
  verify:async op=>({operationId:op.operationId,status:'PENDING'}),
 })
 const checkpointStore={get:async()=>stored,put:async value=>{stored=structuredClone(value)}}
 const first=await executeGovernedProviderOperation(operation,dependencies(checkpointStore,new InMemoryGovernanceEvidenceStore()))
 const second=await executeGovernedProviderOperation(operation,dependencies(checkpointStore,new InMemoryGovernanceEvidenceStore()))
 assert.equal(first.status,'PENDING');assert.equal(second.status,'PENDING');assert.equal(second.resumeAction,'POLL')
 assert.equal(executes,1)
 clearGovernanceProvidersForTests()
})
