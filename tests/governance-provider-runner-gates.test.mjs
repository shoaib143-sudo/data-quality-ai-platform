import assert from 'node:assert/strict'
import test from 'node:test'
import { executeGovernedProviderOperation } from '../lib/governance-platform/execution/runner.ts'
import { registerGovernanceProvider,clearGovernanceProvidersForTests } from '../lib/governance-platform/providers/registry.ts'
import { GovernanceProviderError } from '../lib/governance-platform/providers/sdk/errors.ts'

const operation={provider:'test',connectionId:'c',planId:'p',operationId:'o',idempotencyKey:'i',desiredStateFingerprint:'f',projectId:'project',capability:'catalog.asset.create',kind:'CREATE',object:{id:'a',type:'TECHNICAL_ASSET',externalKey:'a',name:'A',projectId:'project',attributes:{},relationships:[],version:1},requiredCapability:'catalog.update',dependencies:[]}
const capability={capability:'catalog.asset.create',support:'FULL',modes:['CREATE'],consistency:'STRONG',execution:'SYNC',idempotency:'DATANEXUS_MANAGED',rollback:'NONE',verification:'READ_BACK'}
function deps(decision='ALLOW'){return{authorize:async()=>{},executionController:{assertAllowed:async()=>({decision:'RUNNING',scopes:[]})},policyDecisionProvider:{decide:async()=>({decision,providerId:'test',policyId:'p',policyVersionId:'v',authorityStatus:'ACTIVE',executionMode:decision==='ALLOW'?'AUTO':decision==='DENY'?'BLOCKED':'APPROVAL_REQUIRED',reversible:true,reason:'test'})}}}
function provider(result,verification={operationId:'o',status:'VERIFIED'}){let execute=0,verify=0;return{counts:()=>({execute,verify}),manifest:()=>({provider:'test',providerVersion:'1',canonicalSchemaVersion:'1',capabilities:[capability]}),capabilities:async()=>[capability],discover:async()=>({objects:[],observedAt:new Date().toISOString()}),execute:async()=>{execute++;return result},verify:async()=>{verify++;return verification}}}

test('runner never executes when policy denies or requires approval',async()=>{
 for(const decision of ['DENY','REQUIRE_APPROVAL']){
  clearGovernanceProvidersForTests();const p=provider({operationId:'o',status:'SUCCEEDED'});registerGovernanceProvider(p)
  const result=await executeGovernedProviderOperation(operation,deps(decision))
  assert.equal(result.status,decision==='DENY'?'DENIED':'APPROVAL_REQUIRED');assert.deepEqual(p.counts(),{execute:0,verify:0})
 }
})

test('runner does not verify failed or pending provider execution',async()=>{
 for(const status of ['FAILED','PENDING']){
  clearGovernanceProvidersForTests();const p=provider({operationId:'o',status});registerGovernanceProvider(p)
  const result=await executeGovernedProviderOperation(operation,deps())
  assert.equal(result.status,status);assert.deepEqual(p.counts(),{execute:1,verify:0})
 }
})

test('runner verifies successful synchronous execution exactly once',async()=>{
 clearGovernanceProvidersForTests();const p=provider({operationId:'o',status:'SUCCEEDED'});registerGovernanceProvider(p)
 const result=await executeGovernedProviderOperation(operation,deps())
 assert.equal(result.status,'VERIFIED');assert.deepEqual(p.counts(),{execute:1,verify:1})
})


test('runner owns retry authority and retries only normalized transient failures',async()=>{
 clearGovernanceProvidersForTests();let calls=0
 const p={manifest:()=>({provider:'test',providerVersion:'1',canonicalSchemaVersion:'1',capabilities:[capability]}),capabilities:async()=>[capability],discover:async()=>({objects:[],projections:[],observedAt:new Date().toISOString()}),execute:async()=>{calls++;if(calls<3)throw new GovernanceProviderError('TRANSIENT_FAILURE','temporary');return{operationId:'o',status:'SUCCEEDED'}},verify:async()=>({operationId:'o',status:'VERIFIED'})}
 registerGovernanceProvider(p)
 const result=await executeGovernedProviderOperation(operation,{...deps(),retryRuntime:{maxAttempts:3,sleep:async()=>{},random:()=>0}})
 assert.equal(result.status,'VERIFIED');assert.equal(result.attempts,3);assert.equal(calls,3)
})


test('runner fails closed on PAUSE and KILL execution controls before provider mutation',async()=>{
 for(const control of ['PAUSE','KILL']){
  clearGovernanceProvidersForTests()
  const p=provider({operationId:'o',status:'SUCCEEDED'})
  registerGovernanceProvider(p)
  const blocked={
   ...deps(),
   executionController:{assertAllowed:async()=>{throw new Error(`Execution blocked by ${control}`)}},
  }
  await assert.rejects(()=>executeGovernedProviderOperation(operation,blocked),new RegExp(control))
  assert.deepEqual(p.counts(),{execute:0,verify:0})
 }
 clearGovernanceProvidersForTests()
})
