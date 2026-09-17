import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile('.github/workflows/r2-live-certification.yml', 'utf8')

test('R2 live certification is explicit, production-gated, and least privilege', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /environment:\s*production/)
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/)
  assert.doesNotMatch(workflow, /pull_request:|push:/)
})

test('R2 live certification uses injected secrets without printing them', () => {
  assert.match(workflow, /secrets\.CRON_SECRET/)
  assert.match(workflow, /secrets\.R2_CERTIFICATION_APP_URL/)
  assert.match(workflow, /Authorization: Bearer \$CRON_SECRET/)
  assert.doesNotMatch(workflow, /echo[^\n]*\$CRON_SECRET|printf[^\n]*\$CRON_SECRET/)
})

test('R2 live certification is bounded and fail-closed', () => {
  assert.match(workflow, /--fail-with-body/)
  assert.match(workflow, /--connect-timeout 10/)
  assert.match(workflow, /--max-time 60/)
  assert.match(workflow, /process\.exit\(2\)/)
})
