import assert from 'node:assert/strict'
import test from 'node:test'
import { parseJson, parseJsonLines } from '../lib/profiling/json-source.ts'

test('nested JSON objects and arrays remain structured values', () => {
  const parsed = parseJson('[{"id":1,"profile":{"tier":"gold"},"tags":["a","b"]}]', 10)
  assert.deepEqual(parsed.rows, [{ record_index: 1, id: 1, profile: { tier: 'gold' }, tags: ['a', 'b'] }])
})

test('top-level JSON primitives and null are wrapped instead of discarded', () => {
  assert.deepEqual(parseJson('null', 10).rows, [{ record_index: 1, value: null }])
  assert.deepEqual(parseJson('42', 10).rows, [{ record_index: 1, value: 42 }])
  assert.deepEqual(parseJson('"hello"', 10).rows, [{ record_index: 1, value: 'hello' }])
})

test('empty JSON arrays are valid zero-row sources', () => {
  const parsed = parseJson('[]', 10)
  assert.equal(parsed.rowCount, 0)
  assert.deepEqual(parsed.rows, [])
})

test('malformed JSON fails closed with a source-specific error', () => {
  assert.throws(() => parseJson('{"id":1', 10), /Invalid JSON source:/)
})

test('JSON row limits preserve total source row count', () => {
  const parsed = parseJson('[{"id":1},{"id":2},{"id":3}]', 2)
  assert.equal(parsed.rowCount, 3)
  assert.deepEqual(parsed.rows, [{ record_index: 1, id: 1 }, { record_index: 2, id: 2 }])
  assert.equal(parsed.warnings.length, 1)
})

test('JSONL blank lines do not create rows and record indexes stay contiguous', () => {
  const parsed = parseJsonLines('{"id":1}\n\n{"id":2}\n', 10)
  assert.deepEqual(parsed.rows, [{ record_index: 1, id: 1 }, { record_index: 2, id: 2 }])
})

test('malformed JSONL reports the physical source line', () => {
  assert.throws(
    () => parseJsonLines('{"id":1}\n\n{"id":broken}\n', 10),
    /Invalid JSONL source at line 3:/,
  )
})

test('JSONL row limits preserve total source row count', () => {
  const parsed = parseJsonLines('{"id":1}\n{"id":2}\n{"id":3}\n', 1)
  assert.equal(parsed.rowCount, 3)
  assert.deepEqual(parsed.rows, [{ record_index: 1, id: 1 }])
  assert.equal(parsed.warnings.length, 1)
})
