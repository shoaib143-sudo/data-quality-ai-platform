import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REQUIRED_CHECKS,
  validateMainRuleset,
  validateRequiredWorkflowSource,
} from '../lib/release-assurance/github-governance-contract.mjs'

const contract = { file: 'fixture.yml', name: 'Fixture', jobs: ['verify'] }
const validWorkflow = `name: Fixture

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: \${{ github.workflow }}-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps: []
`

function validRuleset() {
  return {
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      { type: 'required_linear_history' },
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 0,
          required_review_thread_resolution: true,
          dismiss_stale_reviews_on_push: true,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          do_not_enforce_on_create: false,
          required_status_checks: REQUIRED_CHECKS.map(context => ({ context })),
        },
      },
    ],
  }
}

test('accepts the complete required workflow contract', () => {
  assert.deepEqual(validateRequiredWorkflowSource(validWorkflow, contract), { valid: true, failures: [] })
})

for (const [label, mutate, expected] of [
  ['path-filtered required workflow', source => source.replace('branches: [main]\n  pull_request:', "branches: [main]\n    paths: ['src/**']\n  pull_request:"), /path filters/],
  ['main-run cancellation', source => source.replace("github.event_name == 'pull_request'", 'true'), /only superseded/],
  ['missing timeout', source => source.replace('    timeout-minutes: 10\n', ''), /positive timeout/],
  ['renamed check', source => source.replace('  verify:', '  changed:'), /verify is missing/],
]) {
  test(`rejects ${label}`, () => {
    const result = validateRequiredWorkflowSource(mutate(validWorkflow), contract)
    assert.equal(result.valid, false)
    assert.match(result.failures.join('\n'), expected)
  })
}

test('accepts the fail-closed main ruleset', () => {
  assert.deepEqual(validateMainRuleset(validRuleset()), { valid: true, failures: [] })
})

for (const [label, mutate, expected] of [
  ['ruleset bypass', ruleset => { ruleset.bypass_actors.push({ actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' }) }, /bypass/],
  ['force pushes', ruleset => { ruleset.rules = ruleset.rules.filter(rule => rule.type !== 'non_fast_forward') }, /non_fast_forward/],
  ['stale branch merge', ruleset => { ruleset.rules.find(rule => rule.type === 'required_status_checks').parameters.strict_required_status_checks_policy = false }, /current/],
  ['missing V6 check', ruleset => { ruleset.rules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks = [] }, /required status check/],
]) {
  test(`rejects ${label}`, () => {
    const ruleset = validRuleset()
    mutate(ruleset)
    const result = validateMainRuleset(ruleset)
    assert.equal(result.valid, false)
    assert.match(result.failures.join('\n'), expected)
  })
}
