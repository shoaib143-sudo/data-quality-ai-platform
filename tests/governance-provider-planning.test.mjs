import assert from 'node:assert/strict'
import test from 'node:test'

import { governanceDesiredStateFingerprint,stableGovernanceFingerprint } from '../lib/governance-platform/planning/fingerprint.ts'
import { buildGovernancePlan } from '../lib/governance-platform/planning/plan.ts'
import { validateGovernanceDesiredState } from '../lib/governance-platform/desired-state/validate.ts'
import { resolveGovernanceAuthorizationCapability } from '../lib/governance-platform/authorization/capabilities.ts'

const base = {
  id: 'term-customer',
  type: 'BUSINESS_TERM',
  externalKey: 'customer',
  name: 'Customer',
  projectId: 'project-1',
  attributes: {},
  relationships: [],
  version: 1,
}

test('fingerprints are stable across object key ordering', () => {
  assert.equal(
    stableGovernanceFingerprint({ a: 1, b: { c: 2, d: 3 } }),
    stableGovernanceFingerprint({ b: { d: 3, c: 2 }, a: 1 }),
  )
})

test('desired-state validation rejects cross-project objects and duplicate targets', () => {
  const result = validateGovernanceDesiredState({
    apiVersion: 'datanexus.io/governance/v1',
    projectId: 'project-1',
    targets: [
      { provider: 'informatica', connectionId: 'prod' },
      { provider: 'INFORMATICA', connectionId: 'prod' },
    ],
    objects: [{ ...base, projectId: 'project-2' }],
  })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /duplicates target/)
  assert.match(result.errors.join(' '), /must match desired-state projectId/)
})

test('plan generation is deterministic and absence never deletes provider state', () => {
  const desiredState = {
    apiVersion: 'datanexus.io/governance/v1',
    projectId: 'project-1',
    targets: [{ provider: 'informatica', connectionId: 'prod' }],
    objects: [base],
  }
  const first = buildGovernancePlan(desiredState, [])
  const second = buildGovernancePlan(desiredState, [])
  assert.deepEqual(first, second)
  assert.equal(first.operations[0].action, 'CREATE')

  const noDelete = buildGovernancePlan({ ...desiredState, objects: [] }, [base])
  assert.equal(noDelete.operations.length, 0)
})

test('explicit deletes run dependents and relationship-removal updates before referenced objects',()=>{
 const parent={id:'parent',type:'TECHNICAL_ASSET',externalKey:'parent',name:'Parent',projectId:'project-1',attributes:{},relationships:[],version:1}
 const childActual={id:'child',type:'TECHNICAL_ASSET',externalKey:'child',name:'Child',projectId:'project-1',attributes:{},relationships:[{type:'DEPENDS_ON',targetId:'parent'}],version:1}
 const desired={
  apiVersion:'datanexus.io/governance/v1',projectId:'project-1',targets:[{provider:'fake',connectionId:'c'}],
  objects:[{...parent,state:'absent'},{...childActual,relationships:[]}],
 }
 const plan=buildGovernancePlan(desired,[parent,childActual])
 const parentDelete=plan.operations.find(operation=>operation.objectId==='parent')
 const childUpdate=plan.operations.find(operation=>operation.objectId==='child')
 assert.equal(parentDelete.action,'DELETE')
 assert.equal(childUpdate.action,'UPDATE')
 assert.deepEqual(parentDelete.dependencies,['child'])
})

test('desired state rejects a present relationship to an explicitly absent object',()=>{
 const parent={id:'parent',type:'TECHNICAL_ASSET',externalKey:'parent',name:'Parent',projectId:'project-1',attributes:{},relationships:[],version:1,state:'absent'}
 const child={id:'child',type:'TECHNICAL_ASSET',externalKey:'child',name:'Child',projectId:'project-1',attributes:{},relationships:[{type:'DEPENDS_ON',targetId:'parent'}],version:1}
 const result=validateGovernanceDesiredState({apiVersion:'datanexus.io/governance/v1',projectId:'project-1',targets:[{provider:'fake',connectionId:'c'}],objects:[parent,child]})
 assert.equal(result.ok,false)
 assert.match(result.errors.join(' '),/cannot reference explicitly absent object parent/)
})

test('authorization mapping reuses DataNexus capability vocabulary', () => {
  assert.equal(resolveGovernanceAuthorizationCapability('BUSINESS_TERM', 'CREATE'), 'glossary.manage')
  assert.equal(resolveGovernanceAuthorizationCapability('LINEAGE_EDGE', 'NOOP'), 'lineage.read')
  assert.equal(resolveGovernanceAuthorizationCapability('TECHNICAL_ASSET', 'UPDATE'), 'catalog.update')
})

test('desired-state validation rejects malformed JSON that TypeScript types cannot protect',()=>{
 const base={apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'fake',connectionId:'c'}],objects:[{id:'o',type:'TECHNICAL_ASSET',externalKey:'x',name:'X',projectId:'p',attributes:{},relationships:[],version:1}]}
 for(const object of [
  {...base.objects[0],type:'NOT_A_CANONICAL_TYPE'},
  {...base.objects[0],attributes:[]},
  {...base.objects[0],relationships:'invalid'},
  {...base.objects[0],relationships:[{type:'OWNS',targetId:''}]},
  {...base.objects[0],version:0},
  {...base.objects[0],state:'delete'},
 ])assert.equal(validateGovernanceDesiredState({...base,objects:[object]}).ok,false)
 assert.equal(validateGovernanceDesiredState(base).ok,true)
})


test('explicit delete fails closed when an unmanaged observed dependent still references the target',()=>{
 const parent={id:'parent',type:'TECHNICAL_ASSET',externalKey:'parent',name:'Parent',projectId:'project-1',attributes:{},relationships:[],version:1}
 const unmanaged={id:'external-child',type:'TECHNICAL_ASSET',externalKey:'external-child',name:'External child',projectId:'project-1',attributes:{},relationships:[{type:'DEPENDS_ON',targetId:'parent'}],version:1}
 const desired={apiVersion:'datanexus.io/governance/v1',projectId:'project-1',targets:[{provider:'fake',connectionId:'c'}],objects:[{...parent,state:'absent'}]}
 assert.throws(()=>buildGovernancePlan(desired,[parent,unmanaged]),/blocked because observed object TECHNICAL_ASSET:external-child still references it/)
})


test('desired-state validator is total over hostile JSON shapes',()=>{
 const malformed=[
  {apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:'not-an-array',objects:[]},
  {apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[42],objects:[]},
  {apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:{trim:true},connectionId:'c'}],objects:[]},
  {apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'fake',connectionId:'c'}],objects:'not-an-array'},
  {apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'fake',connectionId:'c'}],objects:[42]},
  {apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'fake',connectionId:'c'}],objects:[{id:{trim:true},type:'TECHNICAL_ASSET',externalKey:'x',name:'X',projectId:'p',attributes:{},relationships:[],version:1}]},
 ]
 for(const input of malformed){
  assert.doesNotThrow(()=>validateGovernanceDesiredState(input))
  assert.equal(validateGovernanceDesiredState(input).ok,false)
 }
})


test('desired-state validation rejects duplicate canonical object ids',()=>{
 const first={id:'same',type:'TECHNICAL_ASSET',externalKey:'a',name:'A',projectId:'p',attributes:{},relationships:[],version:1}
 const second={id:'same',type:'BUSINESS_TERM',externalKey:'b',name:'B',projectId:'p',attributes:{},relationships:[],version:1}
 const result=validateGovernanceDesiredState({apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'fake',connectionId:'c'}],objects:[first,second]})
 assert.equal(result.ok,false)
 assert.match(result.errors.join(' '),/duplicates canonical id same/)
})


test('semantic desired-state reordering preserves fingerprint, plan identity, and relationship equality',()=>{
 const parent={id:'parent',type:'TECHNICAL_ASSET',externalKey:'parent',name:'Parent',projectId:'p',attributes:{z:1,a:2},relationships:[],version:1}
 const child={id:'child',type:'TECHNICAL_ASSET',externalKey:'child',name:'Child',projectId:'p',attributes:{},relationships:[{type:'B',targetId:'parent'},{type:'A',targetId:'parent'}],version:1}
 const desiredA={apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'Fake',connectionId:' two '},{provider:'fake',connectionId:'one'}],objects:[child,parent]}
 const desiredB={...desiredA,targets:[{provider:'FAKE',connectionId:'one'},{provider:'fake',connectionId:'two'}],objects:[parent,{...child,state:'present',relationships:[...child.relationships].reverse()}]}
 assert.equal(governanceDesiredStateFingerprint(desiredA),governanceDesiredStateFingerprint(desiredB))
 const planA=buildGovernancePlan({...desiredA,targets:[desiredA.targets[0]]},[])
 const planB=buildGovernancePlan({...desiredB,targets:[desiredB.targets[1]]},[])
 assert.equal(planA.planId,planB.planId)
 assert.deepEqual(planA.operations.map(value=>value.operationId),planB.operations.map(value=>value.operationId))

 const observed=[parent,{...child,relationships:[...child.relationships].reverse()}]
 const inSync=buildGovernancePlan({...desiredA,targets:[{provider:'fake',connectionId:'one'}],objects:[parent,child]},observed)
 assert.ok(inSync.operations.every(value=>value.action==='NOOP'))
})
