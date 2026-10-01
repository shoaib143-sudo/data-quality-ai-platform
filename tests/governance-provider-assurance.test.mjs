import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyGovernanceReadback } from '../lib/governance-platform/verification/readback.ts'
import { claimGovernanceOperation } from '../lib/governance-platform/execution/checkpoint.ts'
import { governanceMcpFacade } from '../lib/governance-platform/mcp/facade.ts'

const object={id:'a',type:'TECHNICAL_ASSET',externalKey:'a',name:'A',projectId:'p',attributes:{},relationships:[],version:1}
const desired={apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'informatica',connectionId:'prod'}],objects:[object]}

test('readback verification detects mismatch and missing state',()=>{
 assert.equal(verifyGovernanceReadback(object,{...object,name:'B'}).status,'MISMATCH')
 assert.equal(verifyGovernanceReadback(object,null).status,'MISSING')
 assert.equal(verifyGovernanceReadback(object,{...object}).status,'VERIFIED')
})

test('checkpoint claim suppresses completed idempotent replay',async()=>{
 let current=null
 const store={get:async()=>current,put:async value=>{current=value}}
 const first=await claimGovernanceOperation(store,{planId:'plan',operationId:'op',idempotencyKey:'key'})
 assert.equal(first.claimed,true)
 current={...current,status:'VERIFIED'}
 const replay=await claimGovernanceOperation(store,{planId:'plan',operationId:'op',idempotencyKey:'key'})
 assert.equal(replay.claimed,false)
})

test('MCP facade enforces DataNexus project identity boundary',()=>{
 assert.throws(()=>governanceMcpFacade.plan({projectId:'other',principalId:'user'},desired,[]),/not bound/)
 assert.equal(governanceMcpFacade.plan({projectId:'p',principalId:'user'},desired,[]).projectId,'p')
})
