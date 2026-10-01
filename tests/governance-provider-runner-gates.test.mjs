import assert from 'node:assert/strict'
import test from 'node:test'
import { executeGovernedProviderOperation } from '../lib/governance-platform/execution/runner.ts'
import { registerGovernanceProvider,clearGovernanceProvidersForTests } from '../lib/governance-platform/providers/registry.ts'

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
