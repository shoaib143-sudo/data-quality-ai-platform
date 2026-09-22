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
    '/\n//evil.example',
    '/\r//evil.example',
  ]) {
    assert.equal(safeAuthReturnPath(value), '/dashboard', String(value))
  }
})

test('safeAuthReturnPath accepts a safe caller-provided fallback', () => {
  assert.equal(safeAuthReturnPath('//evil.example', '/home'), '/home')
})

test('safeAuthReturnPath fails closed when the fallback is also unsafe', () => {
  for (const fallback of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\n//evil.example',
  ]) {
    assert.equal(safeAuthReturnPath('//evil.example', fallback), '/dashboard', fallback)
  }
})
