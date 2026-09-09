import assert from 'node:assert/strict'
import {
  commandCenterExplorerCounts,
  filterCommandCenterExplorerItems,
} from '../lib/ai/command-center-explorer.ts'
import {
  hasTraceInvocationEvidence,
  projectTraceInvocationEvidence,
} from '../lib/ai/trace-invocation-evidence.ts'

const items = [
  {
    id: 'sys-1', category: 'AI_SYSTEM', title: 'Governance Reasoner', subtitle: 'REASONING · governance_reasoner', status: 'ACTIVE', source: 'governance.ai_systems', timestamp: null,
    details: [{ label: 'System key', value: 'governance_reasoner' }],
  },
  {
    id: 'eval-1', category: 'EVALUATION', title: 'RETRIEVAL_RELEVANCE · MRR@10', subtitle: 'Retrieval system', status: 'PASS', source: 'governance.ai_evaluation_results', timestamp: '2026-09-09T01:00:00Z',
    details: [{ label: 'Capability', value: 'semantic_search' }, { label: 'Score', value: '0.75' }],
  },
  {
    id: 'telemetry-1', category: 'TELEMETRY', title: 'POLICY_DECISION · autonomy_policy_decision', subtitle: 'governance_autonomy_policy', status: 'SUCCESS', source: 'governance.ai_telemetry_events', timestamp: '2026-09-09T02:00:00Z',
    details: [{ label: 'Correlation ID', value: 'traceable-correlation' }],
  },
  {
    id: 'finding-1', category: 'FINDING', title: 'AI_TELEMETRY_ERROR', subtitle: 'Observed telemetry error', status: 'HIGH', source: 'governance.ai_telemetry_events', timestamp: null,
    details: [{ label: 'Severity', value: 'HIGH' }],
  },
]

assert.deepEqual(filterCommandCenterExplorerItems(items).map((item) => item.id), ['telemetry-1', 'eval-1', 'finding-1', 'sys-1'])
assert.deepEqual(filterCommandCenterExplorerItems(items, { category: 'EVALUATION' }).map((item) => item.id), ['eval-1'])
assert.deepEqual(filterCommandCenterExplorerItems(items, { status: 'SUCCESS' }).map((item) => item.id), ['telemetry-1'])
assert.deepEqual(filterCommandCenterExplorerItems(items, { query: 'semantic_search' }).map((item) => item.id), ['eval-1'])
assert.deepEqual(filterCommandCenterExplorerItems(items, { query: 'traceable-correlation' }).map((item) => item.id), ['telemetry-1'])
assert.deepEqual(filterCommandCenterExplorerItems(items, { sort: 'OLDEST' }).map((item) => item.id), ['finding-1', 'sys-1', 'eval-1', 'telemetry-1'])
assert.deepEqual(filterCommandCenterExplorerItems(items, { sort: 'TITLE' }).map((item) => item.id), ['finding-1', 'sys-1', 'telemetry-1', 'eval-1'])

const counts = commandCenterExplorerCounts(items)
assert.equal(counts.total, 4)
assert.equal(counts.byCategory.EVALUATION, 1)
assert.equal(counts.byCategory.TELEMETRY, 1)
assert.equal(counts.byStatus.PASS, 1)
assert.equal(counts.byStatus.HIGH, 1)

const invocationEvidence = projectTraceInvocationEvidence({
  route_source: 'GOVERNED_REGISTRY',
  route_reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED',
  routing_policy_id: 'policy-1',
  routing_policy_reason: 'POLICY_ALLOWED',
  provider_request_id: 'req-123',
  requested_max_output_tokens: 512,
  provider_http_status: 429,
  total_tokens: 150,
  prompt: 'must never escape the projection',
  completion: 'must never escape the projection',
  hidden_reasoning: 'must never escape the projection',
  api_key: 'must never escape the projection',
})

assert.deepEqual(invocationEvidence, {
  routeSource: 'GOVERNED_REGISTRY',
  routeReason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED',
  routingPolicyId: 'policy-1',
  routingPolicyReason: 'POLICY_ALLOWED',
  providerRequestId: 'req-123',
  requestedMaxOutputTokens: 512,
  providerHttpStatus: 429,
  totalTokens: 150,
})
assert.equal(hasTraceInvocationEvidence(invocationEvidence), true)
assert.equal(JSON.stringify(invocationEvidence).includes('must never escape'), false)
assert.equal(JSON.stringify(invocationEvidence).includes('api_key'), false)

const invalidEvidence = projectTraceInvocationEvidence({
  route_source: 42,
  provider_request_id: '',
  requested_max_output_tokens: -1,
  provider_http_status: 99,
  total_tokens: 1.5,
})
assert.equal(hasTraceInvocationEvidence(invalidEvidence), false)
assert.deepEqual(invalidEvidence, {
  routeSource: null,
  routeReason: null,
  routingPolicyId: null,
  routingPolicyReason: null,
  providerRequestId: null,
  requestedMaxOutputTokens: null,
  providerHttpStatus: null,
  totalTokens: null,
})

console.log('ADR-006 Command Center Explorer and trace invocation evidence projection verified.')
