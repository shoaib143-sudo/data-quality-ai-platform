import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowPath = new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url)
const workflow = await readFile(workflowPath, 'utf8')

test('live R2 certification is explicit and production gated', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /live-production-certification:/)
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch'/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /permissions:\n  contents: read/)
})

test('live R2 certification consumes secrets without persisting them', () => {
  assert.match(workflow, /secrets\.R2_CERTIFICATION_APP_URL/)
  assert.match(workflow, /secrets\.CRON_SECRET/)
  assert.match(workflow, /Authorization: Bearer \$CRON_SECRET/)
  assert.doesNotMatch(workflow, /GITHUB_ENV|GITHUB_OUTPUT|upload-artifact|actions\/cache|set -x|printenv/)
})

test('live R2 certification is bounded and fail closed', () => {
  assert.match(workflow, /--fail-with-body/)
  assert.match(workflow, /--connect-timeout 10 --max-time 60/)
  assert.match(workflow, /\/api\/internal\/storage\/certify-r2/)
  assert.match(workflow, /unsafe=\["error","secret","token","credential"\]/)
  assert.match(workflow, /process\.exit\(2\)/)
})
