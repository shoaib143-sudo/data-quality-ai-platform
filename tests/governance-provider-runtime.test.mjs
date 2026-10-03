import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveProviderCapability } from '../lib/governance-platform/providers/capability-resolver.ts'
import { governanceIdempotencyKey } from '../lib/governance-platform/planning/idempotency.ts'
import { orderGovernanceOperations } from '../lib/governance-platform/planning/dependency-dag.ts'
import { InformaticaApiClient } from '../lib/governance-platform/providers/informatica/client.ts'
import { InformaticaGovernanceProvider } from '../lib/governance-platform/providers/informatica/provider.ts'

const full = { capability:'catalog.asset.read', support:'FULL', modes:['READ'], consistency:'EVENTUAL', execution:'SYNC', idempotency:'NATIVE', rollback:'NONE', verification:'READ_BACK' }

test('capability resolver fails closed and reports semantic loss', () => {
  assert.equal(resolveProviderCapability([full], 'catalog.asset.read', 'READ').semanticLoss, 'EXACT')
  assert.equal(resolveProviderCapability([{...full,support:'PARTIAL'}], 'catalog.asset.read', 'READ').semanticLoss, 'APPROXIMATED')
  assert.equal(resolveProviderCapability([full], 'catalog.asset.read', 'UPDATE').executable, false)
  assert.equal(resolveProviderCapability([], 'catalog.asset.read', 'READ').semanticLoss, 'UNSUPPORTED')
})

test('idempotency key is stable and provider scoped', () => {
  const base={projectId:'p1',provider:'informatica',connectionId:'prod',canonicalKey:'TECHNICAL_ASSET:a',operation:'CREATE',desiredStateFingerprint:'f1'}
  assert.equal(governanceIdempotencyKey(base), governanceIdempotencyKey({...base,provider:'INFORMATICA'}))
  assert.notEqual(governanceIdempotencyKey(base), governanceIdempotencyKey({...base,connectionId:'test'}))
})

test('dependency ordering rejects cycles', () => {
  const a={operationId:'a',action:'CREATE',canonicalKey:'A:a',objectId:'a',dependencies:['b']}
  const b={operationId:'b',action:'CREATE',canonicalKey:'B:b',objectId:'b',dependencies:['a']}
  assert.throws(()=>orderGovernanceOperations([a,b]), /dependency cycle/)
})

test('informatica provider discovers and normalizes without retries or mutations', async () => {
  let calls=0
  const client=new InformaticaApiClient({baseUrl:'https://example.invalid',accessToken:async()=> 'token',fetchImpl:async()=>{calls++; return {ok:true,status:200,json:async()=>({items:[{id:'1',name:'Customer'}]})}}})
  const provider=new InformaticaGovernanceProvider(client,{assets:()=>'/assets'})
  const result=await provider.discover({projectId:'p1',connectionId:'c1'})
  assert.equal(calls,1)
  assert.equal(result.objects[0].externalKey,'1')
  await assert.rejects(()=>provider.execute({}), /not enabled/)
})


test('partial provider semantics are readable but cannot mutate without explicit semantic-loss acceptance',()=>{
 const partialRead={...full,support:'PARTIAL'}
 assert.equal(resolveProviderCapability([partialRead],'catalog.asset.read','READ').executable,true)
 const partialMutation={...full,capability:'catalog.asset.update',support:'PARTIAL',modes:['UPDATE']}
 const resolution=resolveProviderCapability([partialMutation],'catalog.asset.update','UPDATE')
 assert.equal(resolution.semanticLoss,'APPROXIMATED')
 assert.equal(resolution.executable,false)
 assert.match(resolution.reason,/semantic-loss acceptance/)
})
