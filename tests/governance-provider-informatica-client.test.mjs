import assert from 'node:assert/strict'
import test from 'node:test'
import { InformaticaApiClient } from '../lib/governance-platform/providers/informatica/client.ts'

test('Informatica client rejects insecure, credential-bearing, or invalid timeout configuration',()=>{
 assert.throws(()=>new InformaticaApiClient({baseUrl:'http://example.test',accessToken:async()=>'x'}),/HTTPS/)
 assert.throws(()=>new InformaticaApiClient({baseUrl:'https://u:p@example.test',accessToken:async()=>'x'}),/embedded credentials/)
 assert.throws(()=>new InformaticaApiClient({baseUrl:'https://example.test',accessToken:async()=>'x',timeoutMs:0}),/timeout/)
 assert.throws(()=>new InformaticaApiClient({baseUrl:'https://example.test',accessToken:async()=>'x',timeoutMs:60_001}),/timeout/)
})

test('Informatica client fails closed on token acquisition and invalid JSON',async()=>{
 await assert.rejects(()=>new InformaticaApiClient({baseUrl:'https://example.test',accessToken:async()=>{throw new Error('secret failure')}}).getJson('/x'),error=>error.code==='AUTHENTICATION_FAILED')
 const client=new InformaticaApiClient({baseUrl:'https://example.test',accessToken:async()=>'token',fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw new Error('bad json')}})})
 await assert.rejects(()=>client.getJson('/x'),error=>error.code==='VALIDATION_FAILED')
})

test('Informatica client applies a bounded abort signal and normalizes timeout without local retry',async()=>{
 let calls=0
 const client=new InformaticaApiClient({
  baseUrl:'https://example.test',
  accessToken:async()=>'token',
  timeoutMs:25,
  fetchImpl:async(_url,init)=>{
   calls++
   assert.ok(init?.signal instanceof AbortSignal)
   const error=new Error('timed out');error.name='TimeoutError';throw error
  },
 })
 await assert.rejects(()=>client.getJson('/x'),error=>error.code==='TRANSIENT_FAILURE'&&error.retryable===true)
 assert.equal(calls,1)
})

test('Informatica client normalizes network failure without retrying locally',async()=>{
 let calls=0;const client=new InformaticaApiClient({baseUrl:'https://example.test',accessToken:async()=>'token',fetchImpl:async()=>{calls++;throw new Error('network')}})
 await assert.rejects(()=>client.getJson('/x'),error=>error.code==='PROVIDER_UNAVAILABLE'&&error.retryable===true)
 assert.equal(calls,1)
})


test('Informatica client normalizes provider HTTP failure classes without local retry',async()=>{
 const cases=[
  [401,'AUTHENTICATION_FAILED',false],
  [403,'AUTHORIZATION_DENIED',false],
  [404,'NOT_FOUND',false],
  [429,'RATE_LIMITED',true],
  [408,'TRANSIENT_FAILURE',true],
  [500,'TRANSIENT_FAILURE',true],
  [502,'TRANSIENT_FAILURE',true],
  [503,'TRANSIENT_FAILURE',true],
  [504,'TRANSIENT_FAILURE',true],
  [422,'VALIDATION_FAILED',false],
 ]
 for(const [status,code,retryable] of cases){
  let calls=0
  const client=new InformaticaApiClient({
   baseUrl:'https://example.test',accessToken:async()=>'token',
   fetchImpl:async()=>{calls++;return{ok:false,status,json:async()=>({})}},
  })
  await assert.rejects(()=>client.getJson('/x'),error=>error.code===code&&error.retryable===retryable)
  assert.equal(calls,1)
 }
})
