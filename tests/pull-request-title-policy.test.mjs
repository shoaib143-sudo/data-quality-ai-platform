import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePullRequestTitle } from '../lib/release-assurance/pull-request-title-policy.mjs'

for (const title of [
  'fix(ci): Preserve protected main certification runs',
  'security: Enforce immutable workflow actions',
  'feat!: Require governed repository controls',
]) {
  test(`accepts merge-ready title: ${title}`, () => {
    assert.deepEqual(validatePullRequestTitle(title), { valid: true, failures: [] })
  })
}

for (const [title, expected] of [
  ['', /required/],
  ['WIP fix the workflow', /WIP/],
  ['Fix the workflow', /allowed type/],
  ['fix: lowercase summary', /capitalized/],
  ['fix: Ends with a period.', /period/],
  [`fix: ${'A'.repeat(116)}`, /120/],
]) {
  test(`rejects unsafe title: ${title || '<empty>'}`, () => {
    const result = validatePullRequestTitle(title)
    assert.equal(result.valid, false)
    assert.match(result.failures.join('\n'), expected)
  })
}
