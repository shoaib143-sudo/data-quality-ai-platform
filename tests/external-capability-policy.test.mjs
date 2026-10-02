import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXTERNAL_CAPABILITY_POLICIES,
  authorizeExternalInvocation,
} from '../lib/agents/external-capability-policy.ts'
import {
  normalizeExternalEvidence,
} from '../lib/agents/external-evidence-normalizer.ts'
import {
  eligibleForContextAdoption,
  scoreContextBenchmark,
} from '../lib/agents/context-provider-benchmark.ts'

test('all external capabilities are non-authoritative and disabled by default', () => {
  assert.ok(EXTERNAL_CAPABILITY_POLICIES.length >= 7)
  for (const policy of EXTERNAL_CAPABILITY_POLICIES) {
    assert.equal(policy.authoritative, false)
    assert.equal(policy.enabledByDefault, false)
    assert.equal(policy.productionSecretsAllowed, false)
  }
})

test('browser extension fails closed without explicit enable and host allowlist', () => {
  assert.deepEqual(
    authorizeExternalInvocation({
      capability: 'browser-use',
      explicitEnable: false,
      production: false,
      carriesSecrets: false,
      requestsPersistentWrite: false,
    }),
    { allowed: false, reason: 'CAPABILITY_DISABLED_BY_DEFAULT' },
  )
  assert.deepEqual(
    authorizeExternalInvocation({
      capability: 'browser-use',
      explicitEnable: true,
      production: false,
      carriesSecrets: false,
      requestsPersistentWrite: false,
      targetUrl: 'https://evil.example',
      allowedHosts: ['data-quality-ai-platform.vercel.app'],
    }),
    { allowed: false, reason: 'HOST_NOT_ALLOWLISTED' },
  )
})

test('production secrets and persistent writes are denied', () => {
  assert.equal(authorizeExternalInvocation({
    capability: 'claude-security', explicitEnable: true, production: false,
    carriesSecrets: true, requestsPersistentWrite: false,
  }).allowed, false)
  assert.equal(authorizeExternalInvocation({
    capability: 'diagram-design', explicitEnable: true, production: false,
    carriesSecrets: false, requestsPersistentWrite: true,
  }).allowed, false)
})

test('reference, benchmark, deferred, and non-applicable capabilities cannot become production execution paths', () => {
  for (const capability of ['harness-engineering', 'openviking', 'agent-memory', 'scientific-agent-skills']) {
    assert.equal(authorizeExternalInvocation({
      capability,
      explicitEnable: true,
      production: true,
      carriesSecrets: false,
      requestsPersistentWrite: false,
    }).allowed, false)
  }
})

test('external findings normalize as advisory evidence only', () => {
  const evidence = normalizeExternalEvidence({
    capability: 'claude-security',
    sourceRevision: 'abcdef1234567',
    observedAt: '2026-10-02T00:00:00Z',
    findings: [{ code: 'SEC-1', summary: 'Review this boundary', severity: 'HIGH' }],
  })
  assert.equal(evidence.advisory, true)
  assert.equal(evidence.authoritative, false)
})

test('context provider adoption requires retrieval quality and governance gates', () => {
  const result = scoreContextBenchmark({
    provider: 'candidate',
    queryId: 'q1',
    relevant: ['a', 'b'],
    retrieved: ['a', 'b'],
    inputTokens: 10,
    outputTokens: 2,
    latencyMs: 5,
    provenanceComplete: true,
    tenantIsolationPassed: true,
    poisoningResistancePassed: false,
  })
  assert.equal(result.precision, 1)
  assert.equal(result.recall, 1)
  assert.equal(eligibleForContextAdoption(result), false)
})
