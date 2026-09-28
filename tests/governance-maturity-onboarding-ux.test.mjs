import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const page = fs.readFileSync('app/journeys/governance-maturity/page.tsx', 'utf8')
const ui = fs.readFileSync('components/governance/maturity-onboarding.tsx', 'utf8')

test('maturity onboarding is authenticated and uses organization-scoped landing context', () => {
  assert.match(page, /requireUser/)
  assert.match(page, /resolveLandingAccess/)
  assert.match(page, /loadLatestMaturityAssessment/)
})

test('onboarding supports adaptive organization context, quick baseline, full assessment, and results', () => {
  assert.match(ui, /Organization context/)
  assert.match(ui, /Quick baseline/)
  assert.match(ui, /Full assessment/)
  assert.match(ui, /Results & roadmap/)
  assert.match(ui, /usesAi/)
  assert.match(ui, /crossBorderTransfers/)
})

test('maturity answer UX uses behavioral levels rather than yes or no', () => {
  assert.match(ui, /MATURITY_LEVELS\.map/)
  assert.match(ui, /Choose the statement that best matches current operating reality/)
  assert.doesNotMatch(ui, />Yes<|>No</)
})

test('results keep critical gaps, evidence, coverage, consensus and target state separate', () => {
  for (const label of ['Critical gaps', 'Evidence confidence', 'Control coverage', 'Assessment consensus', 'Target maturity']) {
    assert.match(ui, new RegExp(label))
  }
  assert.match(ui, /not legal advice, regulatory certification/)
})

test('non-admin members cannot initialize organization assessment context', () => {
  assert.match(ui, /!data\.assessment && !data\.canManageProfile/)
  assert.match(ui, /assessment initialization is intentionally administrator controlled/)
})
