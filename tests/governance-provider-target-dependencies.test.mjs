import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGovernancePlan } from '../lib/governance-platform/planning/plan.ts'
import { expandGovernancePlanForProviders } from '../lib/governance-platform/planning/provider-plan.ts'
import { orderProviderGovernanceOperations } from '../lib/governance-platform/planning/dependency-dag.ts'

test('provider expansion keeps dependencies inside each provider target',()=>{
 const parent={id:'parent',type:'TECHNICAL_ASSET',externalKey:'parent',name:'Parent',projectId:'p',attributes:{},relationships:[],version:1}
 const child={id:'child',type:'TECHNICAL_ASSET',externalKey:'child',name:'Child',projectId:'p',attributes:{},relationships:[{type:'DEPENDS_ON',targetId:'parent'}],version:1}
 const desired={apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'informatica',connectionId:'one'},{provider:'informatica',connectionId:'two'}],objects:[parent,child]}
 const operations=expandGovernancePlanForProviders(buildGovernancePlan(desired,[]),desired)
 const children=operations.filter(x=>x.object.id==='child'),parents=operations.filter(x=>x.object.id==='parent')
 assert.equal(children.length,2)
 for(const childOp of children){const parentOp=parents.find(x=>x.connectionId===childOp.connectionId);assert.deepEqual(childOp.dependencies,[parentOp.operationId])}
 assert.notEqual(children[0].operationId,children[1].operationId)
 const ordered=orderProviderGovernanceOperations([...operations].reverse())
 for(const childOp of children){
  const parentOp=parents.find(x=>x.connectionId===childOp.connectionId)
  assert.ok(ordered.indexOf(parentOp)<ordered.indexOf(childOp))
 }
})

test('provider dependency ordering fails closed on missing or cross-target dependencies',()=>{
 const base={provider:'informatica',connectionId:'one',operationId:'a',dependencies:[],object:{externalKey:'a'}}
 assert.throws(()=>orderProviderGovernanceOperations([{...base,operationId:'b',dependencies:['missing']}]),/missing dependency/)
 const other={...base,connectionId:'two',operationId:'a'}
 assert.throws(()=>orderProviderGovernanceOperations([other,{...base,operationId:'b',dependencies:['a']}]),/cannot cross provider targets/)
})
