import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../app/datasets/dataset-actions.tsx', import.meta.url), 'utf8')

const onboardingBranch = source.match(/if \(primaryBlocker === 'READINESS_RULE_NOT_ONBOARDED'\) \{([\s\S]*?)\n    \}/)?.[1] ?? ''
assert.ok(onboardingBranch, 'onboarding blocker must have an explicit UX branch')
assert.doesNotMatch(onboardingBranch, /canonicalRoutes\./, 'onboarding blocker must not route into an unrelated workspace')
assert.match(onboardingBranch, /href: null/, 'onboarding blocker must fail closed without a self-service link')

const fallback = source.match(/return \{\n      href: null,\n      label: primaryRemediation\?\.manual_action/)?.[0] ?? ''
assert.ok(fallback, 'unknown blockers must fail closed without a guessed route')

assert.doesNotMatch(source, /READINESS_RULE_NOT_ONBOARDED[^\n]*canonicalRoutes\.datasetEdit/)
assert.doesNotMatch(source, /READINESS_RULE_NOT_ONBOARDED[^\n]*canonicalRoutes\.sourceEdit/)

console.log('Adversarial profile readiness remediation UX audit passed.')
