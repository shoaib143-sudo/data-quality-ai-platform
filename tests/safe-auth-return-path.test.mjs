import test from 'node:test'
import assert from 'node:assert/strict'

import { safeAuthReturnPath } from '../lib/auth/safe-auth-return-path.ts'

test('safeAuthReturnPath preserves same-origin application paths', () => {
  assert.equal(safeAuthReturnPath('/catalog'), '/catalog')
  assert.equal(safeAuthReturnPath('/catalog?q=customer#results'), '/catalog?q=customer#results')
  assert.equal(safeAuthReturnPath('/datasets/../catalog'), '/catalog')
})

test('safeAuthReturnPath rejects external and ambiguous redirect forms', () => {
  for (const value of [
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '/catalog\\..\\evil.example',
  ]) {
    assert.equal(safeAuthReturnPath(value), '/dashboard', String(value))
  }
})

test('safeAuthReturnPath honors a caller-provided safe fallback', () => {
  assert.equal(safeAuthReturnPath('//evil.example', '/home'), '/home')
})
