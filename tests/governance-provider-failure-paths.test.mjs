import assert from 'node:assert/strict'
import test from 'node:test'
import { GovernanceProviderError } from '../lib/governance-platform/providers/sdk/errors.ts'
import { governanceRetryDecision,governanceRetryDelayMs } from '../lib/governance-platform/execution/retry-policy.ts'
import { planGovernanceBatches,assertSingleProviderBatch } from '../lib/governance-platform/execution/batch-planner.ts'
import { simulateGovernancePlan } from '../lib/governance-platform/planning/simulation.ts'
import { GOVERNANCE_MCP_TOOLS } from '../lib/governance-platform/mcp/contracts.ts'
import { governanceMcpToolDefinitions } from '../lib/governance-platform/mcp/tools.ts'

test('retry policy retries only normalized transient failures within bound',()=>{
 assert.equal(governanceRetryDecision(new GovernanceProviderError('RATE_LIMITED','rate'),1,3).retry,true)
 assert.equal(governanceRetryDecision(new GovernanceProviderError('AUTHORIZATION_DENIED','deny'),1,3).retry,false)
 assert.equal(governanceRetryDecision(new GovernanceProviderError('TRANSIENT_FAILURE','transient'),3,3).retry,false)
 assert.equal(governanceRetryDecision(new Error('unknown'),1,3).retry,false)
 assert.equal(governanceRetryDelayMs(10,250,1000,0),1000)
})

test('batch planner is bounded and rejects cross-provider batches',()=>{
 const operation=provider=>({provider,connectionId:'prod'})
 assert.deepEqual(planGovernanceBatches([operation('informatica'),operation('informatica'),operation('informatica')],2).map(batch=>batch.length),[2,1])
 assert.throws(()=>assertSingleProviderBatch([operation('informatica'),operation('collibra')]),/cannot span/)
})

test('simulation makes destructive plans explicit',()=>{
 const plan={operations:[{action:'CREATE'},{action:'DELETE'},{action:'NOOP'}]}
 const result=simulateGovernancePlan(plan)
 assert.equal(result.deletes,1);assert.equal(result.destructive,true)
})

test('MCP contract keeps planning and verification read only while apply is mutation',()=>{
 const byName=new Map(GOVERNANCE_MCP_TOOLS.map(tool=>[tool.name,tool]))
 assert.equal(byName.get('governance.plan').mutation,false)
 assert.equal(byName.get('governance.verify').mutation,false)
 assert.equal(byName.get('governance.apply').mutation,true)
})


test('MCP tool definitions are deterministic, provider neutral, and risk annotated',()=>{
 const tools=governanceMcpToolDefinitions()
 assert.deepEqual(tools.map(tool=>tool.name),[...tools.map(tool=>tool.name)].sort())
 const apply=tools.find(tool=>tool.name==='governance.apply'),plan=tools.find(tool=>tool.name==='governance.plan')
 assert.equal(apply.annotations.destructiveHint,true);assert.equal(apply.annotations.readOnlyHint,false);assert.equal(plan.annotations.readOnlyHint,true)
 assert.equal(JSON.stringify(tools).includes('informatica'),false)
})
