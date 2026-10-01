import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGovernancePlan } from '../lib/governance-platform/planning/plan.ts'
import { expandGovernancePlanForProviders } from '../lib/governance-platform/planning/provider-plan.ts'
import { reconcileGovernanceState } from '../lib/governance-platform/reconciliation/reconcile.ts'

const object={id:'a',type:'TECHNICAL_ASSET',externalKey:'a',name:'A',projectId:'p',attributes:{},relationships:[],version:1}
const desired={apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'informatica',connectionId:'prod'},{provider:'collibra',connectionId:'prod'}],objects:[object]}

test('plan expands deterministically across provider targets with scoped idempotency',()=>{
 const plan=buildGovernancePlan(desired,[])
 const operations=expandGovernancePlanForProviders(plan,desired)
 assert.equal(operations.length,2)
 assert.notEqual(operations[0].idempotencyKey,operations[1].idempotencyKey)
 assert.equal(operations[0].requiredCapability,'catalog.update')
 assert.equal(operations[0].capability,'catalog.asset.create')
})

test('reconciler reports drift then converges to in sync',()=>{
 assert.equal(reconcileGovernanceState(desired,[]).status,'DRIFTED')
 assert.equal(reconcileGovernanceState(desired,[object]).status,'IN_SYNC')
})

test('absence remains unmanaged rather than destructive',()=>{
 assert.equal(reconcileGovernanceState({...desired,objects:[]},[object]).status,'IN_SYNC')
})
