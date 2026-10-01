import assert from 'node:assert/strict'
import test from 'node:test'
import { informaticaProviderConfigFromEnv } from '../lib/governance-platform/providers/informatica/config.ts'

test('Informatica config fails closed without credentials',()=>{
 assert.throws(()=>informaticaProviderConfigFromEnv({}),/INFORMATICA_BASE_URL/)
})

test('Informatica config requires HTTPS and trims URL',()=>{
 assert.throws(()=>informaticaProviderConfigFromEnv({INFORMATICA_BASE_URL:'http://example.test',INFORMATICA_CONNECTION_ID:'c',INFORMATICA_ACCESS_TOKEN:'secret'}),/HTTPS/)
 const config=informaticaProviderConfigFromEnv({INFORMATICA_BASE_URL:'https://example.test/',INFORMATICA_CONNECTION_ID:'c',INFORMATICA_ACCESS_TOKEN:'secret'})
 assert.equal(config.baseUrl,'https://example.test')
 assert.equal(config.connectionId,'c')
})
