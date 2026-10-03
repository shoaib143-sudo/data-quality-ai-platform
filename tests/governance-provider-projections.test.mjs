import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { validateGovernanceProjectionObservation } from '../lib/governance-platform/projections/store.ts'
import { discoverGovernanceTargetStates } from '../lib/governance-platform/planning/discovery.ts'
import { clearGovernanceProvidersForTests,registerGovernanceProvider } from '../lib/governance-platform/providers/registry.ts'

const projection={
 provider:'informatica',connectionId:'conn-1',canonicalObjectId:'technical-asset:1',providerObjectId:'1',
 lastObservedFingerprint:'abc',lastObservedAt:'2026-10-03T00:00:00.000Z',syncState:'IN_SYNC',
}

test('projection observation is target scoped and normalized',()=>{
 const result=validateGovernanceProjectionObservation({projectId:'project-1',provider:'INFORMATICA',connectionId:'conn-1',projection})
 assert.equal(result.provider,'informatica')
 assert.equal(result.connectionId,'conn-1')
})

test('projection observation rejects provider or connection identity crossing',()=>{
 assert.throws(()=>validateGovernanceProjectionObservation({projectId:'project-1',provider:'collibra',connectionId:'conn-1',projection}),/provider does not match/)
 assert.throws(()=>validateGovernanceProjectionObservation({projectId:'project-1',provider:'informatica',connectionId:'conn-2',projection}),/connection does not match/)
})

test('projection persistence has dual identity uniqueness and service-role-only mutation',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261003094500_governance_platform_provider_projections.sql',import.meta.url),'utf8')
 assert.match(sql,/unique \(project_id, provider, connection_id, canonical_object_id\)/)
 assert.match(sql,/unique \(project_id, provider, connection_id, provider_object_id\)/)
 assert.match(sql,/enable row level security/)
 assert.match(sql,/grant select on governance\.provider_projections to service_role/)
 assert.doesNotMatch(sql,/grant (?:insert|update|delete).*provider_projections to service_role/i)
 assert.match(sql,/upsert_provider_projection_observations/)
 assert.match(sql,/grant execute on function governance\.upsert_provider_projection_observations\(uuid,jsonb\)[\s\S]*to service_role/)
 assert.match(sql,/has_function_privilege\('authenticated'.*'EXECUTE'\)/)
})


const discoveredObject={
 id:'technical-asset:1',type:'TECHNICAL_ASSET',externalKey:'1',name:'Asset 1',
 projectId:'project-1',attributes:{},relationships:[],version:1,
}
const desired={
 apiVersion:'datanexus.io/governance/v1',projectId:'project-1',
 targets:[{provider:'fake',connectionId:'conn-1'}],objects:[discoveredObject],
}
function fakeProvider(discover){
 return{
  manifest:()=>({provider:'fake',providerVersion:'1',canonicalSchemaVersion:'1.0',capabilities:[]}),
  capabilities:async()=>[],
  discover,
  execute:async operation=>({operationId:operation.operationId,status:'SUCCEEDED'}),
  verify:async operation=>({operationId:operation.operationId,status:'VERIFIED'}),
 }
}

test('discovery tolerates providers that return no projection array',async()=>{
 clearGovernanceProvidersForTests()
 registerGovernanceProvider(fakeProvider(async()=>({objects:[discoveredObject],observedAt:'2026-10-03T00:00:00.000Z'})))
 const states=await discoverGovernanceTargetStates(desired)
 assert.deepEqual(states[0].projections,[])
 clearGovernanceProvidersForTests()
})

test('discovery rejects projection target crossing and unknown canonical mapping',async()=>{
 clearGovernanceProvidersForTests()
 registerGovernanceProvider(fakeProvider(async()=>({
  objects:[discoveredObject],observedAt:'2026-10-03T00:00:00.000Z',
  projections:[{...projection,provider:'other',connectionId:'conn-1',canonicalObjectId:discoveredObject.id}],
 })))
 await assert.rejects(()=>discoverGovernanceTargetStates(desired),/provider does not match/)
 clearGovernanceProvidersForTests()

 registerGovernanceProvider(fakeProvider(async()=>({
  objects:[discoveredObject],observedAt:'2026-10-03T00:00:00.000Z',
  projections:[{...projection,provider:'fake',connectionId:'conn-1',canonicalObjectId:'technical-asset:missing'}],
 })))
 await assert.rejects(()=>discoverGovernanceTargetStates(desired),/undiscovered canonical object/)
 clearGovernanceProvidersForTests()
})
