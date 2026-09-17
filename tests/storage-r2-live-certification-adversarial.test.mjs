import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowPath = new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url)
const workflow = await readFile(workflowPath, 'utf8')

const certification = workflow.slice(workflow.indexOf('  live-production-certification:'))

test('certification job cannot execute on ordinary PR or push events', () => {
  assert.match(certification, /if: github\.event_name == 'workflow_dispatch'/)
  assert.doesNotMatch(certification, /pull_request_target|schedule:/)
})

test('certification target is fixed rather than workflow-input controlled', () => {
  assert.match(certification, /"\$APP_URL\/api\/internal\/storage\/certify-r2"/)
  assert.doesNotMatch(certification, /inputs\.|github\.event\.inputs/)
})

test('credential-bearing job has no persistence or debug escape hatch', () => {
  assert.doesNotMatch(certification, /GITHUB_ENV|GITHUB_OUTPUT|upload-artifact|actions\/cache/)
  assert.doesNotMatch(certification, /set -x|\bprintenv\b|\benv\s*$/m)
})
