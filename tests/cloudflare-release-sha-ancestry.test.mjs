import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(new URL('../.github/workflows/release-governance.yml', import.meta.url), 'utf8')

test('Cloudflare preflight and deployment candidates must be reachable from protected main', () => {
  const occurrences = workflow.match(/git merge-base --is-ancestor "\$REQUESTED_SHA" origin\/main/g) ?? []
  assert.ok(occurrences.length >= 4, `expected ancestry enforcement in both preflight and deployment jobs, got ${occurrences.length}`)
  assert.match(workflow, /git fetch --no-tags origin main/)
  assert.match(workflow, /candidate SHA is not reachable from protected main/)
  assert.match(workflow, /release SHA is not reachable from protected main/)
})

test('Cloudflare ancestry checks preserve exact checked-out SHA verification', () => {
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$REQUESTED_SHA"/)
  assert.match(workflow, /test "\$HEAD_SHA" = "\$REQUESTED_SHA"/)
  assert.doesNotMatch(workflow, /git checkout origin\/main/)
})
