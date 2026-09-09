import assert from 'node:assert/strict'
import { canonicalResourcePath, canonicalRoutes } from '../lib/platform/canonical-routes.ts'

assert.equal(canonicalResourcePath('/agents', 'data_quality_agent', '1.0'), '/agents/data_quality_agent/1.0')
assert.equal(canonicalResourcePath('/agents/', ' data quality ', ' v1 / beta '), '/agents/data%20quality/v1%20%2F%20beta')
assert.equal(canonicalRoutes.agent('data_quality_agent', '1.0'), '/agents/data_quality_agent/1.0')
assert.equal(canonicalRoutes.agentRun('run/123'), '/agents/runs/run%2F123')
assert.equal(canonicalRoutes.agents, '/agents')
assert.equal(canonicalRoutes.monitoring, '/monitoring')
assert.equal(canonicalRoutes.pricingAuthority, '/pricing-authority')
assert.throws(() => canonicalResourcePath('agents', 'x'), /base paths must start with/)
assert.throws(() => canonicalResourcePath('/agents', '   '), /segments must be non-empty/)

console.log('PASS canonical resource route contract')
