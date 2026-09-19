import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url), 'utf8')

test('R2 assurance runs after protected main changes instead of legacy integration branches', () => {
  const pushBlock = workflow.slice(workflow.indexOf('  push:'), workflow.indexOf('  pull_request:'))
  assert.match(pushBlock, /branches:\s*\n\s*- main/)
  assert.doesNotMatch(pushBlock, /r2-prereq-hardening-20260916|r2-main-reconcile-20260917/)
})

test('R2 assurance path coverage includes Cloudflare runtime, release governance, and large-object profiling', () => {
  assert.match(workflow, /tests\/cloudflare-\*\.test\.mjs/)
  assert.match(workflow, /tests\/profiling-large-object-bounded-read\.test\.mjs/)
  assert.match(workflow, /\.github\/workflows\/release-governance\.yml/)
  assert.match(workflow, /package\.json/)
})

test('R2 assurance executes Cloudflare and bounded large-object contracts with storage tests', () => {
  assert.match(workflow, /node --test tests\/storage-\*\.test\.mjs/)
  assert.match(workflow, /node --test tests\/cloudflare-\*\.test\.mjs tests\/profiling-large-object-bounded-read\.test\.mjs/)
})
