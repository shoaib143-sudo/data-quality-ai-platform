import assert from 'node:assert/strict'
import { isExplicitSyntheticTestOrBootstrapEvidence } from '../lib/data-quality/production-evidence-eligibility.ts'

assert.equal(isExplicitSyntheticTestOrBootstrapEvidence({ synthetic: true }), true)
assert.equal(isExplicitSyntheticTestOrBootstrapEvidence({ environment: 'test' }), true)
assert.equal(isExplicitSyntheticTestOrBootstrapEvidence({ metadata: { synthetic_bootstrap: true } }), true)
assert.equal(isExplicitSyntheticTestOrBootstrapEvidence({ evidence: { metadata: { is_demo: true } } }), true)
assert.equal(isExplicitSyntheticTestOrBootstrapEvidence({ evidence: { checks: { verified: true } } }), false)
assert.equal(isExplicitSyntheticTestOrBootstrapEvidence({ metadata: { synthetic_bootstrap: false } }), false)
assert.equal(isExplicitSyntheticTestOrBootstrapEvidence(null), false)
assert.equal(isExplicitSyntheticTestOrBootstrapEvidence(['synthetic']), false)

console.log('Production evidence eligibility runtime tests passed.')
