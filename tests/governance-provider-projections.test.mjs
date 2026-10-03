import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { validateGovernanceProjectionObservation } from '../lib/governance-platform/projections/store.ts'

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
