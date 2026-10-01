import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

const source=fs.readFileSync(new URL('../lib/governance-platform/mcp/handler.ts',import.meta.url),'utf8')
const route=fs.readFileSync(new URL('../app/api/mcp/governance/route.ts',import.meta.url),'utf8')

test('MCP governance endpoint targets the stateless 2026 protocol and validates routing headers',()=>{
 assert.match(source,/GOVERNANCE_MCP_PROTOCOL_VERSION='2026-07-28'/)
 assert.match(source,/mcp-protocol-version/)
 assert.match(source,/mcp-method/)
 assert.match(source,/mcp-name/)
 assert.match(source,/-32022/)
 assert.match(source,/-32020/)
 assert.match(source,/server\/discover/)
 assert.match(source,/tools\/list/)
 assert.match(source,/tools\/call/)
 assert.match(source,/resultType:'complete'/)
 assert.match(source,/cacheScope:'private'/)
})

test('MCP tool execution resolves a delegated principal and never accepts vendor credentials as arguments',()=>{
 assert.match(source,/resolveGovernanceMcpPrincipal\(request\)/)
 assert.match(source,/authorizeGovernanceMcpTool/)
 assert.match(source,/planGovernanceDeploymentForPrincipal/)
 assert.match(source,/applyGovernanceDeploymentForPrincipal/)
 assert.doesNotMatch(source,/INFORMATICA_ACCESS_TOKEN/)
 assert.doesNotMatch(source,/clientSecret/)
 assert.doesNotMatch(source,/password/)
})

test('Next MCP route is node runtime, dynamic, and POST only',()=>{
 assert.match(route,/runtime='nodejs'/)
 assert.match(route,/dynamic='force-dynamic'/)
 assert.match(route,/export async function POST/)
 assert.doesNotMatch(route,/export async function GET/)
})
