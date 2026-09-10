import assert from 'node:assert/strict'

const { OpaPolicyDecisionProvider } = await import('../lib/governance/opa-policy-decision-provider.ts')

const request = {
  projectId: 'project-1',
  actionKey: 'CREATE_GOVERNANCE_ISSUE',
  targetType: 'DATASET',
  riskLevel: 'LOW',
  confidence: 0.95,
}

function canonical(decision = 'ALLOW') {
  return {
    id: 'canonical-test',
    async decide() {
      return {
        decision,
        reason: 'canonical',
        providerId: 'governance_autonomy_policy',
        policyId: 'policy-1',
        policyVersionId: 'version-7',
        authorityStatus: 'APPROVED',
        executionMode: decision === 'DENY' ? 'BLOCKED' : 'AUTO',
        reversible: true,
      }
    },
  }
}

const allowed = new OpaPolicyDecisionProvider(canonical(), {
  endpoint: 'https://opa.example.test',
  fetchImpl: async (_url, init) => {
    const payload = JSON.parse(init.body)
    assert.equal(payload.input.canonical.policy_version_id, 'version-7')
    assert.equal(payload.input.request.project_id, 'project-1')
    return new Response(JSON.stringify({ result: { decision: 'ALLOW', policy_version_id: 'version-7', reason: 'rego allowed' } }), { status: 200 })
  },
})
assert.equal((await allowed.decide(request)).decision, 'ALLOW')
assert.equal((await allowed.decide(request)).providerId, 'opa_policy_enforcement')

const stricter = new OpaPolicyDecisionProvider(canonical(), {
  endpoint: 'https://opa.example.test',
  fetchImpl: async () => new Response(JSON.stringify({ result: { decision: 'REQUIRE_APPROVAL', policy_version_id: 'version-7' } }), { status: 200 }),
})
assert.equal((await stricter.decide(request)).decision, 'REQUIRE_APPROVAL')

const canonicalApproval = new OpaPolicyDecisionProvider(canonical('REQUIRE_APPROVAL'), {
  endpoint: 'https://opa.example.test',
  fetchImpl: async () => new Response(JSON.stringify({ result: { decision: 'ALLOW', policy_version_id: 'version-7' } }), { status: 200 }),
})
assert.equal((await canonicalApproval.decide(request)).decision, 'DENY', 'OPA must not relax canonical approval requirement')

let denyFetchCalls = 0
const canonicalDeny = new OpaPolicyDecisionProvider(canonical('DENY'), {
  endpoint: 'https://opa.example.test',
  fetchImpl: async () => {
    denyFetchCalls += 1
    return new Response('{}', { status: 200 })
  },
})
assert.equal((await canonicalDeny.decide(request)).decision, 'DENY')
assert.equal(denyFetchCalls, 0, 'canonical deny must not be delegated externally')

const stale = new OpaPolicyDecisionProvider(canonical(), {
  endpoint: 'https://opa.example.test',
  fetchImpl: async () => new Response(JSON.stringify({ result: { decision: 'ALLOW', policy_version_id: 'version-6' } }), { status: 200 }),
})
assert.equal((await stale.decide(request)).decision, 'DENY')
assert.match((await stale.decide(request)).reason, /stale or mismatched/)

const unavailable = new OpaPolicyDecisionProvider(canonical(), {
  endpoint: 'https://opa.example.test',
  fetchImpl: async () => { throw new Error('network unavailable') },
})
assert.equal((await unavailable.decide(request)).decision, 'DENY')

const unconfigured = new OpaPolicyDecisionProvider(canonical(), { endpoint: null })
assert.equal((await unconfigured.decide(request)).decision, 'DENY')

console.log('OPA policy enforcement preserves canonical authority, exact-version pinning, and fail-closed behavior.')
