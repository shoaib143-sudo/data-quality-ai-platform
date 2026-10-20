import assert from 'node:assert/strict'
import test from 'node:test'
import { informaticaCompatibility } from '../lib/governance-platform/providers/informatica/compatibility.ts'
import { clearProviderCompatibilityForTests,getProviderCompatibility,registerProviderCompatibility } from '../lib/governance-platform/providers/compatibility.ts'

test('Informatica compatibility separates documented API capability from enabled execution',()=>{
 assert.equal(informaticaCompatibility.status,'DOCUMENTED_NOT_LIVE_VERIFIED')
 const create=informaticaCompatibility.documentedCapabilities.find(value=>value.capability==='catalog.business_asset.create')
 const relationship=informaticaCompatibility.documentedCapabilities.find(value=>value.capability==='catalog.asset.relationship.update')
 assert.equal(create.status,'DOCUMENTED_NOT_ENABLED')
 assert.deepEqual(create.operations,['CREATE'])
 assert.equal(relationship.status,'DOCUMENTED_NOT_ENABLED')
 assert.deepEqual(relationship.operations,['UPDATE'])
})

test('provider compatibility registry is provider normalized and isolated',()=>{
 clearProviderCompatibilityForTests()
 registerProviderCompatibility(informaticaCompatibility)
 assert.equal(getProviderCompatibility('INFORMATICA').provider,'informatica')
 clearProviderCompatibilityForTests()
 assert.equal(getProviderCompatibility('informatica'),null)
})
