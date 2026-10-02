import assert from 'node:assert/strict'
import test from 'node:test'
import { governanceResumeAction,claimGovernanceOperation } from '../lib/governance-platform/execution/checkpoint.ts'

const base={planId:'p',operationId:'o',idempotencyKey:'i',attempts:1,providerJobId:null,updatedAt:new Date().toISOString()}
test('checkpoint resumes verification after success rather than replaying mutation',()=>{assert.equal(governanceResumeAction({...base,status:'SUCCEEDED'}),'VERIFY')})
test('checkpoint polls durable provider jobs and completes only verified work',()=>{assert.equal(governanceResumeAction({...base,status:'PENDING',providerJobId:'job'}),'POLL');assert.equal(governanceResumeAction({...base,status:'VERIFIED'}),'COMPLETE')})
test('claim does not increment attempts when verification is pending',async()=>{
 let stored={...base,status:'SUCCEEDED'};const store={get:async()=>stored,put:async value=>{stored=value}}
 const result=await claimGovernanceOperation(store,{planId:'p',operationId:'o',idempotencyKey:'i'})
 assert.equal(result.claimed,false);assert.equal(result.resumeAction,'VERIFY');assert.equal(stored.attempts,1)
})


test('checkpoint retains provider result needed for verification-only resume',async()=>{
 let stored={...base,status:'SUCCEEDED',providerObjectId:'vendor-1',providerJobId:null,executionEvidence:{receipt:'r1'},verificationStatus:null}
 const store={get:async()=>stored,put:async value=>{stored=value}}
 const result=await claimGovernanceOperation(store,{planId:'p',operationId:'o',idempotencyKey:'i'})
 assert.equal(result.resumeAction,'VERIFY');assert.equal(result.checkpoint.providerObjectId,'vendor-1');assert.deepEqual(result.checkpoint.executionEvidence,{receipt:'r1'})
})


test('active atomic claim waits instead of executing the provider twice',async()=>{
 const checkpoint={planId:'p',operationId:'o',idempotencyKey:'k',status:'RUNNING',attempts:1,providerObjectId:null,providerJobId:null,executionEvidence:{},verificationStatus:null,updatedAt:new Date().toISOString()}
 let gets=0,puts=0
 const store={get:async()=>{gets++;return checkpoint},put:async()=>{puts++},claim:async()=>({claimed:false,resumeAction:'WAIT',checkpoint})}
 const claim=await claimGovernanceOperation(store,{planId:'p',operationId:'o',idempotencyKey:'k'})
 assert.equal(claim.claimed,false);assert.equal(claim.resumeAction,'WAIT');assert.equal(gets,0);assert.equal(puts,0)
})
