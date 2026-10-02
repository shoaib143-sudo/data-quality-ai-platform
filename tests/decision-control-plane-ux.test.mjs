import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/admin/ai-command-center/page.tsx', 'utf8')
const control = fs.readFileSync('lib/ai/decision-control-plane-state.ts', 'utf8')

test('AI Command Center exposes governed decision control plane posture', () => {
  assert.match(page, /Decision Control Plane/)
  assert.match(page, /Semantic decisions remain evidence only/)
  assert.match(page, /shadow runtime/)
  assert.match(page, /Cannot grant capability or override DENY/)
  assert.match(page, /Semantic decisions cannot approve mutations/)
  assert.match(page, /Semantic confidence cannot promote enterprise truth/)
})

test('decision control plane authority remains closed in code', () => {
  assert.match(control, /semanticMayGrantCapability: false/)
  assert.match(control, /semanticMayOverrideDeny: false/)
  assert.match(control, /semanticMayApproveMutation: false/)
  assert.match(control, /semanticMayPromoteEvidence: false/)
})
