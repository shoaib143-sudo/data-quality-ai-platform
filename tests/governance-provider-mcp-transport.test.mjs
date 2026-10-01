import assert from 'node:assert/strict'
import test from 'node:test'
import { GOVERNANCE_MCP_PROTOCOL_VERSION,handleGovernanceMcpRequest,governanceMcpAdvertisedTools } from '../lib/governance-platform/mcp/handler.ts'

function request(method,body,{name,protocol=GOVERNANCE_MCP_PROTOCOL_VERSION}={}){
 const headers={'content-type':'application/json','mcp-protocol-version':protocol,'mcp-method':method}
 if(name)headers['mcp-name']=name
 return new Request('https://example.test/api/mcp/governance',{method:'POST',headers,body:JSON.stringify(body)})
}
function rpc(id,method,params={}){
 return{jsonrpc:'2.0',id,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':GOVERNANCE_MCP_PROTOCOL_VERSION,'io.modelcontextprotocol/clientCapabilities':{}}}}
}

test('modern MCP discovery is stateless and advertises only governance tools capability',async()=>{
 const response=await handleGovernanceMcpRequest(request('server/discover',rpc(1,'server/discover')))
 assert.equal(response.status,200)
 const body=await response.json()
 assert.equal(body.result.resultType,'complete')
 assert.deepEqual(body.result.supportedVersions,[GOVERNANCE_MCP_PROTOCOL_VERSION])
 assert.deepEqual(body.result.capabilities,{tools:{}})
 assert.equal(body.result.cacheScope,'private')
 assert.equal(body.result._meta['io.modelcontextprotocol/serverInfo'].name,'datanexus-governance')
})

test('modern MCP rejects protocol and routing header mismatches before tool execution',async()=>{
 const wrongVersion=await handleGovernanceMcpRequest(request('server/discover',rpc(1,'server/discover'),{protocol:'2025-11-25'}))
 assert.equal(wrongVersion.status,400);assert.equal((await wrongVersion.json()).error.code,-32022)
 const wrongMethod=await handleGovernanceMcpRequest(request('tools/list',rpc(2,'server/discover')))
 assert.equal(wrongMethod.status,400);assert.equal((await wrongMethod.json()).error.code,-32020)
 const call=rpc(3,'tools/call',{name:'governance.plan',arguments:{}})
 const wrongName=await handleGovernanceMcpRequest(request('tools/call',call,{name:'governance.verify'}))
 assert.equal(wrongName.status,400);assert.equal((await wrongName.json()).error.code,-32020)
})

test('MCP governance tool catalog is deterministic and provider neutral',()=>{
 assert.deepEqual(governanceMcpAdvertisedTools(),['governance.apply','governance.plan','governance.status','governance.verify'])
})
