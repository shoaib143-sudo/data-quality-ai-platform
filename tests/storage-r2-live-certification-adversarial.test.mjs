import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile('.github/workflows/r2-live-certification.yml', 'utf8')

test('live certification cannot be triggered by untrusted repository events', () => {
  assert.doesNotMatch(workflow, /^\s*(push|pull_request|pull_request_target|schedule):/m)
})

test('live certification does not persist or export credentials', () => {
  assert.doesNotMatch(workflow, /GITHUB_ENV|GITHUB_OUTPUT|upload-artifact|actions\/cache/)
  assert.doesNotMatch(workflow, /set -x|env\s*$|printenv/)
})

test('live certification endpoint is fixed and not user-supplied workflow input', () => {
  assert.doesNotMatch(workflow, /inputs\./)
  assert.match(workflow, /"\$APP_URL\/api\/internal\/storage\/certify-r2"/)
})
