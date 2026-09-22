import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/admin/learning-cases/page.tsx','utf8')
const manager = fs.readFileSync('app/admin/learning-cases/positive-learning-case-review-manager.tsx','utf8')

test('learning governance exposes review posture', () => {
  assert.match(page, /Learning review posture/)
  assert.match(page, /Pending candidates/)
  assert.match(page, /Supervised successes/)
  assert.match(page, /Handsfree successes/)
  assert.match(page, /Repeated patterns/)
})

test('learning promotion links back to source execution evidence', () => {
  assert.match(manager, /Source run/)
  assert.match(manager, /sourceAgentRunId/)
  assert.match(manager, /Learning is a governed promotion, not automatic self-modification/)
  assert.match(manager, /Verification evidence/)
  assert.match(manager, /Do not reuse when/)
})
