import assert from 'node:assert/strict'
import test from 'node:test'

import { stableGovernanceFingerprint } from '../lib/governance-platform/planning/fingerprint.ts'
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
