import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGovernancePlan } from '../lib/governance-platform/planning/plan.ts'
import { GovernanceProviderError } from '../lib/governance-platform/providers/sdk/errors.ts'
import { executeWithGovernanceRetry } from '../lib/governance-platform/execution/retry-policy.ts'
import { governanceMcpRequiredCapability,authorizeGovernanceMcpTool } from '../lib/governance-platform/mcp/authorization.ts'
import { InformaticaApiClient } from '../lib/governance-platform/providers/informatica/client.ts'
import { InformaticaGovernanceProvider } from '../lib/governance-platform/providers/informatica/provider.ts'
import { validateProviderManifest } from '../lib/governance-platform/providers/conformance.ts'

const object={id:'asset-a',type:'TECHNICAL_ASSET',externalKey:'a',name:'A',projectId:'p',attributes:{},relationships:[],version:1}
const desired={apiVersion:'datanexus.io/governance/v1',projectId:'p',targets:[{provider:'informatica',connectionId:'prod'}],objects:[object]}

test('plan exposes a full immutable fingerprint while retaining compact plan id',()=>{
 const plan=buildGovernancePlan(desired,[])
 assert.equal(plan.planFingerprint.length,64)
 assert.equal(plan.planId,plan.planFingerprint.slice(0,32))
 const changed=buildGovernancePlan({...desired,objects:[{...object,name:'Changed'}]},[])
 assert.notEqual(plan.planFingerprint,changed.planFingerprint)
})

test('Informatica discovery separates canonical state from provider projection identity',async()=>{
 const client=new InformaticaApiClient({baseUrl:'https://example.invalid',accessToken:async()=>'token',fetchImpl:async()=>({ok:true,status:200,json:async()=>({items:[{id:'vendor-7',externalKey:'customer',name:'Customer',attributes:{domain:'crm'}}]})})})
 const provider=new InformaticaGovernanceProvider(client,{assets:()=>'/assets'})
 const result=await provider.discover({projectId:'p',connectionId:'prod'})
 assert.equal(result.objects[0].id,'technical-asset:customer')
 assert.equal(result.objects[0].attributes.provider,undefined)
 assert.equal(result.projections[0].providerObjectId,'vendor-7')
 assert.equal(result.projections[0].canonicalObjectId,result.objects[0].id)
 assert.equal(result.projections[0].connectionId,'prod')
 assert.equal(result.projections[0].lastObservedFingerprint.length,64)
})

test('central retry runtime retries only normalized retryable provider failures',async()=>{
 let attempts=0;const delays=[]
 const result=await executeWithGovernanceRetry(async attempt=>{attempts=attempt;if(attempt<3)throw new GovernanceProviderError('TRANSIENT_FAILURE','temporary');return'ok'},{
  maxAttempts:3,baseDelayMs:10,maxDelayMs:100,sleep:async delay=>delays.push(delay),random:()=>0,
 })
 assert.equal(result.value,'ok');assert.equal(result.attempts,3);assert.equal(attempts,3);assert.deepEqual(delays,[10,20])
 let deniedCalls=0
 await assert.rejects(()=>executeWithGovernanceRetry(async()=>{deniedCalls++;throw new GovernanceProviderError('AUTHORIZATION_DENIED','denied')},{maxAttempts:3,sleep:async()=>{}}),error=>error.code==='AUTHORIZATION_DENIED')
 assert.equal(deniedCalls,1)
})

test('MCP tools reuse DataNexus authorization vocabulary and principal binding',async()=>{
 assert.equal(governanceMcpRequiredCapability('governance.plan'),'catalog.read')
 assert.equal(governanceMcpRequiredCapability('governance.status'),'execution.view_evidence')
 assert.equal(governanceMcpRequiredCapability('governance.apply'),'agent.execute')
 const calls=[]
 await authorizeGovernanceMcpTool({principalId:'service-a',projectId:'p'},'governance.apply',async request=>calls.push(request))
 assert.deepEqual(calls,[{principalId:'service-a',projectId:'p',capability:'agent.execute'}])
})


test('Informatica capability manifest does not overclaim uncertified coverage',()=>{
 const provider=new InformaticaGovernanceProvider({},{})
 const manifest=provider.manifest()
 const catalog=manifest.capabilities.find(value=>value.capability==='catalog.asset.read')
 const lineage=manifest.capabilities.find(value=>value.capability==='lineage.read')
 assert.equal(catalog.support,'PARTIAL')
 assert.equal(lineage.support,'UNSUPPORTED')
})


test('provider conformance rejects duplicate capabilities and invalid constraints',()=>{
 const base=new InformaticaGovernanceProvider({},{}).manifest()
 assert.equal(validateProviderManifest(base).ok,true)
 const invalid={...base,capabilities:[base.capabilities[0],{...base.capabilities[0],constraints:{maxBatchSize:0}}]}
 const result=validateProviderManifest(invalid)
 assert.equal(result.ok,false);assert.ok(result.issues.some(issue=>issue.code==='DUPLICATE_CAPABILITY'));assert.ok(result.issues.some(issue=>issue.code==='INVALID_CONSTRAINT'))
})


test('provider conformance rejects read-only capabilities that advertise mutation modes',()=>{
 const base=new InformaticaGovernanceProvider({},{}).manifest()
 const invalid={...base,capabilities:[{...base.capabilities[0],support:'READ_ONLY',modes:['READ','UPDATE']}]}
 const result=validateProviderManifest(invalid)
 assert.equal(result.ok,false);assert.ok(result.issues.some(issue=>issue.code==='READ_ONLY_MUTATION_MODE'))
})
