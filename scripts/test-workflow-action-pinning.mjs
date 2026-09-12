import assert from 'node:assert/strict'
import { isImmutableActionRef } from './verify-workflow-action-pinning.mjs'

const exactCommit = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262'
const dockerDigest = `docker://alpine@sha256:${'a'.repeat(64)}`

assert.equal(isImmutableActionRef(exactCommit), true, 'exact remote commit must pass')
assert.equal(isImmutableActionRef(dockerDigest), true, 'Docker digest pin must pass')
assert.equal(isImmutableActionRef('./.github/actions/local-check'), true, 'local action must pass')

for (const mutable of [
  'actions/checkout@v4',
  'actions/checkout@main',
  'docker://alpine:latest',
  '${{ matrix.action }}',
  'pnpm/action-setup@v4',
]) {
  assert.equal(isImmutableActionRef(mutable), false, `${mutable} must fail immutable-action validation`)
}

console.log('Workflow action pinning unit tests passed (positive and negative cases).')
