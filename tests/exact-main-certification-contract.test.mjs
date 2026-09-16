import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateExactMainCertificationWorkflow } from '../lib/release-assurance/exact-main-certification-contract.mjs'

const revalidatePath = new URL('../.github/workflows/p0-p4-revalidation.yml', import.meta.url)
const certifyPath = new URL('../.github/workflows/v6-operational-certification.yml', import.meta.url)

function fixture({
  pushBranch = 'main',
  pullRequestBranch = 'main',
  prJobName = 'revalidate',
  postMergeJobName = 'revalidate-full',
  prCondition = "github.event_name == 'pull_request'",
  postMergeCondition = "github.event_name != 'pull_request'",
  checkoutRef = null,
  substantiveCommand = 'node scripts/full-certification.mjs',
} = {}) {
  return `name: fixture\n\non:\n  push:\n    branches:\n      - ${pushBranch}\n  pull_request:\n    branches:\n      - ${pullRequestBranch}\n\npermissions:\n  contents: read\n\njobs:\n  ${prJobName}:\n    if: ${prCondition}\n    runs-on: ubuntu-latest\n  ${postMergeJobName}:\n    if: ${postMergeCondition}\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout\n        uses: actions/checkout@deadbeef${checkoutRef ? `\n        with:\n          ref: ${checkoutRef}` : ''}\n      - run: ${substantiveCommand}\n`
}

test('P0-P5 workflow preserves fast PR sentinel and exact-main full certification', async () => {
  const source = await readFile(revalidatePath, 'utf8')
  const result = validateExactMainCertificationWorkflow(source, {
    prJobName: 'revalidate',
    postMergeJobName: 'revalidate-full',
    expectedPostMergeCommands: [
      'node scripts/verify-p0-p4-revalidation.mjs',
      'pnpm run verify:recovery-assurance',
      'pnpm exec tsc --noEmit',
      'pnpm run build',
    ],
  })
  assert.deepEqual(result, { valid: true, failures: [] })
})

test('V6 workflow preserves fast PR sentinel and exact-main full certification', async () => {
  const source = await readFile(certifyPath, 'utf8')
  const result = validateExactMainCertificationWorkflow(source, {
    prJobName: 'certify',
    postMergeJobName: 'certify-full',
    expectedPostMergeCommands: [
      'node scripts/verify-journey-operational-certification.mjs',
      'pnpm run verify:execution-controller',
      'node scripts/verify-migration-version-uniqueness.mjs',
      'pnpm run build',
    ],
  })
  assert.deepEqual(result, { valid: true, failures: [] })
})

test('V6 runtime SLO preserves the substantive post-merge benchmark', async () => {
  const source = await readFile(certifyPath, 'utf8')
  const result = validateExactMainCertificationWorkflow(source, {
    prJobName: 'runtime-slo',
    postMergeJobName: 'post-merge-runtime-slo',
    expectedPostMergeCommands: ['pnpm run benchmark:production'],
  })
  assert.deepEqual(result, { valid: true, failures: [] })
})

test('V6 database reconstruction preserves substantive clean replay commands', async () => {
  const source = await readFile(certifyPath, 'utf8')
  const result = validateExactMainCertificationWorkflow(source, {
    prJobName: 'clean-database-reconstruction',
    postMergeJobName: 'post-merge-clean-database-reconstruction',
    expectedPostMergeCommands: [
      'pnpm dlx supabase@2.117.0 db reset --local',
      'assert-synthetic-governance-suite.sql',
    ],
  })
  assert.deepEqual(result, { valid: true, failures: [] })
})

test('fails closed when push-to-main certification is removed', () => {
  const result = validateExactMainCertificationWorkflow(fixture({ pushBranch: 'release' }), {
    prJobName: 'revalidate', postMergeJobName: 'revalidate-full',
  })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /pushes to protected main/)
})

test('fails closed when PR validation for main is removed', () => {
  const result = validateExactMainCertificationWorkflow(fixture({ pullRequestBranch: 'release' }), {
    prJobName: 'revalidate', postMergeJobName: 'revalidate-full',
  })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /pull_request validation for main/)
})

test('fails closed when the PR sentinel context is renamed', () => {
  const result = validateExactMainCertificationWorkflow(fixture({ prJobName: 'other' }), {
    prJobName: 'revalidate', postMergeJobName: 'revalidate-full',
  })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /required PR check context revalidate/)
})

test('fails closed when the substantive post-merge job is absent', () => {
  const source = fixture({ postMergeJobName: 'other-full' })
  const result = validateExactMainCertificationWorkflow(source, {
    prJobName: 'revalidate', postMergeJobName: 'revalidate-full',
  })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /full post-merge certification job revalidate-full/)
})

test('fails closed when post-merge certification is accidentally PR-only', () => {
  const result = validateExactMainCertificationWorkflow(fixture({ postMergeCondition: "github.event_name == 'pull_request'" }), {
    prJobName: 'revalidate', postMergeJobName: 'revalidate-full',
  })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /must run outside pull_request events/)
})

test('fails closed when post-merge checkout overrides the triggering SHA', () => {
  const result = validateExactMainCertificationWorkflow(fixture({ checkoutRef: 'main' }), {
    prJobName: 'revalidate', postMergeJobName: 'revalidate-full',
  })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /without a ref override/)
})

test('fails closed when a substantive post-merge command is replaced by a sentinel', () => {
  const result = validateExactMainCertificationWorkflow(fixture({ substantiveCommand: 'echo certification retained' }), {
    prJobName: 'revalidate',
    postMergeJobName: 'revalidate-full',
    expectedPostMergeCommands: ['node scripts/full-certification.mjs'],
  })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /must retain substantive command: node scripts\/full-certification\.mjs/)
})
