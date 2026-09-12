import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateExactMainCertificationWorkflow } from '../lib/release-assurance/exact-main-certification-contract.mjs'

const revalidatePath = new URL('../.github/workflows/p0-p4-revalidation.yml', import.meta.url)
const certifyPath = new URL('../.github/workflows/v6-operational-certification.yml', import.meta.url)

function fixture({ pushBranch = 'main', pullRequestBranch = 'main', jobName = 'revalidate' } = {}) {
  return `name: fixture\n\non:\n  push:\n    branches:\n      - ${pushBranch}\n  pull_request:\n    branches:\n      - ${pullRequestBranch}\n\npermissions:\n  contents: read\n\njobs:\n  ${jobName}:\n    runs-on: ubuntu-latest\n`
}

test('revalidate workflow certifies the exact protected main SHA after merge', async () => {
  const source = await readFile(revalidatePath, 'utf8')
  const result = validateExactMainCertificationWorkflow(source, { jobName: 'revalidate' })
  assert.deepEqual(result, { valid: true, failures: [] })
})

test('certify workflow certifies the exact protected main SHA after merge', async () => {
  const source = await readFile(certifyPath, 'utf8')
  const result = validateExactMainCertificationWorkflow(source, { jobName: 'certify' })
  assert.deepEqual(result, { valid: true, failures: [] })
})

test('fails closed when push-to-main certification is removed', () => {
  const result = validateExactMainCertificationWorkflow(fixture({ pushBranch: 'release' }), { jobName: 'revalidate' })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /pushes to protected main/)
})

test('fails closed when PR validation for main is removed', () => {
  const result = validateExactMainCertificationWorkflow(fixture({ pullRequestBranch: 'release' }), { jobName: 'revalidate' })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /pull_request validation for main/)
})

test('fails closed when the required check context is renamed', () => {
  const result = validateExactMainCertificationWorkflow(fixture({ jobName: 'other' }), { jobName: 'certify' })
  assert.equal(result.valid, false)
  assert.match(result.failures.join('\n'), /required check context certify/)
})
