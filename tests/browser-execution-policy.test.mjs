import test from 'node:test'
import assert from 'node:assert/strict'
import { assertBrowserExecutionPolicy } from '../lib/browser-execution/policy.ts'

const base = {
  runId: 'run-1',
  projectId: 'project-1',
  task: 'Verify governed asset state',
  startUrl: 'https://example.com/catalog',
  allowedOrigins: ['https://example.com'],
  risk: 'READ_ONLY',
}

test('browser policy admits an explicitly allowlisted origin', () => {
  const result = assertBrowserExecutionPolicy(base)
  assert.equal(result.startOrigin, 'https://example.com')
  assert.equal(result.timeoutMs, 120000)
})

test('browser policy blocks navigation outside the allowlist', () => {
  assert.throws(
    () => assertBrowserExecutionPolicy({ ...base, startUrl: 'https://evil.example/' }),
    /not allowlisted/,
  )
})

test('browser policy rejects embedded credentials', () => {
  assert.throws(
    () => assertBrowserExecutionPolicy({ ...base, startUrl: 'https://user:secret@example.com/' }),
    /Credentials must not be embedded/,
  )
})

test('high risk browser execution fails closed without approval', () => {
  assert.throws(
    () => assertBrowserExecutionPolicy({ ...base, risk: 'HIGH' }),
    /requires an approval/,
  )
})

test('high risk browser execution admits a bound approval', () => {
  assert.doesNotThrow(() => assertBrowserExecutionPolicy({ ...base, risk: 'HIGH', approvalId: 'approval-1' }))
})
