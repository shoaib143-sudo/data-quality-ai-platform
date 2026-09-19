import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/build-info/route.ts', import.meta.url), 'utf8')

test('build-info exposes immutable release identity without secrets', () => {
  for (const field of ['commitSha', 'environment', 'platform', 'buildTimestamp', 'releaseId']) {
    assert.match(route, new RegExp(field))
  }
  assert.match(route, /Cache-Control/)
  assert.match(route, /no-store/)
  assert.doesNotMatch(route, /SECRET|TOKEN|PASSWORD|KEY/)
})
