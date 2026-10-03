import assert from 'node:assert/strict'
import test from 'node:test'
import { informaticaProviderConfigFromEnv } from '../lib/governance-platform/providers/informatica/config.ts'
import { ensureGovernanceProvidersRegistered } from '../lib/governance-platform/providers/informatica/bootstrap.ts'
import { clearGovernanceProvidersForTests,getGovernanceProvider } from '../lib/governance-platform/providers/registry.ts'

test('Informatica config fails closed without credentials',()=>{
 assert.throws(()=>informaticaProviderConfigFromEnv({}),/INFORMATICA_BASE_URL/)
})

test('Informatica config requires HTTPS, explicit host local path, and trims URL',()=>{
 const base={INFORMATICA_CONNECTION_ID:'c',INFORMATICA_ACCESS_TOKEN:'secret',INFORMATICA_ASSETS_PATH:'/public/catalog/assets'}
 assert.throws(()=>informaticaProviderConfigFromEnv({...base,INFORMATICA_BASE_URL:'http://example.test'}),/HTTPS/)
 assert.throws(()=>informaticaProviderConfigFromEnv({...base,INFORMATICA_BASE_URL:'https://example.test',INFORMATICA_ASSETS_PATH:'https://evil.test/assets'}),/absolute path/)
 const config=informaticaProviderConfigFromEnv({...base,INFORMATICA_BASE_URL:'https://example.test/'})
 assert.equal(config.baseUrl,'https://example.test')
 assert.equal(config.connectionId,'c')
 assert.equal(config.assetsPath,'/public/catalog/assets')
})

test('Informatica bootstrap is opt in and never registers without complete runtime configuration',()=>{
 clearGovernanceProvidersForTests()
 assert.deepEqual(ensureGovernanceProvidersRegistered({}),{registered:[],skipped:['informatica:not_configured']})
 assert.equal(getGovernanceProvider('informatica'),null)
 const env={INFORMATICA_BASE_URL:'https://example.test',INFORMATICA_CONNECTION_ID:'c',INFORMATICA_ACCESS_TOKEN:'secret',INFORMATICA_ASSETS_PATH:'/public/catalog/assets'}
 assert.deepEqual(ensureGovernanceProvidersRegistered(env),{registered:['informatica'],skipped:[]})
 assert.ok(getGovernanceProvider('informatica'))
 assert.deepEqual(ensureGovernanceProvidersRegistered(env),{registered:[],skipped:['informatica:already_registered']})
 clearGovernanceProvidersForTests()
})
