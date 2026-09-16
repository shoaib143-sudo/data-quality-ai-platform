import assert from 'node:assert/strict'
import test from 'node:test'
import { assertIndependentCertificationProducer } from '../lib/orchestration/certification-independence.ts'

test('independent certification permits a different authenticated reviewer', () => {
  assert.doesNotThrow(() => assertIndependentCertificationProducer({
    executionActorUserId: 'implementation-user',
    certifierUserId: 'reviewer-user',
  }))
})

test('independent certification rejects self-certification by the implementation producer', () => {
  assert.throws(() => assertIndependentCertificationProducer({
    executionActorUserId: 'same-user',
    certifierUserId: 'same-user',
  }), /reviewer different from the implementation producer/)
})

test('independent certification fails closed when producer identity is missing', () => {
  assert.throws(() => assertIndependentCertificationProducer({
    executionActorUserId: null,
    certifierUserId: 'reviewer-user',
  }), /implementation producer identity is unavailable/)
})

test('independent certification fails closed when reviewer identity is missing', () => {
  assert.throws(() => assertIndependentCertificationProducer({
    executionActorUserId: 'implementation-user',
    certifierUserId: '   ',
  }), /reviewer identity is required/)
})
