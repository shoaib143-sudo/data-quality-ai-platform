import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGovernanceDeploymentPlan } from '../lib/governance-platform/planning/deployment-plan.ts'

const object={id:'asset-a',type:'TECHNICAL_ASSET',externalKey:'a',name:'A',projectId:'p',attributes:{},relationships:[],version:1}
const desired={apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'informatica',connectionId:'prod'},{provider:'collibra',connectionId:'prod'}],objects:[object]}

test('deployment planner computes drift independently for each provider target',()=>{
 const deployment=buildGovernanceDeploymentPlan(desired,[
  {provider:'informatica',connectionId:'prod',objects:[object],observedAt:'2026-10-01T00:00:00.000Z'},
  {provider:'collibra',connectionId:'prod',objects:[],observedAt:'2026-10-01T00:00:00.000Z'},
 ])
 const informatica=deployment.targets.find(value=>value.target.provider==='informatica')
 const collibra=deployment.targets.find(value=>value.target.provider==='collibra')
 assert.equal(informatica.plan.operations[0].action,'NOOP')
 assert.equal(informatica.operations.length,0)
 assert.equal(collibra.plan.operations[0].action,'CREATE')
 assert.equal(collibra.operations.length,1)
 assert.equal(deployment.operations.length,1)
 assert.equal(deployment.operations[0].deploymentId,deployment.deploymentId)
 assert.equal(deployment.deploymentFingerprint.length,64)
})

test('deployment planner requires observed state for every target and rejects duplicates',()=>{
 assert.throws(()=>buildGovernanceDeploymentPlan(desired,[{provider:'informatica',connectionId:'prod',objects:[]}]),/required for target collibra::prod/)
 assert.throws(()=>buildGovernanceDeploymentPlan({...desired,targets:[desired.targets[0]]},[
  {provider:'informatica',connectionId:'prod',objects:[]},
  {provider:'INFORMATICA',connectionId:'prod',objects:[]},
 ]),/duplicates target/)
})


test('deployment fingerprint is stable across equivalent observation timestamps',()=>{
 const state=time=>desired.targets.map(target=>({provider:target.provider,connectionId:target.connectionId,objects:[],observedAt:time}))
 assert.equal(buildGovernanceDeploymentPlan(desired,state('2026-10-01T00:00:00.000Z')).deploymentFingerprint,buildGovernanceDeploymentPlan(desired,state('2026-10-01T00:01:00.000Z')).deploymentFingerprint)
})


test('deployment identity is stable across equivalent target and object ordering',()=>{
 const second={id:'term-b',type:'BUSINESS_TERM',externalKey:'b',name:'B',projectId:'p',attributes:{},relationships:[],version:1}
 const a={...desired,objects:[object,second]}
 const b={...desired,targets:[...desired.targets].reverse(),objects:[second,object]}
 const observed=[
  {provider:'informatica',connectionId:'prod',objects:[]},
  {provider:'collibra',connectionId:'prod',objects:[]},
 ]
 const first=buildGovernanceDeploymentPlan(a,observed)
 const reordered=buildGovernanceDeploymentPlan(b,[...observed].reverse())
 assert.equal(first.desiredStateFingerprint,reordered.desiredStateFingerprint)
 assert.equal(first.deploymentFingerprint,reordered.deploymentFingerprint)
 assert.equal(first.deploymentId,reordered.deploymentId)
 assert.deepEqual(first.operations.map(value=>value.idempotencyKey),reordered.operations.map(value=>value.idempotencyKey))
})
