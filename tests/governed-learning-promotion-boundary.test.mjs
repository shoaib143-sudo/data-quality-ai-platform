import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const approval = fs.readFileSync('lib/agents/governed-learning-release-approval.ts','utf8')
const release = fs.readFileSync('lib/agents/governed-learning-controlled-release.ts','utf8')
const policy = fs.readFileSync('lib/agents/governed-learning-policy.ts','utf8')
const negative = fs.readFileSync('lib/agents/governed-negative-case-learning.ts','utf8')

test('controlled release is exclusive to skill improvements', () => {
  assert.match(approval, /candidate_type/)
  assert.match(approval, /Only SKILL_IMPROVEMENT candidates may enter controlled release/)
  assert.match(release, /Positive and negative case memory cannot enter the controlled-release path/)
})

test('learning policies fail closed on authority and adversarial regressions', () => {
  assert.match(policy, /authority regression blocks learning promotion/)
  assert.match(policy, /adversarial regression blocks learning promotion/)
  assert.match(policy, /PRIVILEGED_OR_DESTRUCTIVE/)
  assert.match(policy, /automaticPromotionAllowed: false/)
})

test('failed governed runs can produce negative cases but successful runs cannot', () => {
  assert.match(negative, /if \(input\.run\.status === 'SUCCEEDED'\) return null/)
  assert.match(negative, /caseType: 'NEGATIVE_CASE'/)
  assert.match(negative, /agent_run:/)
})
