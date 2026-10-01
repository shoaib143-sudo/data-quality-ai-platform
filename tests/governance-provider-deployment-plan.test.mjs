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
 assert.equal(deployment.deploymentFingerprint.length,64)
})

test('deployment planner requires observed state for every target and rejects duplicates',()=>{
 assert.throws(()=>buildGovernanceDeploymentPlan(desired,[{provider:'informatica',connectionId:'prod',objects:[]}]),/required for target collibra::prod/)
 assert.throws(()=>buildGovernanceDeploymentPlan({...desired,targets:[desired.targets[0]]},[
  {provider:'informatica',connectionId:'prod',objects:[]},
  {provider:'INFORMATICA',connectionId:'prod',objects:[]},
 ]),/duplicates target/)
})
