import assert from 'node:assert/strict'
import test from 'node:test'
import { validateGovernanceMcpTransportSecurity } from '../lib/governance-platform/mcp/transport-security.ts'

test('MCP transport permits configured host and same-origin browser requests',()=>{
 const env={MCP_ALLOWED_HOSTS:'mcp.example.com'}
 const request=new Request('https://mcp.example.com/api/mcp/governance',{headers:{host:'mcp.example.com','origin':'https://mcp.example.com'}})
 assert.deepEqual(validateGovernanceMcpTransportSecurity(request,env),{ok:true})
})

test('MCP transport rejects unlisted hosts and cross-origin browser requests',()=>{
 const env={MCP_ALLOWED_HOSTS:'mcp.example.com'}
 const badHost=new Request('https://evil.example/api/mcp/governance',{headers:{host:'evil.example'}})
 assert.equal(validateGovernanceMcpTransportSecurity(badHost,env).status,421)
 const badOrigin=new Request('https://mcp.example.com/api/mcp/governance',{headers:{host:'mcp.example.com',origin:'https://evil.example'}})
 assert.equal(validateGovernanceMcpTransportSecurity(badOrigin,env).status,403)
})

test('MCP transport allows non-browser clients only on an allowed host',()=>{
 const env={MCP_ALLOWED_HOSTS:'mcp.example.com'}
 const request=new Request('https://mcp.example.com/api/mcp/governance',{headers:{host:'mcp.example.com'}})
 assert.deepEqual(validateGovernanceMcpTransportSecurity(request,env),{ok:true})
})
