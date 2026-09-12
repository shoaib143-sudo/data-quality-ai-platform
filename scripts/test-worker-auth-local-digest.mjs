import assert from 'node:assert/strict'

import {
  isAuthorizedWorkerBearer,
  matchesSecretDigest,
  secretsEqual,
} from '../lib/orchestration/worker-auth.ts'

const fixtureSecret = 'test-worker-secret'
const fixtureDigest = '4525f717dfd17fe2ebd15b3ef2105ae3dc6224ca7fd55bb200eaefdb3a1604cb'

assert.equal(matchesSecretDigest(fixtureSecret, fixtureDigest), true, 'matching SHA-256 bearer must validate')
assert.equal(matchesSecretDigest('wrong-secret', fixtureDigest), false, 'wrong bearer must fail')
assert.equal(matchesSecretDigest('', fixtureDigest), false, 'empty bearer must fail')
assert.equal(matchesSecretDigest(fixtureSecret, 'not-a-digest'), false, 'malformed expected digest must fail')

assert.equal(secretsEqual('same-secret', 'same-secret'), true, 'equal secrets must match')
assert.equal(secretsEqual('same-secret', 'other-secret'), false, 'different secrets must not match')
assert.equal(secretsEqual('', 'other-secret'), false, 'empty secret must fail')

assert.equal(isAuthorizedWorkerBearer('cron-secret', 'cron-secret'), true, 'configured CRON_SECRET must authorize locally')
assert.equal(isAuthorizedWorkerBearer('wrong-secret', 'cron-secret'), false, 'unknown bearer must fail closed')
assert.equal(isAuthorizedWorkerBearer('', 'cron-secret'), false, 'missing bearer must fail closed')

console.log('Worker bearer local digest tests passed.')
